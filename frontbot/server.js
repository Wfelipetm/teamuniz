const {
    makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore,
    isJidBroadcast,
    Browsers,
} = require("@whiskeysockets/baileys");
const pino = require("pino");
const express = require("express");
const cors = require("cors");
const cron = require("node-cron");
const QRCode = require("qrcode");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");

const prisma = require("./prismaClient");
const {
    JWT_SECRET,
    requireSession,
    requireAdmin,
    requireStaff,
    validateLogin,
    validateRegister,
    authLimiter,
    generalLimiter,
    securityHeaders,
    requestLogger,
    errorHandler,
    auditLog,
} = require("./middleware");

const silentLogger = pino({ level: "silent" });

// ── Compatibilidade: migra auth_info/ plano → auth_info/<userId>/ ────────────
// Remove na próxima versão — migra sessão antiga (global) para userId=1 se existir
(function migrateOldAuthInfo() {
    const legacyDir = path.join(__dirname, "auth_info");
    const userDir = path.join(legacyDir, "1");
    if (!fs.existsSync(legacyDir)) return;
    // Se já existe um subdiretório numérico, já foi migrado
    if (fs.existsSync(userDir)) return;
    // Se há creds.json diretamente em auth_info/, migrate para auth_info/1/
    if (fs.existsSync(path.join(legacyDir, "creds.json"))) {
        fs.mkdirSync(userDir, { recursive: true });
        for (const f of fs.readdirSync(legacyDir)) {
            const src = path.join(legacyDir, f);
            if (fs.statSync(src).isFile()) {
                fs.renameSync(src, path.join(userDir, f));
            }
        }
        console.log("[MIGRATE] Sessão global movida para auth_info/1/");
    }
}());

// ── .env simples ─────────────────────────────────────────────────────────────
function loadEnv() {
    const envPath = path.join(__dirname, ".env");
    if (!fs.existsSync(envPath)) return;
    fs.readFileSync(envPath, "utf8")
        .split("\n")
        .forEach((line) => {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith("#")) return;
            const idx = trimmed.indexOf("=");
            if (idx === -1) return;
            const key = trimmed.slice(0, idx).trim();
            const val = trimmed.slice(idx + 1).trim();
            if (!process.env[key]) process.env[key] = val;
        });
}
loadEnv();

// ── Constantes ───────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3001;
const AUTH_BASE_DIR = path.join(__dirname, "auth_info");
const DAYS_PT = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
const MAX_FAILED_LOGINS = 5;
const LOCK_DURATION_MS = 15 * 60 * 1000; // 15 minutos
const MAX_QR_RETRIES = 5;

if (!fs.existsSync(AUTH_BASE_DIR)) fs.mkdirSync(AUTH_BASE_DIR, { recursive: true });

// ── Conexões por usuário ─────────────────────────────────────────────────────
const connections = new Map(); // userId (number) → state object

function getConn(userId) {
    if (!connections.has(userId)) {
        connections.set(userId, {
            sock: null,
            qrBase64: null,
            status: "disconnected",
            pairingCode: null,
            pairingAcknowledged: false,
            intentionalClose: false,
            socketId: 0,
            isConnecting: false,
            reconnectTimer: null,
            qrRetryCount: 0,
            cronJob: null,
            cronJobs: new Map(), // automationId → cronJob
        });
    }
    return connections.get(userId);
}

function authDirFor(userId) {
    const d = path.join(AUTH_BASE_DIR, String(userId));
    if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
    return d;
}

function scheduleReconnect(userId, pairingPhone = null, delayMs = 5000) {
    const conn = getConn(userId);
    if (conn.reconnectTimer) clearTimeout(conn.reconnectTimer);
    conn.reconnectTimer = setTimeout(() => {
        conn.reconnectTimer = null;
        connectWhatsApp(userId, pairingPhone);
    }, delayMs);
}

// ── Config por usuário (banco de dados) ──────────────────────────────────────
async function getUserConfig(userId) {
    let cfg = await prisma.userConfig.findUnique({ where: { userId } });
    if (!cfg) {
        cfg = await prisma.userConfig.create({ data: { userId } });
    }
    return cfg;
}

// ── Multer (memória) para fotos e envios ─────────────────────────────────────
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const memUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
        if (ALLOWED_TYPES.includes(file.mimetype)) cb(null, true);
        else cb(new Error("Tipo não permitido. Use JPG, PNG, WebP ou GIF."));
    },
});

// ── Baileys — conectar ao WhatsApp (por usuário) ────────────────────────────
async function connectWhatsApp(userId, pairingPhone = null) {
    const conn = getConn(userId);

    if (conn.isConnecting) {
        console.log(`[BOT:${userId}] ⏳ Já há uma conexão em andamento, ignorando.`);
        return;
    }
    conn.isConnecting = true;

    const mySocketId = ++conn.socketId;
    const userAuthDir = authDirFor(userId);

    const { state, saveCreds } = await useMultiFileAuthState(userAuthDir);
    const { version } = await fetchLatestBaileysVersion();

    if (mySocketId !== conn.socketId) {
        conn.isConnecting = false;
        return;
    }

    console.log(`[BOT:${userId}] Baileys WA v${version.join(".")}, modo=${pairingPhone ? "pareamento" : "reconexão/QR"}`);
    conn.status = "connecting";
    conn.pairingCode = null;
    conn.pairingAcknowledged = false;

    const socketLogger = pairingPhone ? pino({ level: "warn" }) : silentLogger;

    const newSock = makeWASocket({
        version,
        logger: socketLogger,
        printQRInTerminal: false,
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, socketLogger),
        },
        browser: Browsers.ubuntu("Chrome"),
        markOnlineOnConnect: false,
        shouldIgnoreJid: (jid) => isJidBroadcast(jid),
    });
    conn.sock = newSock;
    conn.isConnecting = false;

    if (pairingPhone && !state.creds.registered) {
        conn.status = "waiting_pairing";
        const requestCode = async (attempt = 1) => {
            if (mySocketId !== conn.socketId || !conn.sock) return;
            try {
                console.log(`[BOT:${userId}] 📲 Solicitando código para ${pairingPhone} (tentativa ${attempt}/3)...`);
                const code = await conn.sock.requestPairingCode(pairingPhone);
                if (mySocketId !== conn.socketId) return;
                conn.pairingCode = code;
                conn.status = "waiting_pairing";
                console.log(`[BOT:${userId}] ✅ Código de pareamento: ${code}`);
            } catch (err) {
                console.error(`[BOT:${userId}] ❌ Erro ao solicitar código (tentativa ${attempt}):`, err.message);
                if (attempt < 3 && mySocketId === conn.socketId) {
                    setTimeout(() => requestCode(attempt + 1), 4000);
                } else {
                    conn.status = "disconnected";
                }
            }
        };
        setTimeout(() => requestCode(1), 5000);
    }

    newSock.ev.on("messages.upsert", async ({ messages, type }) => {
        console.log(`[BOT:${userId}] messages.upsert type=${type} count=${messages.length}`);
        if (type !== "notify") return;
        for (const msg of messages) {
            const jid = msg.key.remoteJid || "";
            const fromMe = msg.key.fromMe;
            const isGroup = jid.endsWith("@g.us");
            const isBroadcast = isJidBroadcast(jid);
            const isNewsletter = jid.endsWith("@newsletter");
            console.log(`[BOT:${userId}] msg jid=${jid} fromMe=${fromMe} group=${isGroup} broadcast=${isBroadcast} newsletter=${isNewsletter}`);
            if (fromMe) continue;
            if (isGroup) continue;
            if (isBroadcast) continue;
            if (isNewsletter) continue;
            await handleFlowMessage(userId, newSock, msg).catch(err =>
                console.error(`[FLOW:${userId}] Erro ao processar mensagem:`, err.message)
            );
        }
    });

    newSock.ev.on("creds.update", async (creds) => {
        await saveCreds();
        if (creds?.registered || state.creds?.registered) {
            conn.pairingAcknowledged = true;
            console.log(`[BOT:${userId}] ✅ Pareamento reconhecido — credenciais salvas`);
        }
    });

    newSock.ev.on("connection.update", async (update) => {
        if (mySocketId !== conn.socketId) return;

        const { connection, lastDisconnect, qr } = update;

        if (qr && !pairingPhone) {
            conn.qrBase64 = await QRCode.toDataURL(qr);
            conn.status = "waiting_qr";
            console.log(`[BOT:${userId}] QR Code gerado`);
        }

        if (connection === "open") {
            conn.isConnecting = false;
            conn.status = "open";
            conn.qrBase64 = null;
            conn.pairingCode = null;
            conn.qrRetryCount = 0;
            if (conn.reconnectTimer) { clearTimeout(conn.reconnectTimer); conn.reconnectTimer = null; }
            console.log(`[BOT:${userId}] ✅ Conectado ao WhatsApp!`);
            startSchedulerForUser(userId);
            startExtraSchedulersForUser(userId);
        }

        if (connection === "close") {
            conn.isConnecting = false;
            conn.status = "disconnected";
            conn.pairingCode = null;
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            console.log(`[BOT:${userId}] Conexão fechada. Código: ${statusCode}`);

            if (conn.intentionalClose) {
                conn.intentionalClose = false;
                return;
            }

            if (statusCode === DisconnectReason.loggedOut) {
                console.log(`[BOT:${userId}] 🔐 Sessão expirada (401). Limpando...`);
                conn.status = "logged_out";
                fs.rmSync(userAuthDir, { recursive: true, force: true });
                fs.mkdirSync(userAuthDir, { recursive: true });
                scheduleReconnect(userId, null, 3000);
            } else if (statusCode === DisconnectReason.connectionReplaced) {
                console.log(`[BOT:${userId}] ⚠️  Conexão substituída (440) — reconectando em 8s...`);
                scheduleReconnect(userId, pairingPhone, 8000);
            } else if (statusCode === 515) {
                if (pairingPhone) {
                    const credsPath = path.join(userAuthDir, "creds.json");
                    let credsRegistered = false;
                    if (fs.existsSync(credsPath)) {
                        try { credsRegistered = !!JSON.parse(fs.readFileSync(credsPath, "utf8")).registered; } catch { }
                    }
                    if (conn.pairingAcknowledged || credsRegistered) {
                        console.log(`[BOT:${userId}] 🔄 Reconectando após pareamento (515)...`);
                        scheduleReconnect(userId, null, 3000);
                    } else {
                        console.log(`[BOT:${userId}] 🔑 Código de pareamento expirou (515). Gerando novo...`);
                        fs.rmSync(userAuthDir, { recursive: true, force: true });
                        fs.mkdirSync(userAuthDir, { recursive: true });
                        scheduleReconnect(userId, pairingPhone, 3000);
                    }
                } else {
                    conn.qrRetryCount++;
                    if (conn.qrRetryCount >= MAX_QR_RETRIES) {
                        console.log(`[BOT:${userId}] ⛔ Máximo de tentativas QR atingido.`);
                        conn.status = "disconnected";
                        conn.qrBase64 = null;
                        return;
                    }
                    const delay = Math.min(3000 * conn.qrRetryCount, 15000);
                    console.log(`[BOT:${userId}] 🔄 QR expirou (515). Tentativa ${conn.qrRetryCount}/${MAX_QR_RETRIES}...`);
                    scheduleReconnect(userId, null, delay);
                }
            } else {
                if (conn.pairingAcknowledged) {
                    scheduleReconnect(userId, null, 3000);
                } else {
                    scheduleReconnect(userId, pairingPhone, 5000);
                }
            }
        }
    });
}

// ── Fluxo de atendimento (bot de vendas) ────────────────────────────────────

async function getFlowConfig(userId) {
    let cfg = await prisma.flowConfig.findUnique({
        where: { userId },
        include: { menuItems: { orderBy: { sortOrder: "asc" } } },
    });
    if (!cfg) {
        cfg = await prisma.flowConfig.create({
            data: { userId },
            include: { menuItems: { orderBy: { sortOrder: "asc" } } },
        });
    }
    return cfg;
}

function isInAttendanceHours(cfg) {
    const now = new Date();
    const hour = now.getHours();
    return hour >= cfg.attendanceStart && hour < cfg.attendanceEnd;
}

async function sendFlowText(sock, jid, text) {
    await sock.sendMessage(jid, { text });
}

// items = array explícito de itens a exibir; usa raiz se omitido
function buildMenuText(cfg, items) {
    const list = items ?? cfg.menuItems.filter(i => !i.parentId);
    if (!list.length) return cfg.menuMessage;
    const lines = list.map((item, i) => `*${i + 1}.* ${item.label}`);
    return `${cfg.menuMessage}\n\n${lines.join("\n")}\n\n_Digite o número da opção desejada._`;
}

async function handleFlowMessage(userId, sock, msg) {
    const cfg = await getFlowConfig(userId);
    if (!cfg.enabled) return;

    const jid = msg.key.remoteJid;
    const text = (
        msg.message?.conversation ||
        msg.message?.extendedTextMessage?.text ||
        ""
    ).trim();

    if (!text) return;

    // Busca ou cria lead
    let lead = await prisma.flowLead.findUnique({ where: { userId_phone: { userId, phone: jid } } });
    const isNew = !lead;
    if (!lead) {
        lead = await prisma.flowLead.create({ data: { userId, phone: jid, step: "welcome" } });
    }

    // Atualiza último contato
    await prisma.flowLead.update({ where: { id: lead.id }, data: { lastContact: new Date() } });

    // Se fora do horário e ainda não converteu
    if (!lead.converted && !isInAttendanceHours(cfg)) {
        await sendFlowText(sock, jid, cfg.offHoursMessage);
        return;
    }

    const step = isNew ? "welcome" : lead.step;

    // currentParentId: null = raiz, número = dentro do sub-menu desse item
    const currentParentId = lead.selectedItem ?? null;

    if (step === "welcome" || step === "menu") {
        if (isNew || step === "welcome") {
            await sendFlowText(sock, jid, cfg.welcomeMessage);
            await new Promise(r => setTimeout(r, 800));
        }
        const rootItems = cfg.menuItems.filter(i => !i.parentId);
        if (rootItems.length > 0) {
            await sendFlowText(sock, jid, buildMenuText(cfg, rootItems));
            await prisma.flowLead.update({ where: { id: lead.id }, data: { step: "choosing", selectedItem: null } });
        }
        return;
    }

    if (step === "choosing") {
        // Itens do nível atual (parentId nulo = raiz)
        const parentIdFilter = lead.selectedItem ?? null;
        const items = cfg.menuItems.filter(i => (i.parentId ?? null) === parentIdFilter);

        if (!items.length) {
            // Nível sem itens — volta à raiz
            const rootItems = cfg.menuItems.filter(i => !i.parentId);
            await sendFlowText(sock, jid, buildMenuText(cfg, rootItems));
            await prisma.flowLead.update({ where: { id: lead.id }, data: { step: "choosing", selectedItem: null } });
            return;
        }

        const choice = parseInt(text);
        if (isNaN(choice) || choice < 1 || choice > items.length) {
            await sendFlowText(sock, jid, `Por favor, digite um número entre 1 e ${items.length}. 😊\n\n${buildMenuText(cfg, items)}`);
            return;
        }

        const selected = items[choice - 1];
        const hasChildren = cfg.menuItems.some(i => (i.parentId ?? null) === selected.id);

        if (hasChildren) {
            // Tem sub-menu — desce um nível
            const children = cfg.menuItems.filter(i => (i.parentId ?? null) === selected.id);
            let menuText = `*${selected.label}*`;
            if (selected.description) menuText += `\n\n${selected.description}`;
            menuText += `\n\n${buildMenuText(cfg, children)}`;
            await sendFlowText(sock, jid, menuText);
            await prisma.flowLead.update({
                where: { id: lead.id },
                data: { step: "choosing", selectedItem: selected.id },
            });
            console.log(`[FLOW:${userId}] 📂 Lead ${jid} entrou em "${selected.label}"`);
        } else if (selected.isHuman) {
            // Folha → transfere para humano
            await sendFlowText(sock, jid, cfg.humanMessage);
            await prisma.flowLead.update({
                where: { id: lead.id },
                data: { step: "transferred", converted: true, selectedItem: selected.id },
            });
            console.log(`[FLOW:${userId}] 🎯 Lead ${jid} escolheu "${selected.label}" — transferido`);
        } else {
            // Folha informativa — mostra detalhes e oferece próxima ação
            let replyMsg = `*${selected.label}*`;
            if (selected.description) replyMsg += `\n\n${selected.description}`;
            if (selected.price) replyMsg += `\n\n💰 *Investimento:* ${selected.price}`;
            replyMsg += `\n\nDigite *1* para falar com um especialista ou *0* para voltar ao menu.`;
            await sendFlowText(sock, jid, replyMsg);
            await prisma.flowLead.update({
                where: { id: lead.id },
                data: { step: "post_virtual", selectedItem: selected.id },
            });
            console.log(`[FLOW:${userId}] 🤖 Lead ${jid} viu detalhes de "${selected.label}"`);
        }
        return;
    }

    if (step === "post_virtual") {
        const t = text.toLowerCase();
        if (text === "0" || t.includes("voltar") || t.includes("menu") || t.includes("não") || t.includes("nao")) {
            // Volta ao nível pai do item atual
            const currentItem = cfg.menuItems.find(i => i.id === lead.selectedItem);
            const parentId = currentItem?.parentId ?? null;
            const parentItems = cfg.menuItems.filter(i => (i.parentId ?? null) === parentId);
            await prisma.flowLead.update({ where: { id: lead.id }, data: { step: "choosing", selectedItem: parentId } });
            if (parentId) {
                const parentItem = cfg.menuItems.find(i => i.id === parentId);
                let menuText = parentItem ? `*${parentItem.label}*\n\n` : "";
                menuText += buildMenuText(cfg, parentItems);
                await sendFlowText(sock, jid, menuText);
            } else {
                await sendFlowText(sock, jid, buildMenuText(cfg, cfg.menuItems.filter(i => !i.parentId)));
            }
            return;
        }
        if (text === "1" || t.includes("falar") || t.includes("quero") || t.includes("sim")) {
            await sendFlowText(sock, jid, cfg.humanMessage);
            await prisma.flowLead.update({
                where: { id: lead.id },
                data: { step: "transferred", converted: true },
            });
            console.log(`[FLOW:${userId}] 🎯 Lead ${jid} confirmou interesse — transferido`);
            return;
        }
        await sendFlowText(sock, jid, `Digite *1* para falar com um especialista ou *0* para voltar ao menu. 😊`);
        return;
    }

    if (step === "transferred" || lead.converted) {
        return;
    }
}

// ── Cron: lembretes para leads não convertidos ───────────────────────────────
cron.schedule("0 10 * * *", async () => {
    try {
        const configs = await prisma.flowConfig.findMany({
            where: { enabled: true },
            include: { user: true },
        });
        for (const cfg of configs) {
            const conn = getConn(cfg.userId);
            if (!conn.sock || conn.status !== "open") continue;
            const cutoff = new Date(Date.now() - cfg.reminderDays * 24 * 60 * 60 * 1000);
            const leads = await prisma.flowLead.findMany({
                where: {
                    userId: cfg.userId,
                    converted: false,
                    lastContact: { lte: cutoff },
                    OR: [{ reminderSent: null }, { reminderSent: { lte: cutoff } }],
                },
            });
            for (const lead of leads) {
                try {
                    const items = await prisma.flowMenuItem.findMany({
                        where: { configId: cfg.id, parentId: null },
                        orderBy: { sortOrder: "asc" },
                    });
                    const reminderText = `Oi! 👋 Vi que você ainda não escolheu seu plano.\n\n${buildMenuText({ ...cfg, menuItems: items }, items)}\n\nQualquer dúvida estou aqui! 😊`;
                    await conn.sock.sendMessage(lead.phone, { text: reminderText });
                    await prisma.flowLead.update({
                        where: { id: lead.id },
                        data: { reminderSent: new Date() },
                    });
                    console.log(`[FLOW:${cfg.userId}] 📩 Lembrete enviado para ${lead.phone}`);
                } catch (err) {
                    console.error(`[FLOW:${cfg.userId}] ❌ Erro ao enviar lembrete:`, err.message);
                }
            }
        }
    } catch (err) {
        console.error("[FLOW_REMINDER] Erro:", err.message);
    }
}, { timezone: "America/Sao_Paulo" });

// ── Auto-criar WOD a partir da mensagem enviada ──────────────────────────────
async function autoCreateWOD(userId, messageText, imageBase64, imageMimeType) {
    try {
        if (!messageText && !imageBase64) return;
        const user = await prisma.user.findUnique({ where: { id: userId }, select: { boxId: true } });
        if (!user?.boxId) return;
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const data = {
            content: (messageText || "").trim() || "WOD do Dia",
            updatedAt: new Date(),
        };
        if (imageBase64) {
            data.imageData = imageBase64;
            data.imageMimeType = imageMimeType || "image/jpeg";
        }
        // Atualiza ou cria o WOD do dia para o box do usuário
        const existing = await prisma.boxProgram.findFirst({
            where: { boxId: user.boxId, date: today },
        });
        if (existing) {
            await prisma.boxProgram.update({ where: { id: existing.id }, data });
        } else {
            await prisma.boxProgram.create({
                data: { boxId: user.boxId, date: today, title: "WOD do Dia", ...data, createdBy: userId },
            });
        }
        console.log(`[BOT:${userId}] 📋 WOD do dia criado/atualizado automaticamente`);
    } catch (err) {
        console.error(`[BOT:${userId}] ❌ Erro ao criar WOD automático:`, err.message);
    }
}

// ── Agendador cron por usuário (5h da manhã) ─────────────────────────────────
async function startSchedulerForUser(userId) {
    const conn = getConn(userId);
    const cfg = await getUserConfig(userId);

    if (!cfg.groupJid) {
        console.log(`[BOT:${userId}] ⚠️  Grupo não configurado — agendamento desativado.`);
        return;
    }

    if (conn.cronJob) conn.cronJob.stop();

    // Parse "HH:MM" → cron expression "MM HH * * *"
    const [hh, mm] = (cfg.scheduleTime || "05:00").split(":").map(Number);
    const cronExpr = `${mm} ${hh} * * *`;

    conn.cronJob = cron.schedule(
        cronExpr,
        async () => {
            const latestCfg = await getUserConfig(userId);
            const dayOfWeek = new Date().getDay();
            const dayName = DAYS_PT[dayOfWeek];
            console.log(`[BOT:${userId}] 🕐 ${dayName} — enviando mensagem agendada...`);
            try {
                const photo = await prisma.dayPhoto.findUnique({
                    where: { userId_day: { userId, day: dayOfWeek } },
                });
                if (photo && photo.enabled === false) {
                    console.log(`[BOT:${userId}] ⏭️  ${dayName} desativado — envio pulado.`);
                    auditLog("AUTO_SEND_SKIP", { userId, detail: `${dayName} desativado` });
                    return;
                }
                if (!photo || !photo.data) {
                    console.log(`[BOT:${userId}] ⏭️  ${dayName} sem foto — envio pulado.`);
                    auditLog("AUTO_SEND_SKIP", { userId, detail: `${dayName} sem foto` });
                    return;
                }
                const msgToSend = (photo?.message?.trim()) || latestCfg.message;
                let hadPhoto = false;
                if (msgToSend && conn.sock) {
                    await conn.sock.sendMessage(latestCfg.groupJid, { text: msgToSend });
                    console.log(`[BOT:${userId}] ✅ Texto enviado!`);
                }
                if (photo && conn.sock) {
                    const buffer = Buffer.from(photo.data, "base64");
                    await conn.sock.sendMessage(latestCfg.groupJid, { image: buffer, mimetype: photo.mimeType });
                    hadPhoto = true;
                    console.log(`[BOT:${userId}] ✅ Foto de ${dayName} enviada!`);
                } else {
                    console.log(`[BOT:${userId}] ⚠️  Nenhuma foto para ${dayName}`);
                }
                await prisma.sendLog.create({
                    data: {
                        userId, day: dayOfWeek, groupJid: latestCfg.groupJid, hadPhoto, source: "auto",
                        photoData: hadPhoto ? photo.data : null,
                        photoMimeType: hadPhoto ? photo.mimeType : null,
                    },
                });
                autoCreateWOD(userId, msgToSend, hadPhoto ? photo.data : null, hadPhoto ? photo.mimeType : null);
                auditLog("AUTO_SEND_OK", { userId, detail: `${dayName} • foto=${hadPhoto} • grupo=${latestCfg.groupJid.replace(/@g\.us$/, "")}` });
            } catch (err) {
                console.error(`[BOT:${userId}] ❌ Erro no envio agendado:`, err.message);
                await prisma.sendLog.create({
                    data: { userId, day: dayOfWeek, groupJid: cfg.groupJid, hadPhoto: false, source: "auto", error: err.message },
                }).catch(() => { });
                auditLog("AUTO_SEND_ERROR", { userId, detail: `${DAYS_PT[dayOfWeek]} • ${err.message}` });
            }
        },
        { timezone: cfg.timezone || "America/Sao_Paulo" }
    );

    console.log(`[BOT:${userId}] ✅ Agendamento ativo: ${cfg.scheduleTime || "05:00"} diário — Grupo: ${cfg.groupJid}`);
}

// ── Agendadores extra por automação de grupo (apenas texto, por dia da semana) ─
async function startExtraSchedulersForUser(userId) {
    const conn = getConn(userId);

    // Para todos os cron jobs de automações extras
    for (const [, job] of conn.cronJobs) { job.stop(); }
    conn.cronJobs.clear();

    const automations = await prisma.groupAutomation.findMany({
        where: { userId, active: true },
        include: { days: true },
    });

    for (const auto of automations) {
        if (!auto.groupJid) continue;
        const [hh, mm] = (auto.scheduleTime || "05:00").split(":").map(Number);
        const cronExpr = `${mm} ${hh} * * *`;

        const job = cron.schedule(
            cronExpr,
            async () => {
                const dayOfWeek = new Date().getDay();
                const dayName = DAYS_PT[dayOfWeek];
                console.log(`[BOT:${userId}] 🕐 [Grupo] ${dayName} → ${auto.groupName || auto.groupJid}`);
                try {
                    const latestAuto = await prisma.groupAutomation.findUnique({
                        where: { id: auto.id },
                        include: { days: true },
                    });
                    if (!latestAuto || !latestAuto.active) return;

                    const dayConfig = latestAuto.days.find(d => d.day === dayOfWeek);

                    if (!dayConfig || !dayConfig.enabled) {
                        console.log(`[BOT:${userId}] ⏭️  [Grupo] ${dayName} desativado para ${latestAuto.groupName || latestAuto.groupJid} — pulado.`);
                        auditLog("GROUP_AUTO_SKIP", { userId, detail: `${dayName} desativado • grupo=${latestAuto.groupJid.replace(/@g\.us$/, "")}` });
                        return;
                    }
                    if (!dayConfig.message || !dayConfig.message.trim()) {
                        console.log(`[BOT:${userId}] ⏭️  [Grupo] ${dayName} sem mensagem — pulado.`);
                        auditLog("GROUP_AUTO_SKIP", { userId, detail: `${dayName} sem msg • grupo=${latestAuto.groupJid.replace(/@g\.us$/, "")}` });
                        return;
                    }

                    if (conn.sock) {
                        await conn.sock.sendMessage(latestAuto.groupJid, { text: dayConfig.message.trim() });
                        console.log(`[BOT:${userId}] ✅ [Grupo] Mensagem de ${dayName} enviada para ${latestAuto.groupName || latestAuto.groupJid}`);
                    }
                    auditLog("GROUP_AUTO_SEND_OK", { userId, detail: `${dayName} • grupo=${latestAuto.groupJid.replace(/@g\.us$/, "")}` });
                } catch (err) {
                    console.error(`[BOT:${userId}] ❌ [Grupo] Erro no envio:`, err.message);
                    auditLog("GROUP_AUTO_SEND_ERROR", { userId, detail: `${DAYS_PT[new Date().getDay()]} • ${err.message}` });
                }
            },
            { timezone: auto.timezone || "America/Sao_Paulo" }
        );

        conn.cronJobs.set(auto.id, job);
        console.log(`[BOT:${userId}] ✅ [Grupo] Agendamento #${auto.id}: ${auto.scheduleTime} — ${auto.groupName || auto.groupJid}`);
    }
}

// ── Express API ──────────────────────────────────────────────────────────────
const app = express();

// ── Middlewares globais ──────────────────────────────────────────────────────
app.set("trust proxy", 1); // para pegar IP real atrás de proxy
app.use(securityHeaders);
app.use(requestLogger);
app.use(cors());

// ── Status por usuário (parse token inline, sem require session) ──────────────
app.get("/status", (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.json({ status: "disconnected", qr: null, pairingCode: null });
    }
    let userId;
    try {
        const { id } = jwt.verify(authHeader.slice(7), JWT_SECRET);
        userId = id;
    } catch {
        return res.json({ status: "disconnected", qr: null, pairingCode: null });
    }
    const conn = getConn(userId);
    // Auto-reconecta se desconectado e tem sessão salva
    if (conn.status === "disconnected" && !conn.isConnecting && !conn.reconnectTimer) {
        const userAuthDir = authDirFor(userId);
        if (fs.existsSync(path.join(userAuthDir, "creds.json"))) {
            connectWhatsApp(userId, null);
        }
    }
    res.json({ status: conn.status, qr: conn.qrBase64 || null, pairingCode: conn.pairingCode || null });
});

app.use(generalLimiter);
app.use(express.json({ limit: "5mb" }));

// ── Helper: cria sessão no banco e retorna token ─────────────────────────────
async function createSession(user, req) {
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 dias
    const token = jwt.sign(
        { id: user.id, email: user.email, name: user.name, role: user.role },
        JWT_SECRET,
        { expiresIn: "7d" }
    );
    await prisma.session.create({
        data: {
            userId: user.id,
            token,
            ip: req.ip || req.socket.remoteAddress,
            userAgent: (req.headers["user-agent"] || "").slice(0, 500),
            expiresAt,
        },
    });
    return token;
}

// ── Helper: dados públicos do usuário ────────────────────────────────────────
function publicUser(user) {
    return { id: user.id, email: user.email, name: user.name, role: user.role, boxId: user.boxId ?? null, avatar: user.avatar ?? null, boxName: user.box?.name || null };
}

// ── Rotas públicas: Auth ──────────────────────────────────────────────────────
app.post("/auth/login", authLimiter, validateLogin, async (req, res) => {
    const { email, password } = req.body;
    const ip = req.ip || req.socket.remoteAddress;

    try {
        const user = await prisma.user.findUnique({ where: { email }, include: { box: true } });
        if (!user) {
            await auditLog("LOGIN_FAIL", { detail: `Email não encontrado: ${email}`, ip });
            return res.status(401).json({ error: "Email ou senha incorretos" });
        }

        if (!user.active) {
            return res.status(403).json({ error: "Conta desativada" });
        }

        // Verifica lockout por tentativas excessivas
        if (user.lockedUntil && user.lockedUntil > new Date()) {
            const mins = Math.ceil((user.lockedUntil - Date.now()) / 60000);
            return res.status(423).json({ error: `Conta bloqueada. Tente novamente em ${mins} minutos.` });
        }

        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) {
            const failedLogins = user.failedLogins + 1;
            const updates = { failedLogins };
            if (failedLogins >= MAX_FAILED_LOGINS) {
                updates.lockedUntil = new Date(Date.now() + LOCK_DURATION_MS);
            }
            await prisma.user.update({ where: { id: user.id }, data: updates });
            await auditLog("LOGIN_FAIL", { userId: user.id, detail: `Tentativa ${failedLogins}`, ip });
            return res.status(401).json({ error: "Email ou senha incorretos" });
        }

        // Login OK — reseta contadores e registra
        await prisma.user.update({
            where: { id: user.id },
            data: { failedLogins: 0, lockedUntil: null, lastLoginAt: new Date(), lastLoginIp: ip },
        });

        const token = await createSession(user, req);
        await auditLog("LOGIN_OK", { userId: user.id, ip });
        res.json({ token, user: publicUser(user) });
    } catch (err) {
        console.error("[AUTH] Erro no login:", err.message);
        res.status(500).json({ error: "Erro interno" });
    }
});

// Registro público desabilitado — apenas admin pode criar usuários via /admin/users
app.post("/auth/register", (_req, res) => {
    res.status(403).json({ error: "Registro público desabilitado. Contate o administrador." });
});

// ── Rota pública: solicitar acesso ──────────────────────────────────────────
app.post("/auth/request-access", async (req, res) => {
    const { name, email, phone, message } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: "Nome obrigatório" });
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: "Email inválido" });
    try {
        // evita duplicata de pending
        const existing = await prisma.accessRequest.findFirst({ where: { email: email.toLowerCase().trim(), status: "pending" } });
        if (existing) return res.status(409).json({ error: "Já existe uma solicitação pendente para este email" });
        await prisma.accessRequest.create({
            data: { name: name.trim(), email: email.toLowerCase().trim(), phone: (phone || "").trim(), message: (message || "").trim() },
        });
        res.status(201).json({ ok: true });
    } catch (err) {
        console.error("[ACCESS-REQUEST] Erro:", err.message);
        res.status(500).json({ error: "Erro interno" });
    }
});

// ── Admin: listar solicitações de acesso ────────────────────────────────────
app.get("/admin/access-requests", requireSession, requireAdmin, async (req, res) => {
    const { status } = req.query;
    const where = status ? { status } : {};
    const requests = await prisma.accessRequest.findMany({ where, orderBy: { createdAt: "desc" } });
    const pending = await prisma.accessRequest.count({ where: { status: "pending" } });
    res.json({ requests, pending });
});

// ── Admin: aprovar ou rejeitar solicitação ───────────────────────────────────
app.patch("/admin/access-requests/:id", requireSession, requireAdmin, async (req, res) => {
    const id = parseInt(req.params.id);
    const { action, password } = req.body; // action: "approve" | "deny"
    if (!["approve", "deny"].includes(action)) return res.status(400).json({ error: "Ação inválida" });
    const request = await prisma.accessRequest.findUnique({ where: { id } });
    if (!request) return res.status(404).json({ error: "Solicitação não encontrada" });
    if (request.status !== "pending") return res.status(409).json({ error: "Solicitação já processada" });

    if (action === "deny") {
        await prisma.accessRequest.update({ where: { id }, data: { status: "denied" } });
        return res.json({ ok: true });
    }

    // approve: cria conta do usuário
    const pwd = password || Math.random().toString(36).slice(-8);
    try {
        const exists = await prisma.user.findUnique({ where: { email: request.email } });
        if (exists) {
            await prisma.accessRequest.update({ where: { id }, data: { status: "approved" } });
            return res.json({ ok: true, message: "Usuário já existia, solicitação aprovada" });
        }
        const hash = await bcrypt.hash(pwd, 12);
        await prisma.user.create({ data: { email: request.email, password: hash, name: request.name, role: "USER" } });
        await prisma.accessRequest.update({ where: { id }, data: { status: "approved" } });
        await auditLog("ACCESS_APPROVED", { userId: req.user.id, detail: `Aprovado: ${request.email}`, ip: req.ip });
        res.json({ ok: true, email: request.email, password: pwd });
    } catch (err) {
        console.error("[ACCESS-APPROVE] Erro:", err.message);
        res.status(500).json({ error: "Erro interno" });
    }
});

app.get("/auth/me", requireSession, async (req, res) => {
    const user = await prisma.user.findUnique({ where: { id: req.user.id }, include: { box: true } });
    if (!user) return res.status(404).json({ error: "Usuário não encontrado" });
    res.json({ user: publicUser(user) });
});

app.post("/auth/logout", requireSession, async (req, res) => {
    const token = req.headers.authorization.slice(7);
    await prisma.session.deleteMany({ where: { token } });
    await auditLog("LOGOUT", { userId: req.user.id, ip: req.ip });

    // Cancela pareamento em andamento deste usuário
    const conn = getConn(req.user.id);
    if (conn.status === "waiting_pairing" || conn.pairingCode) {
        console.log(`[BOT:${req.user.id}] 🔌 Logout durante pareamento — cancelando`);
        if (conn.reconnectTimer) { clearTimeout(conn.reconnectTimer); conn.reconnectTimer = null; }
        conn.socketId++;
        conn.isConnecting = false;
        conn.intentionalClose = true;
        conn.pairingAcknowledged = false;
        conn.pairingCode = null;
        conn.qrBase64 = null;
        try { if (conn.sock) conn.sock.end(); } catch { }
        conn.sock = null;
        conn.status = "disconnected";
        const userAuthDir = authDirFor(req.user.id);
        fs.rmSync(userAuthDir, { recursive: true, force: true });
        fs.mkdirSync(userAuthDir, { recursive: true });
    }

    res.json({ success: true });
});

app.post("/auth/change-password", requireSession, async (req, res) => {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword)
        return res.status(400).json({ error: "Senhas obrigatórias" });
    if (newPassword.length < 8)
        return res.status(400).json({ error: "Nova senha deve ter no mínimo 8 caracteres" });

    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user || !(await bcrypt.compare(currentPassword, user.password)))
        return res.status(401).json({ error: "Senha atual incorreta" });

    const hash = await bcrypt.hash(newPassword, 12);
    await prisma.user.update({ where: { id: user.id }, data: { password: hash } });
    // Invalida todas as outras sessões
    const currentToken = req.headers.authorization.slice(7);
    await prisma.session.deleteMany({ where: { userId: user.id, NOT: { token: currentToken } } });
    await auditLog("CHANGE_PASSWORD", { userId: user.id, ip: req.ip });
    res.json({ success: true });
});

// ── Admin: listar usuários ───────────────────────────────────────────────────
app.get("/admin/users", requireSession, requireAdmin, async (req, res) => {
    const users = await prisma.user.findMany({
        select: { id: true, email: true, name: true, role: true, active: true, boxId: true, lastLoginAt: true, createdAt: true },
        orderBy: { createdAt: "desc" },
    });
    res.json(users);
});

// ── Admin: criar usuário ──────────────────────────────────────────────────────
app.post("/admin/users", requireSession, requireAdmin, validateRegister, async (req, res) => {
    const { email, password, name, role, boxId } = req.body;
    const allowedRoles = ["USER", "ADMIN", "ALUNO"];
    const userRole = allowedRoles.includes(role) ? role : "USER";
    const parsedBoxId = boxId ? parseInt(boxId) : null;
    try {
        const exists = await prisma.user.findUnique({ where: { email } });
        if (exists) return res.status(409).json({ error: "Email já cadastrado" });
        const hash = await bcrypt.hash(password, 12);
        const user = await prisma.user.create({
            data: { email, password: hash, name: name || email.split("@")[0], role: userRole, boxId: parsedBoxId },
        });
        await auditLog("USER_CREATED", { userId: req.user.id, detail: `Created: ${email} (${userRole})`, ip: req.ip });
        res.status(201).json(publicUser(user));
    } catch (err) {
        console.error("[ADMIN] Erro ao criar usuário:", err.message);
        res.status(500).json({ error: "Erro interno" });
    }
});

// ── Admin: alterar papel do usuário ──────────────────────────────────────────
app.patch("/admin/users/:id/role", requireSession, requireAdmin, async (req, res) => {
    const id = parseInt(req.params.id);
    if (id === req.user.id) return res.status(400).json({ error: "Não pode alterar o próprio papel" });
    const { role } = req.body;
    if (!['USER', 'ADMIN', 'ALUNO'].includes(role)) return res.status(400).json({ error: "Papel inválido" });
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) return res.status(404).json({ error: "Usuário não encontrado" });
    const updated = await prisma.user.update({ where: { id }, data: { role } });
    await auditLog("USER_ROLE_CHANGED", { userId: req.user.id, detail: `User ${id}: ${user.role} → ${role}`, ip: req.ip });
    res.json(publicUser(updated));
});

// ── Admin: deletar usuário ────────────────────────────────────────────────────
app.delete("/admin/users/:id", requireSession, requireAdmin, async (req, res) => {
    const id = parseInt(req.params.id);
    if (id === req.user.id) return res.status(400).json({ error: "Não pode deletar a si mesmo" });
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) return res.status(404).json({ error: "Usuário não encontrado" });
    await prisma.session.deleteMany({ where: { userId: id } });
    await prisma.auditLog.updateMany({ where: { userId: id }, data: { userId: null } });
    await prisma.user.delete({ where: { id } });
    await auditLog("USER_DELETED", { userId: req.user.id, detail: `Deleted: ${user.email}`, ip: req.ip });
    res.json({ success: true });
});

// ── Admin: ativar/desativar usuário ──────────────────────────────────────────
app.patch("/admin/users/:id/toggle", requireSession, requireAdmin, async (req, res) => {
    const id = parseInt(req.params.id);
    if (id === req.user.id) return res.status(400).json({ error: "Não pode desativar a si mesmo" });
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) return res.status(404).json({ error: "Usuário não encontrado" });
    const updated = await prisma.user.update({ where: { id }, data: { active: !user.active } });
    if (!updated.active) {
        await prisma.session.deleteMany({ where: { userId: id } });
    }
    await auditLog(updated.active ? "USER_ACTIVATED" : "USER_DEACTIVATED", {
        userId: req.user.id, detail: `Target: ${id}`, ip: req.ip,
    });
    res.json(publicUser(updated));
});

// ── Admin: log de auditoria ──────────────────────────────────────────────────
app.get("/admin/audit", requireSession, requireAdmin, async (req, res) => {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, parseInt(req.query.limit) || 50);
    const action = req.query.action || null;
    const userId = req.query.userId ? parseInt(req.query.userId) : null;
    const where = {};
    if (action) where.action = { contains: action, mode: "insensitive" };
    if (userId && !isNaN(userId)) where.userId = userId;
    const [total, logs] = await Promise.all([
        prisma.auditLog.count({ where }),
        prisma.auditLog.findMany({
            where, take: limit, skip: (page - 1) * limit,
            orderBy: { createdAt: "desc" },
            include: { user: { select: { email: true, name: true } } },
        }),
    ]);
    res.json({ logs, total, page, pages: Math.ceil(total / limit) });
});

// Status (público — frontend precisa mesmo sem login para mostrar QR)
// Listar grupos
app.get("/groups", requireSession, async (req, res) => {
    const conn = getConn(req.user.id);
    if (conn.status !== "open") return res.status(400).json({ error: "WhatsApp não conectado" });
    try {
        const chats = await conn.sock.groupFetchAllParticipating();
        const groups = Object.entries(chats).map(([jid, meta]) => ({ jid, name: meta.subject }));
        res.json(groups);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── Fotos por dia (armazenadas em base64 no banco) ───────────────────────────

// Upload foto para um dia (0=dom .. 6=sáb)
app.post("/photos/:day", requireSession, (req, res) => {
    const day = parseInt(req.params.day);
    if (isNaN(day) || day < 0 || day > 6) return res.status(400).json({ error: "Dia inválido (0-6)" });
    memUpload.single("photo")(req, res, async (err) => {
        if (err) return res.status(400).json({ error: err.message });
        if (!req.file) return res.status(400).json({ error: "Nenhum arquivo enviado" });
        const data = req.file.buffer.toString("base64");
        await prisma.dayPhoto.upsert({
            where: { userId_day: { userId: req.user.id, day } },
            update: { mimeType: req.file.mimetype, data },
            create: { userId: req.user.id, day, mimeType: req.file.mimetype, data },
        });
        console.log(`[BOT:${req.user.id}] 📸 Foto salva para ${DAYS_PT[day]}`);
        auditLog("PHOTO_UPLOAD", { userId: req.user.id, detail: DAYS_PT[day], ip: req.ip });
        res.json({ success: true, day: DAYS_PT[day] });
    });
});

// Listar fotos (inclui dataUrl para exibição direta no frontend)
app.get("/photos", requireSession, async (req, res) => {
    const dbPhotos = await prisma.dayPhoto.findMany({ where: { userId: req.user.id } });
    const photoMap = {};
    for (const p of dbPhotos) photoMap[p.day] = p;
    const result = {};
    for (let d = 0; d < 7; d++) {
        const p = photoMap[d];
        result[d] = {
            day: d, name: DAYS_PT[d], hasPhoto: !!(p?.data),
            dataUrl: p?.data ? `data:${p.mimeType};base64,${p.data}` : null,
            message: p?.message || null,
            enabled: p ? p.enabled : true,
        };
    }
    res.json(result);
});

// Atualizar enabled/message de um dia sem trocar a foto
app.patch("/photos/:day", requireSession, async (req, res) => {
    const day = parseInt(req.params.day);
    if (isNaN(day) || day < 0 || day > 6) return res.status(400).json({ error: "Dia inválido" });
    const { enabled, message } = req.body;
    const data = {};
    if (enabled !== undefined) data.enabled = enabled;
    if (message !== undefined) data.message = message;
    if (Object.keys(data).length === 0) return res.status(400).json({ error: "Nada a atualizar" });
    const existing = await prisma.dayPhoto.findUnique({ where: { userId_day: { userId: req.user.id, day } } });
    if (!existing) {
        // Create a placeholder record (no photo) to store the enabled/message state
        await prisma.dayPhoto.create({
            data: { userId: req.user.id, day, data: "", mimeType: "", ...data },
        });
    } else {
        await prisma.dayPhoto.update({
            where: { userId_day: { userId: req.user.id, day } },
            data,
        });
    }
    if (enabled !== undefined) {
        auditLog(enabled ? "DAY_ENABLED" : "DAY_DISABLED", { userId: req.user.id, detail: DAYS_PT[day], ip: req.ip });
    }
    res.json({ success: true });
});

// Deletar foto de um dia
app.delete("/photos/:day", requireSession, async (req, res) => {
    const day = parseInt(req.params.day);
    if (isNaN(day) || day < 0 || day > 6) return res.status(400).json({ error: "Dia inválido" });
    await prisma.dayPhoto.deleteMany({ where: { userId: req.user.id, day } });
    console.log(`[BOT:${req.user.id}] 🗑️  Foto de ${DAYS_PT[day]} removida`);
    auditLog("PHOTO_DELETE", { userId: req.user.id, detail: DAYS_PT[day], ip: req.ip });
    res.json({ success: true });
});

// ── Config por usuário (banco) ───────────────────────────────────────────────────
app.get("/config", requireSession, async (req, res) => {
    const cfg = await getUserConfig(req.user.id);
    res.json({ groupJid: cfg.groupJid, timezone: cfg.timezone, message: cfg.message, scheduleTime: cfg.scheduleTime });
});

app.post("/config", requireSession, async (req, res) => {
    const { groupJid, message, timezone, scheduleTime } = req.body;
    const data = {};
    if (groupJid !== undefined) data.groupJid = groupJid;
    if (message !== undefined) data.message = message;
    if (timezone !== undefined) data.timezone = timezone;
    if (scheduleTime !== undefined) data.scheduleTime = scheduleTime;
    await prisma.userConfig.upsert({
        where: { userId: req.user.id },
        update: data,
        create: { userId: req.user.id, ...(data) },
    });
    const conn = getConn(req.user.id);
    if (conn.status === "open") startSchedulerForUser(req.user.id);
    auditLog("CONFIG_SAVE", { userId: req.user.id, detail: JSON.stringify({ groupJid: data.groupJid, scheduleTime: data.scheduleTime }), ip: req.ip });
    res.json({ success: true });
});

// ── CRUD Automações de Grupo ──────────────────────────────────────────────────
app.get("/group-automations", requireSession, async (req, res) => {
    const automations = await prisma.groupAutomation.findMany({
        where: { userId: req.user.id },
        include: { days: { orderBy: { day: "asc" } } },
        orderBy: { createdAt: "asc" },
    });
    res.json(automations);
});

app.post("/group-automations", requireSession, async (req, res) => {
    const { groupJid, groupName, timezone, scheduleTime, active } = req.body;
    if (!groupJid) return res.status(400).json({ error: "groupJid obrigatório" });
    try {
        const auto = await prisma.groupAutomation.create({
            data: {
                userId: req.user.id,
                groupJid,
                groupName: groupName || "",
                timezone: timezone || "America/Sao_Paulo",
                scheduleTime: scheduleTime || "05:00",
                active: active !== false,
                days: {
                    create: [0, 1, 2, 3, 4, 5, 6].map(day => ({ day, message: "", enabled: true })),
                },
            },
            include: { days: { orderBy: { day: "asc" } } },
        });
        const conn = getConn(req.user.id);
        if (conn.status === "open") startExtraSchedulersForUser(req.user.id);
        auditLog("GROUP_AUTO_CREATE", { userId: req.user.id, detail: `grupo=${groupJid}`, ip: req.ip });
        res.status(201).json(auto);
    } catch (err) {
        if (err.code === "P2002") return res.status(409).json({ error: "Já existe automação para este grupo" });
        throw err;
    }
});

app.put("/group-automations/:id", requireSession, async (req, res) => {
    const id = parseInt(req.params.id);
    const existing = await prisma.groupAutomation.findFirst({ where: { id, userId: req.user.id } });
    if (!existing) return res.status(404).json({ error: "Não encontrado" });
    const { groupJid, groupName, timezone, scheduleTime, active } = req.body;
    const data = {};
    if (groupJid !== undefined) data.groupJid = groupJid;
    if (groupName !== undefined) data.groupName = groupName;
    if (timezone !== undefined) data.timezone = timezone;
    if (scheduleTime !== undefined) data.scheduleTime = scheduleTime;
    if (active !== undefined) data.active = active;
    const updated = await prisma.groupAutomation.update({
        where: { id }, data,
        include: { days: { orderBy: { day: "asc" } } },
    });
    const conn = getConn(req.user.id);
    if (conn.status === "open") startExtraSchedulersForUser(req.user.id);
    auditLog("GROUP_AUTO_UPDATE", { userId: req.user.id, detail: `id=${id}`, ip: req.ip });
    res.json(updated);
});

// Salva as 7 mensagens diárias de uma automação de grupo
app.put("/group-automations/:id/days", requireSession, async (req, res) => {
    const id = parseInt(req.params.id);
    const existing = await prisma.groupAutomation.findFirst({ where: { id, userId: req.user.id } });
    if (!existing) return res.status(404).json({ error: "Não encontrado" });
    // days: [{ day: 0, message: "...", enabled: true }, ...]
    const { days } = req.body;
    if (!Array.isArray(days)) return res.status(400).json({ error: "days deve ser array" });
    await Promise.all(days.map(d =>
        prisma.groupAutomationDay.upsert({
            where: { automationId_day: { automationId: id, day: d.day } },
            update: { message: d.message ?? "", enabled: d.enabled !== false },
            create: { automationId: id, day: d.day, message: d.message ?? "", enabled: d.enabled !== false },
        })
    ));
    const conn = getConn(req.user.id);
    if (conn.status === "open") startExtraSchedulersForUser(req.user.id);
    auditLog("GROUP_AUTO_DAYS_SAVE", { userId: req.user.id, detail: `id=${id}`, ip: req.ip });
    res.json({ success: true });
});

app.delete("/group-automations/:id", requireSession, async (req, res) => {
    const id = parseInt(req.params.id);
    const existing = await prisma.groupAutomation.findFirst({ where: { id, userId: req.user.id } });
    if (!existing) return res.status(404).json({ error: "Não encontrado" });
    await prisma.groupAutomation.delete({ where: { id } });
    const conn = getConn(req.user.id);
    if (conn.status === "open") startExtraSchedulersForUser(req.user.id);
    auditLog("GROUP_AUTO_DELETE", { userId: req.user.id, detail: `id=${id}`, ip: req.ip });
    res.json({ success: true });
});

// ── Enviar agora (teste) ─────────────────────────────────────────────────────────────
app.post("/send-now", requireSession, async (req, res) => {
    try {
        const conn = getConn(req.user.id);
        if (conn.status !== "open") return res.status(400).json({ error: "WhatsApp não conectado" });
        const cfg = await getUserConfig(req.user.id);
        if (!cfg.groupJid) return res.status(400).json({ error: "Grupo não configurado" });
        const dayOfWeek = new Date().getDay();
        const dayName = DAYS_PT[dayOfWeek];

        // Bloqueia reenvio: verifica se já foi enviado hoje (auto ou teste)
        const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
        const alreadySent = await prisma.sendLog.findFirst({
            where: { userId: req.user.id, day: dayOfWeek, sentAt: { gte: startOfDay }, error: null },
        });
        if (alreadySent) {
            return res.status(409).json({ error: `${dayName} já foi enviado hoje às ${alreadySent.sentAt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}` });
        }
        const photo = await prisma.dayPhoto.findUnique({
            where: { userId_day: { userId: req.user.id, day: dayOfWeek } },
        });
        if (!photo) return res.status(400).json({ error: `Nenhuma foto cadastrada para ${dayName}` });
        const msgToSend = (photo?.message?.trim()) || cfg.message;
        if (msgToSend) await conn.sock.sendMessage(cfg.groupJid, { text: msgToSend });
        if (photo) {
            await conn.sock.sendMessage(cfg.groupJid, { image: Buffer.from(photo.data, "base64"), mimetype: photo.mimeType });
        }
        await prisma.sendLog.create({
            data: {
                userId: req.user.id, day: dayOfWeek, groupJid: cfg.groupJid, hadPhoto: !!photo, source: "test",
                photoData: photo ? photo.data : null,
                photoMimeType: photo ? photo.mimeType : null,
            },
        });
        console.log(`[BOT:${req.user.id}] ✅ Envio de teste: ${dayName} (foto: ${!!photo})`);
        autoCreateWOD(req.user.id, msgToSend, photo ? photo.data : null, photo ? photo.mimeType : null);
        auditLog("SEND_NOW", { userId: req.user.id, detail: `${dayName} hadPhoto=${!!photo}`, ip: req.ip });
        res.json({ success: true, day: dayName, hadPhoto: !!photo });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Histórico de envios
app.get("/send-history", requireSession, async (req, res) => {
    try {
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(20, Math.max(1, parseInt(req.query.limit) || 10));
        const source = req.query.source;
        const day = (req.query.day !== undefined && req.query.day !== "") ? parseInt(req.query.day) : undefined;

        const where = { userId: req.user.id };
        if (source && ["auto", "test", "manual"].includes(source)) where.source = source;
        if (day !== undefined && !isNaN(day) && day >= 0 && day <= 6) where.day = day;

        const [total, logs] = await Promise.all([
            prisma.sendLog.count({ where }),
            prisma.sendLog.findMany({
                where,
                orderBy: { sentAt: "desc" },
                skip: (page - 1) * limit,
                take: limit,
            }),
        ]);
        // Return stored photoData (taken at send time) — fall back to current photo for old records without stored data
        const logsNeedingFallback = logs.filter(l => l.hadPhoto && !l.photoData);
        const daysWithPhoto = [...new Set(logsNeedingFallback.map(l => l.day))];
        const photos = daysWithPhoto.length
            ? await prisma.dayPhoto.findMany({ where: { userId: req.user.id, day: { in: daysWithPhoto } } })
            : [];
        const photoMap = {};
        for (const p of photos) photoMap[p.day] = { data: p.data, mimeType: p.mimeType };
        const result = logs.map(l => {
            let photoDataUrl = null;
            if (l.hadPhoto) {
                if (l.photoData) {
                    photoDataUrl = `data:${l.photoMimeType || "image/jpeg"};base64,${l.photoData}`;
                } else if (photoMap[l.day]) {
                    photoDataUrl = `data:${photoMap[l.day].mimeType};base64,${photoMap[l.day].data}`;
                }
            }
            return { ...l, photoData: photoDataUrl };
        });
        res.json({ logs: result, total, page, limit, pages: Math.ceil(total / limit) });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Excluir um registro do histórico
app.delete("/send-history/:id", requireSession, async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        if (isNaN(id)) return res.status(400).json({ error: "ID inválido" });
        const log = await prisma.sendLog.findUnique({ where: { id } });
        if (!log || log.userId !== req.user.id) return res.status(404).json({ error: "Registro não encontrado" });
        await prisma.sendLog.delete({ where: { id } });
        auditLog("HISTORY_DELETE", { userId: req.user.id, detail: `id=${id}`, ip: req.ip });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Dias já enviados hoje (para feedback nos cards de foto)
app.get("/sent-today", requireSession, async (req, res) => {
    try {
        const now = new Date();
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);
        const logs = await prisma.sendLog.findMany({
            where: { userId: req.user.id, sentAt: { gte: startOfDay, lt: endOfDay }, error: null, source: { in: ["auto", "test"] } },
            select: { day: true, sentAt: true, source: true },
            orderBy: { sentAt: "asc" },
        });
        // last send per day
        const result = {};
        for (const l of logs) result[l.day] = { sentAt: l.sentAt, source: l.source };
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post("/send-manual", requireSession, memUpload.single("photo"), async (req, res) => {
    const conn = getConn(req.user.id);
    if (conn.status !== "open") return res.status(400).json({ error: "WhatsApp não conectado" });
    const groupJid = req.body.groupJid;
    const message = req.body.message;
    if (!groupJid) return res.status(400).json({ error: "Grupo não informado" });
    if (!req.file) return res.status(400).json({ error: "Imagem obrigatória" });
    try {
        if (message && message.trim()) await conn.sock.sendMessage(groupJid, { text: message.trim() });
        if (req.file) await conn.sock.sendMessage(groupJid, { image: req.file.buffer, mimetype: req.file.mimetype });
        console.log(`[BOT:${req.user.id}] ✅ Envio manual para ${groupJid.replace(/@g\.us$/, "")} (img: ${!!req.file})`);
        autoCreateWOD(req.user.id, message, req.file ? req.file.buffer.toString("base64") : null, req.file ? req.file.mimetype : null);
        const today = new Date();
        const dayOfWeek = today.getDay();
        await prisma.sendLog.create({
            data: {
                userId: req.user.id,
                day: dayOfWeek,
                groupJid,
                hadPhoto: !!req.file,
                photoData: req.file ? req.file.buffer.toString("base64") : null,
                photoMimeType: req.file ? req.file.mimetype : null,
                source: "manual",
            },
        });
        auditLog("MANUAL_SEND", { userId: req.user.id, detail: `grupo=${groupJid.replace(/@g\.us$/, "")} • foto=${!!req.file} • msg=${!!(message?.trim())}`, ip: req.ip });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── Agendamento de mensagens ───────────────────────────────────────────────────────
// Criar mensagem agendada
app.post("/schedule-message", requireSession, memUpload.single("photo"), async (req, res) => {
    const { groupJid, message, scheduledAt } = req.body;
    if (!groupJid) return res.status(400).json({ error: "Grupo não informado" });
    if ((!message || !message.trim()) && !req.file) return res.status(400).json({ error: "Envie mensagem ou imagem" });
    const ts = new Date(scheduledAt);
    if (isNaN(ts.getTime())) return res.status(400).json({ error: "Data/hora inválida" });
    if (ts <= new Date()) return res.status(400).json({ error: "O horário deve ser no futuro" });
    const sm = await prisma.scheduledMessage.create({
        data: {
            userId: req.user.id,
            groupJid,
            message: message?.trim() || null,
            mediaBase64: req.file ? req.file.buffer.toString("base64") : null,
            mediaMimeType: req.file ? req.file.mimetype : null,
            scheduledAt: ts,
        },
    });
    console.log(`[BOT:${req.user.id}] 🕑 Mensagem agendada para ${ts.toISOString()}`);
    auditLog("SCHEDULE_CREATE", { userId: req.user.id, detail: `grupo=${groupJid.replace(/@g\.us$/, "")} • em=${ts.toLocaleString("pt-BR")} • foto=${!!req.file}`, ip: req.ip });
    res.status(201).json(sm);
});

// Listar mensagens agendadas do usuário
app.get("/scheduled-messages", requireSession, async (req, res) => {
    const msgs = await prisma.scheduledMessage.findMany({
        where: { userId: req.user.id },
        orderBy: { scheduledAt: "asc" },
        take: 100,
    });
    res.json(msgs);
});

// Cancelar mensagem agendada
app.delete("/scheduled-messages/:id", requireSession, async (req, res) => {
    const id = parseInt(req.params.id);
    const sm = await prisma.scheduledMessage.findFirst({
        where: { id, userId: req.user.id, sent: false },
    });
    if (!sm) return res.status(404).json({ error: "Mensagem não encontrada ou já enviada" });
    await prisma.scheduledMessage.delete({ where: { id } });
    auditLog("SCHEDULE_CANCEL", { userId: req.user.id, detail: `id=${id} • grupo=${sm.groupJid.replace(/@g\.us$/, "")} • em=${sm.scheduledAt.toLocaleString("pt-BR")}`, ip: req.ip });
    res.json({ success: true });
});

// ── Helper: fecha socket do usuário e inicia nova conexão ───────────────────────────
function forceNewConnection(userId, pairingPhone = null, clearSession = false) {
    const conn = getConn(userId);
    if (conn.reconnectTimer) { clearTimeout(conn.reconnectTimer); conn.reconnectTimer = null; }
    conn.socketId++;
    conn.isConnecting = false;
    conn.qrRetryCount = 0;
    conn.pairingAcknowledged = false;
    conn.pairingCode = null;
    conn.intentionalClose = true;
    try { if (conn.sock) conn.sock.end(); } catch { }
    conn.intentionalClose = false;
    conn.sock = null;
    conn.qrBase64 = null;

    if (clearSession) {
        const userAuthDir = authDirFor(userId);
        fs.rmSync(userAuthDir, { recursive: true, force: true });
        fs.mkdirSync(userAuthDir, { recursive: true });
        console.log(`[BOT:${userId}] 🗑️  Sessão apagada`);
    }
    scheduleReconnect(userId, pairingPhone, 1500);
}

// ── Conectar com Código de Pareamento ────────────────────────────────────────
app.post("/start-pairing", requireSession, async (req, res) => {
    const { phone } = req.body;
    if (!phone) return res.status(400).json({ error: "Informe o número de telefone" });
    const digits = phone.replace(/\D/g, "");
    if (digits.length < 12) return res.status(400).json({ error: "Número incompleto. Use: código do país + DDD + número (ex: 5521999999999)" });
    console.log(`[BOT:${req.user.id}] 📱 Iniciando pareamento para ${digits}`);
    forceNewConnection(req.user.id, digits, true);
    res.json({ success: true });
});

// ── Desconectar ───────────────────────────────────────────────────────────────────────────
app.post("/disconnect", requireSession, async (req, res) => {
    const conn = getConn(req.user.id);
    if (conn.reconnectTimer) { clearTimeout(conn.reconnectTimer); conn.reconnectTimer = null; }
    conn.socketId++;
    conn.isConnecting = false;
    conn.intentionalClose = true;
    conn.pairingAcknowledged = false;
    conn.pairingCode = null;
    conn.qrBase64 = null;
    try { if (conn.sock) conn.sock.end(); } catch { }
    conn.sock = null;
    conn.status = "disconnected";
    const userAuthDir = authDirFor(req.user.id);
    fs.rmSync(userAuthDir, { recursive: true, force: true });
    fs.mkdirSync(userAuthDir, { recursive: true });
    console.log(`[BOT:${req.user.id}] 🗑️  Sessão apagada — aguardando novo pareamento`);
    res.json({ success: true });
});

app.post("/reset", requireSession, async (req, res) => {
    forceNewConnection(req.user.id, null, true);
    res.json({ success: true });
});

// ── Processador de mensagens agendadas (a cada 30s) ───────────────────────────
setInterval(async () => {
    try {
        const now = new Date();
        const pending = await prisma.scheduledMessage.findMany({
            where: { sent: false, scheduledAt: { lte: now } },
        });
        for (const sm of pending) {
            const conn = getConn(sm.userId);
            if (!conn.sock || conn.status !== "open") continue;
            try {
                if (sm.message) await conn.sock.sendMessage(sm.groupJid, { text: sm.message });
                if (sm.mediaBase64 && sm.mediaMimeType) {
                    const buf = Buffer.from(sm.mediaBase64, "base64");
                    await conn.sock.sendMessage(sm.groupJid, { image: buf, mimetype: sm.mediaMimeType });
                }
                await prisma.scheduledMessage.update({
                    where: { id: sm.id },
                    data: { sent: true, sentAt: new Date() },
                });
                console.log(`[SCHED:${sm.userId}] ✅ Mensagem ${sm.id} enviada para ${sm.groupJid}`);
            } catch (err) {
                await prisma.scheduledMessage.update({
                    where: { id: sm.id },
                    data: { error: err.message },
                });
                console.error(`[SCHED:${sm.userId}] ❌ Erro ao enviar ${sm.id}:`, err.message);
            }
        }
    } catch (err) {
        console.error("[SCHED] Erro no processador:", err.message);
    }
}, 30 * 1000);

// ── CRUD de Boxes (ADMIN) ─────────────────────────────────────────────────────
app.get("/boxes", requireSession, requireAdmin, async (_req, res) => {
    const boxes = await prisma.box.findMany({ orderBy: { name: "asc" }, include: { _count: { select: { users: true } } } });
    res.json(boxes);
});

app.post("/boxes", requireSession, requireAdmin, async (req, res) => {
    const name = (req.body.name || "").trim();
    if (!name) return res.status(400).json({ error: "Nome do box é obrigatório" });
    try {
        const box = await prisma.box.create({ data: { name } });
        res.status(201).json(box);
    } catch (err) {
        if (err.code === "P2002") return res.status(409).json({ error: "Já existe um box com esse nome" });
        res.status(500).json({ error: "Erro interno" });
    }
});

app.delete("/boxes/:id", requireSession, requireAdmin, async (req, res) => {
    const id = parseInt(req.params.id);
    await prisma.box.delete({ where: { id } }).catch(() => { });
    res.json({ success: true });
});

// ── Perfil do usuário atual (ALUNO pode editar nome/senha) ──────────────────
app.patch("/auth/profile", requireSession, async (req, res) => {
    const { name, password, newPassword, avatar } = req.body;
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user) return res.status(404).json({ error: "Usuário não encontrado" });

    const data = {};

    if (name && name.trim()) data.name = name.trim();

    if (avatar !== undefined) {
        // aceita null (remover foto) ou string base64
        if (avatar !== null && typeof avatar !== "string") return res.status(400).json({ error: "Avatar inválido" });
        if (avatar && avatar.length > 2 * 1024 * 1024) return res.status(413).json({ error: "Foto muito grande (máx 1.5 MB)" });
        data.avatar = avatar;
    }

    if (newPassword) {
        if (!password) return res.status(400).json({ error: "Informe a senha atual" });
        const ok = await bcrypt.compare(password, user.password);
        if (!ok) return res.status(401).json({ error: "Senha atual incorreta" });
        if (newPassword.length < 8) return res.status(400).json({ error: "Nova senha deve ter no mínimo 8 caracteres" });
        data.password = await bcrypt.hash(newPassword, 12);
    }

    if (Object.keys(data).length === 0) return res.status(400).json({ error: "Nada para atualizar" });

    const updated = await prisma.user.update({ where: { id: req.user.id }, data, include: { box: true } });
    if (data.password) {
        // Senha alterada: invalida TODAS as sessões (incluindo atual) → força novo login
        await prisma.session.deleteMany({ where: { userId: req.user.id } });
        return res.json({ ...publicUser(updated), passwordChanged: true });
    }
    res.json(publicUser(updated));
});

// ───────────────────────────────────────────────────────────────────────────────
// ── PROGRAMAÇÃO DO BOX (WOD) ──────────────────────────────────────────────────
// ───────────────────────────────────────────────────────────────────────────────

// Listar programações (ALUNO vê do seu box; ADMIN vê do box selecionado ou todos)
app.get("/box/programs", requireSession, async (req, res) => {
    try {
        const where = {};
        if (req.user.role === "ALUNO" && req.user.boxId) {
            where.boxId = req.user.boxId;
        } else if (req.query.boxId) {
            where.boxId = parseInt(req.query.boxId);
        }
        const programs = await prisma.boxProgram.findMany({
            where,
            orderBy: { date: "desc" },
            take: 30,
            select: {
                id: true, boxId: true, date: true, title: true, content: true,
                imageMimeType: true, createdBy: true, createdAt: true, updatedAt: true,
                user: { select: { name: true } }, box: { select: { name: true } },
            },
        });
        // Flag para indicar se tem imagem, sem enviar os dados
        res.json(programs.map(p => ({ ...p, hasImage: !!p.imageMimeType })));
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Servir imagem do WOD (aceita token via query string para uso em <img>)
app.get("/box/programs/:id/image", async (req, res) => {
    try {
        // Auth via header ou query param
        let userId;
        const authHeader = req.headers.authorization;
        const queryToken = req.query.token;
        const tokenStr = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : queryToken;
        if (!tokenStr) return res.status(401).json({ error: "Token necessário" });
        try {
            const decoded = jwt.verify(tokenStr, JWT_SECRET);
            userId = decoded.id;
        } catch { return res.status(401).json({ error: "Token inválido" }); }
        const user = await prisma.user.findUnique({ where: { id: userId }, select: { role: true, boxId: true } });
        if (!user) return res.status(401).json({ error: "Usuário não encontrado" });

        const program = await prisma.boxProgram.findUnique({
            where: { id: parseInt(req.params.id) },
            select: { imageData: true, imageMimeType: true, boxId: true },
        });
        if (!program || !program.imageData) return res.status(404).json({ error: "Imagem não encontrada" });
        if (user.role === "ALUNO" && program.boxId !== user.boxId) return res.status(403).json({ error: "Sem permissão" });
        const buffer = Buffer.from(program.imageData, "base64");
        res.set("Content-Type", program.imageMimeType || "image/jpeg");
        res.set("Cache-Control", "public, max-age=86400");
        res.send(buffer);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post("/box/programs", requireSession, requireAdmin, async (req, res) => {
    const { boxId, date, title, content } = req.body;
    if (!boxId || !date || !title?.trim() || !content?.trim()) return res.status(400).json({ error: "boxId, date, title e content são obrigatórios" });
    try {
        const program = await prisma.boxProgram.create({
            data: { boxId: parseInt(boxId), date: new Date(date), title: title.trim(), content: content.trim(), createdBy: req.user.id },
        });
        res.status(201).json(program);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put("/box/programs/:id", requireSession, requireAdmin, async (req, res) => {
    const id = parseInt(req.params.id);
    const { date, title, content } = req.body;
    try {
        const program = await prisma.boxProgram.update({
            where: { id },
            data: { ...(date && { date: new Date(date) }), ...(title && { title: title.trim() }), ...(content && { content: content.trim() }), updatedAt: new Date() },
        });
        res.json(program);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete("/box/programs/:id", requireSession, requireAdmin, async (req, res) => {
    const id = parseInt(req.params.id);
    await prisma.boxProgram.delete({ where: { id } }).catch(() => { });
    res.json({ success: true });
});

// ───────────────────────────────────────────────────────────────────────────────
// ── HORÁRIOS DO BOX ───────────────────────────────────────────────────────────
// ───────────────────────────────────────────────────────────────────────────────

app.get("/box/schedules", requireSession, async (req, res) => {
    try {
        const where = {};
        if (req.user.role === "ALUNO") {
            where.active = true;
            if (req.user.boxId) where.boxId = req.user.boxId;
        } else if (req.query.boxId) {
            where.boxId = parseInt(req.query.boxId);
        }
        const schedules = await prisma.boxSchedule.findMany({
            where,
            orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
            include: { box: { select: { name: true } } },
        });
        res.json(schedules);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post("/box/schedules", requireSession, requireAdmin, async (req, res) => {
    const { boxId, dayOfWeek, startTime, endTime, className, coach } = req.body;
    if (!boxId || dayOfWeek === undefined || !startTime || !endTime || !className?.trim()) return res.status(400).json({ error: "Campos obrigatórios faltando" });
    try {
        const schedule = await prisma.boxSchedule.create({
            data: { boxId: parseInt(boxId), dayOfWeek: parseInt(dayOfWeek), startTime, endTime, className: className.trim(), coach: coach?.trim() || null },
        });
        res.status(201).json(schedule);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put("/box/schedules/:id", requireSession, requireAdmin, async (req, res) => {
    const id = parseInt(req.params.id);
    const { dayOfWeek, startTime, endTime, className, coach, active } = req.body;
    try {
        const schedule = await prisma.boxSchedule.update({
            where: { id },
            data: {
                ...(dayOfWeek !== undefined && { dayOfWeek: parseInt(dayOfWeek) }),
                ...(startTime && { startTime }),
                ...(endTime && { endTime }),
                ...(className && { className: className.trim() }),
                ...(coach !== undefined && { coach: coach?.trim() || null }),
                ...(active !== undefined && { active }),
            },
        });
        res.json(schedule);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete("/box/schedules/:id", requireSession, requireAdmin, async (req, res) => {
    const id = parseInt(req.params.id);
    await prisma.boxSchedule.delete({ where: { id } }).catch(() => { });
    res.json({ success: true });
});

// ───────────────────────────────────────────────────────────────────────────────
// ── PLANOS DO BOX ─────────────────────────────────────────────────────────────
// ───────────────────────────────────────────────────────────────────────────────

app.get("/box/plans", requireSession, async (req, res) => {
    try {
        const where = {};
        if (req.user.role === "ALUNO") {
            where.active = true;
            if (req.user.boxId) where.boxId = req.user.boxId;
        } else if (req.query.boxId) {
            where.boxId = parseInt(req.query.boxId);
        }
        const plans = await prisma.boxPlan.findMany({
            where,
            orderBy: [{ sortOrder: "asc" }, { price: "asc" }],
            include: { box: { select: { name: true } } },
        });
        res.json(plans);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post("/box/plans", requireSession, requireAdmin, async (req, res) => {
    const { boxId, name, description, price, period, features, highlighted, sortOrder } = req.body;
    if (!boxId || !name?.trim() || price === undefined) return res.status(400).json({ error: "boxId, name e price são obrigatórios" });
    try {
        const plan = await prisma.boxPlan.create({
            data: {
                boxId: parseInt(boxId), name: name.trim(), description: description?.trim() || null,
                price: parseFloat(price), period: period || "mensal", features: features || null,
                highlighted: !!highlighted, sortOrder: sortOrder || 0,
            },
        });
        res.status(201).json(plan);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put("/box/plans/:id", requireSession, requireAdmin, async (req, res) => {
    const id = parseInt(req.params.id);
    const { name, description, price, period, features, highlighted, active, sortOrder } = req.body;
    try {
        const plan = await prisma.boxPlan.update({
            where: { id },
            data: {
                ...(name && { name: name.trim() }),
                ...(description !== undefined && { description: description?.trim() || null }),
                ...(price !== undefined && { price: parseFloat(price) }),
                ...(period && { period }),
                ...(features !== undefined && { features }),
                ...(highlighted !== undefined && { highlighted: !!highlighted }),
                ...(active !== undefined && { active }),
                ...(sortOrder !== undefined && { sortOrder }),
            },
        });
        res.json(plan);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete("/box/plans/:id", requireSession, requireAdmin, async (req, res) => {
    const id = parseInt(req.params.id);
    await prisma.boxPlan.delete({ where: { id } }).catch(() => { });
    res.json({ success: true });
});

// ───────────────────────────────────────────────────────────────────────────────
// ── FLUXO DE ATENDIMENTO (BOT DE VENDAS) ──────────────────────────────────────
// ───────────────────────────────────────────────────────────────────────────────

// Obter configuração do fluxo
app.get("/flow/config", requireSession, async (req, res) => {
    try {
        const cfg = await getFlowConfig(req.user.id);
        res.json(cfg);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Atualizar configuração geral do fluxo
app.put("/flow/config", requireSession, async (req, res) => {
    const {
        enabled, ownerName, welcomeMessage, menuMessage, offHoursMessage, humanMessage,
        attendanceStart, attendanceEnd, reminderDays, followupMessage,
    } = req.body;
    const data = {};
    if (enabled !== undefined) data.enabled = !!enabled;
    if (ownerName !== undefined) data.ownerName = String(ownerName).slice(0, 100);
    if (welcomeMessage !== undefined) data.welcomeMessage = String(welcomeMessage).slice(0, 2000);
    if (menuMessage !== undefined) data.menuMessage = String(menuMessage).slice(0, 500);
    if (offHoursMessage !== undefined) data.offHoursMessage = String(offHoursMessage).slice(0, 500);
    if (humanMessage !== undefined) data.humanMessage = String(humanMessage).slice(0, 500);
    if (followupMessage !== undefined) data.followupMessage = String(followupMessage).slice(0, 1000);
    if (attendanceStart !== undefined) {
        const v = parseInt(attendanceStart);
        if (!isNaN(v) && v >= 0 && v <= 23) data.attendanceStart = v;
    }
    if (attendanceEnd !== undefined) {
        const v = parseInt(attendanceEnd);
        if (!isNaN(v) && v >= 0 && v <= 24) data.attendanceEnd = v;
    }
    if (reminderDays !== undefined) {
        const v = parseInt(reminderDays);
        if (!isNaN(v) && v >= 1 && v <= 30) data.reminderDays = v;
    }
    if (Object.keys(data).length === 0) return res.status(400).json({ error: "Nada para atualizar" });
    try {
        await prisma.flowConfig.upsert({
            where: { userId: req.user.id },
            update: data,
            create: { userId: req.user.id, ...data },
        });
        auditLog("FLOW_CONFIG_SAVE", { userId: req.user.id, ip: req.ip });
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Adicionar item ao menu (aceita parentId para sub-menus)
app.post("/flow/menu-items", requireSession, async (req, res) => {
    const { label, description, price, isHuman, sortOrder, parentId } = req.body;
    if (!label?.trim()) return res.status(400).json({ error: "Label obrigatório" });
    try {
        const cfg = await getFlowConfig(req.user.id);
        // Valida parentId se informado
        if (parentId != null) {
            const parent = await prisma.flowMenuItem.findFirst({ where: { id: parseInt(parentId), configId: cfg.id } });
            if (!parent) return res.status(400).json({ error: "parentId inválido" });
        }
        const siblingsCount = await prisma.flowMenuItem.count({ where: { configId: cfg.id, parentId: parentId ?? null } });
        const item = await prisma.flowMenuItem.create({
            data: {
                configId: cfg.id,
                parentId: parentId ?? null,
                label: label.trim(),
                description: (description || "").trim(),
                price: (price || "").trim(),
                isHuman: !!isHuman,
                sortOrder: sortOrder ?? siblingsCount,
            },
        });
        res.status(201).json(item);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Atualizar item do menu
app.put("/flow/menu-items/:id", requireSession, async (req, res) => {
    const id = parseInt(req.params.id);
    const { label, description, price, isHuman, sortOrder, parentId } = req.body;
    try {
        const cfg = await getFlowConfig(req.user.id);
        const item = await prisma.flowMenuItem.findFirst({ where: { id, configId: cfg.id } });
        if (!item) return res.status(404).json({ error: "Item não encontrado" });
        const updated = await prisma.flowMenuItem.update({
            where: { id },
            data: {
                ...(label !== undefined && { label: String(label).trim() }),
                ...(description !== undefined && { description: String(description).trim() }),
                ...(price !== undefined && { price: String(price).trim() }),
                ...(isHuman !== undefined && { isHuman: !!isHuman }),
                ...(sortOrder !== undefined && { sortOrder: parseInt(sortOrder) }),
                ...(parentId !== undefined && { parentId: parentId === null ? null : parseInt(parentId) }),
            },
        });
        res.json(updated);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Deletar item do menu (e todos seus filhos em cascata)
async function deleteMenuItemCascade(id) {
    const children = await prisma.flowMenuItem.findMany({ where: { parentId: id } });
    for (const child of children) await deleteMenuItemCascade(child.id);
    await prisma.flowMenuItem.delete({ where: { id } });
}
app.delete("/flow/menu-items/:id", requireSession, async (req, res) => {
    const id = parseInt(req.params.id);
    try {
        const cfg = await getFlowConfig(req.user.id);
        const item = await prisma.flowMenuItem.findFirst({ where: { id, configId: cfg.id } });
        if (!item) return res.status(404).json({ error: "Item não encontrado" });
        await deleteMenuItemCascade(id);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Listar leads
app.get("/flow/leads", requireSession, async (req, res) => {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 20));
    const converted = req.query.converted !== undefined ? req.query.converted === "true" : undefined;
    const where = { userId: req.user.id };
    if (converted !== undefined) where.converted = converted;
    try {
        const [total, leads] = await Promise.all([
            prisma.flowLead.count({ where }),
            prisma.flowLead.findMany({
                where,
                orderBy: { lastContact: "desc" },
                skip: (page - 1) * limit,
                take: limit,
            }),
        ]);
        res.json({ leads, total, page, pages: Math.ceil(total / limit) });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Marcar lead como convertido manualmente
app.patch("/flow/leads/:id/convert", requireSession, async (req, res) => {
    const id = parseInt(req.params.id);
    const lead = await prisma.flowLead.findFirst({ where: { id, userId: req.user.id } });
    if (!lead) return res.status(404).json({ error: "Lead não encontrado" });
    await prisma.flowLead.update({ where: { id }, data: { converted: true, step: "transferred" } });
    res.json({ success: true });
});

// Deletar lead
app.delete("/flow/leads/:id", requireSession, async (req, res) => {
    const id = parseInt(req.params.id);
    const lead = await prisma.flowLead.findFirst({ where: { id, userId: req.user.id } });
    if (!lead) return res.status(404).json({ error: "Lead não encontrado" });
    await prisma.flowLead.delete({ where: { id } });
    res.json({ success: true });
});

// Estatísticas do fluxo
app.get("/flow/stats", requireSession, async (req, res) => {
    try {
        const [total, converted, pending] = await Promise.all([
            prisma.flowLead.count({ where: { userId: req.user.id } }),
            prisma.flowLead.count({ where: { userId: req.user.id, converted: true } }),
            prisma.flowLead.count({ where: { userId: req.user.id, converted: false } }),
        ]);
        res.json({ total, converted, pending, conversionRate: total ? Math.round((converted / total) * 100) : 0 });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Error handler global (deve ficar por último) ───────────────────────────────
app.use(errorHandler);

// ── Frontend (CRM) ──────────────────────────────────────────────────────────
const CRM_BUILD_DIR = path.join(__dirname, "build");
app.use(express.static(CRM_BUILD_DIR));
app.get(/^(?!\/uploads).*/, (req, res, next) => {
    if (req.method !== "GET" || req.accepts("html") !== "html") return next();
    res.sendFile(path.join(CRM_BUILD_DIR, "index.html"));
});

// ── Limpeza de sessões expiradas (a cada hora) ──────────────────────────────
setInterval(async () => {
    try {
        const { count } = await prisma.session.deleteMany({ where: { expiresAt: { lt: new Date() } } });
        if (count > 0) console.log(`[CLEANUP] ${count} sessões expiradas removidas`);
    } catch { }
}, 60 * 60 * 1000);

// ── Iniciar: reconecta usuários com sessão salva ───────────────────────────────
app.listen(PORT, "127.0.0.1", () => {
    console.log(`[BOT] Servidor rodando em http://localhost:${PORT}`);
    console.log(`[BOT] Banco: PostgreSQL`);

    // Varre auth_info/ buscando subdirs numéricos (= userIds com sessão salva)
    if (fs.existsSync(AUTH_BASE_DIR)) {
        const entries = fs.readdirSync(AUTH_BASE_DIR);
        for (const entry of entries) {
            const userId = parseInt(entry);
            if (!isNaN(userId) && fs.existsSync(path.join(AUTH_BASE_DIR, entry, "creds.json"))) {
                console.log(`[BOT] 🔄 Reconectando sessão do usuário ${userId}...`);
                connectWhatsApp(userId, null);
            }
        }
    }
});
