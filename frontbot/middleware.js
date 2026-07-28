const jwt = require("jsonwebtoken");
const prisma = require("./prismaClient");

const JWT_SECRET = process.env.JWT_SECRET || "chatbox_jwt_secret_change_me_in_prod";

// ── Autenticação via Bearer token ────────────────────────────────────────────
function requireAuth(req, res, next) {
    const header = req.headers.authorization;
    if (!header || !header.startsWith("Bearer ")) {
        return res.status(401).json({ error: "Token não fornecido" });
    }
    try {
        const payload = jwt.verify(header.slice(7), JWT_SECRET);
        req.user = payload;
        next();
    } catch {
        return res.status(401).json({ error: "Token inválido ou expirado" });
    }
}

// ── Verifica se a sessão ainda existe no banco (revogável) ───────────────────
function requireSession(req, res, next) {
    const header = req.headers.authorization;
    if (!header || !header.startsWith("Bearer ")) {
        return res.status(401).json({ error: "Token não fornecido" });
    }
    const token = header.slice(7);

    let payload;
    try {
        payload = jwt.verify(token, JWT_SECRET);
    } catch {
        return res.status(401).json({ error: "Token inválido ou expirado" });
    }

    prisma.session
        .findUnique({ where: { token }, include: { user: true } })
        .then((session) => {
            if (!session || session.expiresAt < new Date()) {
                return res.status(401).json({ error: "Sessão expirada ou revogada" });
            }
            if (!session.user.active) {
                return res.status(403).json({ error: "Conta desativada" });
            }
            req.user = {
                id: session.user.id,
                email: session.user.email,
                name: session.user.name,
                role: session.user.role,
                boxId: session.user.boxId ?? null,
            };
            req.sessionId = session.id;
            next();
        })
        .catch(() => res.status(500).json({ error: "Erro interno de autenticação" }));
}

// ── Exige role ADMIN ─────────────────────────────────────────────────────────
function requireAdmin(req, res, next) {
    if (!req.user || req.user.role !== "ADMIN") {
        return res.status(403).json({ error: "Acesso restrito a administradores" });
    }
    next();
}

// ── Exige role ADMIN ou USER ─────────────────────────────────────────────────
function requireStaff(req, res, next) {
    if (!req.user || !['ADMIN', 'USER'].includes(req.user.role)) {
        return res.status(403).json({ error: "Acesso restrito a membros da equipe" });
    }
    next();
}

// ── Validação de entrada para login ──────────────────────────────────────────
function validateLogin(req, res, next) {
    const { email, password } = req.body;
    if (!email || !password) {
        return res.status(400).json({ error: "Email e senha são obrigatórios" });
    }
    if (typeof email !== "string" || typeof password !== "string") {
        return res.status(400).json({ error: "Formato inválido" });
    }
    // Normaliza email
    req.body.email = email.trim().toLowerCase();
    next();
}

// ── Validação de entrada para registro ───────────────────────────────────────
function validateRegister(req, res, next) {
    const { email, password, name } = req.body;
    if (!email || !password) {
        return res.status(400).json({ error: "Email e senha são obrigatórios" });
    }
    if (typeof email !== "string" || typeof password !== "string") {
        return res.status(400).json({ error: "Formato inválido" });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        return res.status(400).json({ error: "Email inválido" });
    }
    if (password.length < 8) {
        return res.status(400).json({ error: "Senha deve ter no mínimo 8 caracteres" });
    }
    if (name && (typeof name !== "string" || name.length > 100)) {
        return res.status(400).json({ error: "Nome inválido" });
    }

    req.body.email = email.trim().toLowerCase();
    if (name) req.body.name = name.trim();
    next();
}

// ── Rate limiter simples em memória (por IP) ─────────────────────────────────
function createRateLimiter(windowMs, maxRequests) {
    const hits = new Map();

    // Limpa entradas antigas a cada minuto
    setInterval(() => {
        const now = Date.now();
        for (const [key, data] of hits) {
            if (now - data.start > windowMs) hits.delete(key);
        }
    }, 60_000).unref();

    return (req, res, next) => {
        const ip = req.ip || req.socket.remoteAddress || "unknown";
        const now = Date.now();
        const record = hits.get(ip);

        if (!record || now - record.start > windowMs) {
            hits.set(ip, { start: now, count: 1 });
            return next();
        }

        record.count++;
        if (record.count > maxRequests) {
            res.set("Retry-After", Math.ceil((record.start + windowMs - now) / 1000));
            return res.status(429).json({ error: "Muitas requisições. Tente novamente mais tarde." });
        }
        next();
    };
}

// ── Rate limiter mais restritivo para auth (brute-force) ─────────────────────
const authLimiter = createRateLimiter(
    15 * 60 * 1000, // 15 minutos
    20              // máximo 20 tentativas por IP
);

// ── Rate limiter geral ───────────────────────────────────────────────────────
const generalLimiter = createRateLimiter(
    parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
    parseInt(process.env.RATE_LIMIT_MAX) || 100
);

// ── Helmet-like security headers ─────────────────────────────────────────────
function securityHeaders(req, res, next) {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("X-XSS-Protection", "0"); // desativado em favor de CSP
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    res.removeHeader("X-Powered-By");
    next();
}

// ── Logger de requisições ────────────────────────────────────────────────────
function requestLogger(req, res, next) {
    const start = Date.now();
    res.on("finish", () => {
        const duration = Date.now() - start;
        const logLine = `${req.method} ${req.originalUrl} ${res.statusCode} ${duration}ms`;
        if (res.statusCode >= 400) {
            console.warn(`[HTTP] ⚠️  ${logLine}`);
        }
    });
    next();
}

// ── Audit log helper ─────────────────────────────────────────────────────────
async function auditLog(action, { userId = null, detail = null, ip = null } = {}) {
    try {
        await prisma.auditLog.create({
            data: { action, userId, detail, ip },
        });
    } catch (err) {
        console.error("[AUDIT] Erro ao gravar log:", err.message);
    }
}

// ── Error handler global ─────────────────────────────────────────────────────
function errorHandler(err, req, res, _next) {
    console.error("[ERROR]", err.stack || err.message);

    if (err.type === "entity.parse.failed") {
        return res.status(400).json({ error: "JSON inválido" });
    }
    if (err.code === "LIMIT_FILE_SIZE") {
        return res.status(413).json({ error: "Arquivo muito grande (máx 10MB)" });
    }
    if (err.message && err.message.includes("Tipo não permitido")) {
        return res.status(400).json({ error: err.message });
    }

    res.status(500).json({ error: "Erro interno do servidor" });
}

module.exports = {
    JWT_SECRET,
    requireAuth,
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
    createRateLimiter,
};
