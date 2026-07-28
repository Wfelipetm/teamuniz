import { useState, useEffect, useCallback, useRef } from "react";
import Head from "next/head";

const API = process.env.NEXT_PUBLIC_BOT_API_URL || "http://localhost:3001";
const DAYS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
const DAY_ICONS = ["☀️", "💪", "🔥", "⚡", "🏋️", "🎯", "🧘"];

export default function Home() {
    // ── Auth ──
    const [token, setToken] = useState(null);
    const [authChecked, setAuthChecked] = useState(false);
    const [loginEmail, setLoginEmail] = useState("");

    // ── PWA install prompt ──
    const [installPrompt, setInstallPrompt] = useState(null);
    const [isStandalone, setIsStandalone] = useState(false);
    const [showInstallModal, setShowInstallModal] = useState(false);
    const [showUserMenu, setShowUserMenu] = useState(false);
    const [showProfileModal, setShowProfileModal] = useState(false);
    const [profileName, setProfileName] = useState("");
    const [profileAvatarFile, setProfileAvatarFile] = useState(null);
    const [profileCurrentPwd, setProfileCurrentPwd] = useState("");
    const [profileNewPwd, setProfileNewPwd] = useState("");
    const [profileConfirmPwd, setProfileConfirmPwd] = useState("");
    const [profileSaving, setProfileSaving] = useState(false);
    const [showPwd, setShowPwd] = useState({ current: false, newp: false, confirm: false });
    useEffect(() => {
        setIsStandalone(
            window.matchMedia("(display-mode: standalone)").matches ||
            window.navigator.standalone === true
        );
        const handler = (e) => { e.preventDefault(); setInstallPrompt(e); };
        window.addEventListener("beforeinstallprompt", handler);
        return () => window.removeEventListener("beforeinstallprompt", handler);
    }, []);
    const handleInstall = async () => {
        if (installPrompt) {
            installPrompt.prompt();
            const { outcome } = await installPrompt.userChoice;
            if (outcome === "accepted") setIsStandalone(true);
            setInstallPrompt(null);
        } else {
            setShowInstallModal(true);
        }
    };
    const [loginPassword, setLoginPassword] = useState("");
    const [loginError, setLoginError] = useState("");
    const [loginLoading, setLoginLoading] = useState(false);
    // ── Telas públicas ──
    const [view, setView] = useState("landing"); // "landing" | "login" | "requestAccess"
    const [reqForm, setReqForm] = useState({ name: "", email: "", phone: "", message: "" });
    const [reqSending, setReqSending] = useState(false);
    const [reqSent, setReqSent] = useState(false);
    // ── Admin: solicitações de acesso ──
    const [accessRequests, setAccessRequests] = useState([]);
    const [pendingCount, setPendingCount] = useState(0);
    const [reqsLoading, setReqsLoading] = useState(false);
    const [approvedCred, setApprovedCred] = useState(null); // { email, password }
    const [currentUser, setCurrentUser] = useState(null);

    // Verifica token salvo no localStorage e valida via /auth/me
    useEffect(() => {
        const saved = typeof window !== "undefined" ? localStorage.getItem("botbox_token") : null;
        if (saved) {
            // Verifica se o token/sessão ainda é válido no backend
            fetch(`${API}/auth/me`, {
                headers: { Authorization: `Bearer ${saved}` },
            })
                .then((r) => {
                    if (r.ok) return r.json();
                    throw new Error("Token inválido");
                })
                .then((data) => {
                    setToken(saved);
                    setCurrentUser(data.user || data);
                    setAuthChecked(true);
                })
                .catch(() => {
                    localStorage.removeItem("botbox_token");
                    setAuthChecked(true);
                });
        } else {
            setAuthChecked(true);
        }
    }, []);

    // Helper para fetch autenticado — auto-logout em 401
    const authFetch = useCallback(async (url, opts = {}) => {
        const headers = { ...(opts.headers || {}) };
        if (token) headers["Authorization"] = `Bearer ${token}`;
        const r = await fetch(url, { ...opts, headers });
        if (r.status === 401 && token) {
            // Token expirado ou inválido — deslogar automaticamente
            localStorage.removeItem("botbox_token");
            setToken(null);
            setCurrentUser(null);
        }
        return r;
    }, [token]);

    const handleLogin = async (e) => {
        e.preventDefault();
        setLoginError("");
        setLoginLoading(true);
        try {
            const r = await fetch(`${API}/auth/login`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email: loginEmail, password: loginPassword }),
            });
            const d = await r.json();
            if (!r.ok) throw new Error(d.error || "Erro ao fazer login");
            localStorage.setItem("botbox_token", d.token);
            setToken(d.token);
            // Re-fetch /auth/me para garantir dados completos (boxName, etc.)
            try {
                const me = await fetch(`${API}/auth/me`, { headers: { Authorization: `Bearer ${d.token}` } });
                if (me.ok) { const md = await me.json(); setCurrentUser(md.user || md); }
                else setCurrentUser(d.user);
            } catch { setCurrentUser(d.user); }
        } catch (e) {
            setLoginError(e.message);
        }
        setLoginLoading(false);
    };

    const handleLogout = async () => {
        // Revoga sessão no backend antes de limpar localmente
        try {
            if (token) {
                await fetch(`${API}/auth/logout`, {
                    method: "POST",
                    headers: { Authorization: `Bearer ${token}` },
                });
            }
        } catch { }
        localStorage.removeItem("botbox_token");
        setToken(null);
        setCurrentUser(null);
        setGroups([]);
        setPairingCode("");
        setQr(null);
    };

    const saveProfile = async () => {
        if (profileNewPwd && profileNewPwd !== profileConfirmPwd)
            return show("As senhas não coincidem", "error");
        if (profileNewPwd && profileNewPwd.length < 8)
            return show("Senha deve ter ao menos 8 caracteres", "error");
        setProfileSaving(true);
        try {
            const body = {};
            if (profileName.trim() && profileName.trim() !== currentUser?.name) body.name = profileName.trim();
            if (profileAvatarFile) {
                const base64 = await new Promise((res, rej) => {
                    const reader = new FileReader();
                    reader.onload = e => res(e.target.result.split(",")[1]);
                    reader.onerror = rej;
                    reader.readAsDataURL(profileAvatarFile);
                });
                body.avatar = base64;
            }
            if (profileNewPwd) {
                body.newPassword = profileNewPwd;
                body.password = profileCurrentPwd;
            }
            if (!Object.keys(body).length) { show("Nenhuma alteração detectada", "info"); return; }
            const r = await authFetch(`${API}/auth/profile`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });
            const d = await r.json();
            if (!r.ok) throw new Error(d.error);
            if (d.passwordChanged) {
                show("Senha alterada! Faça login novamente.", "success");
                setTimeout(handleLogout, 1500);
                return;
            }
            setCurrentUser(d);
            show("Perfil atualizado!", "success");
            setShowProfileModal(false);
            setProfileAvatarFile(null);
            setProfileCurrentPwd("");
            setProfileNewPwd("");
            setProfileConfirmPwd("");
        } catch (e) {
            show(e.message, "error");
        } finally {
            setProfileSaving(false);
        }
    };

    const [qr, setQr] = useState(null);
    const [groups, setGroups] = useState([]);
    const [photos, setPhotos] = useState({});
    const [photoVer, setPhotoVer] = useState(0);
    const [config, setConfig] = useState({
        groupJid: "",
        message: "Bom dia! Aqui vai o treino de hoje! 💪",
        timezone: "America/Sao_Paulo",
        scheduleTime: "05:00",
    });
    const [status, setStatus] = useState("loading");
    const [toast, setToast] = useState({ text: "", type: "" });
    const [sending, setSending] = useState(false);
    const fileRefs = useRef({});

    // ── Tab ──
    const [tab, setTab] = useState("auto");

    // ── Fluxo de atendimento ──
    const [flowConfig, setFlowConfig] = useState(null);
    const [flowSaving, setFlowSaving] = useState(false);
    const [flowLeads, setFlowLeads] = useState([]);
    const [flowLeadsTotal, setFlowLeadsTotal] = useState(0);
    const [flowLeadsPage, setFlowLeadsPage] = useState(1);
    const [flowLeadsFilter, setFlowLeadsFilter] = useState("all");
    const [flowLeadsLoading, setFlowLeadsLoading] = useState(false);
    const [flowStats, setFlowStats] = useState(null);
    const [flowSection, setFlowSection] = useState("config");
    // flowItemModal: null=fechado | { mode:"add", parentId } | { mode:"edit", item }
    const [flowItemModal, setFlowItemModal] = useState(null);
    const [flowItemForm, setFlowItemForm] = useState({ label: "", description: "", price: "", isHuman: false });

    const loadFlowConfig = async () => {
        try {
            const r = await authFetch(`${API}/flow/config`);
            if (r.ok) setFlowConfig(await r.json());
        } catch { }
    };
    const loadFlowLeads = async (page = 1, filter = "all") => {
        setFlowLeadsLoading(true);
        try {
            const params = new URLSearchParams({ page, limit: 20 });
            if (filter !== "all") params.set("converted", filter === "converted" ? "true" : "false");
            const r = await authFetch(`${API}/flow/leads?${params}`);
            if (r.ok) { const d = await r.json(); setFlowLeads(d.leads); setFlowLeadsTotal(d.total); setFlowLeadsPage(page); }
        } catch { } finally { setFlowLeadsLoading(false); }
    };
    const loadFlowStats = async () => {
        try { const r = await authFetch(`${API}/flow/stats`); if (r.ok) setFlowStats(await r.json()); } catch { }
    };
    const saveFlowConfig = async (override) => {
        setFlowSaving(true);
        const payload = override !== undefined ? override : flowConfig;
        try {
            const r = await authFetch(`${API}/flow/config`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });
            if (r.ok) { show("Configuração salva!", "success"); loadFlowConfig(); }
            else show((await r.json()).error, "error");
        } catch { show("Erro ao salvar", "error"); } finally { setFlowSaving(false); }
    };
    const openAddModal = (parentId = null) => {
        setFlowItemForm({ label: "", description: "", price: "", isHuman: false });
        setFlowItemModal({ mode: "add", parentId });
    };
    const openEditModal = (item) => {
        setFlowItemForm({ label: item.label, description: item.description || "", price: item.price || "", isHuman: !!item.isHuman });
        setFlowItemModal({ mode: "edit", item });
    };
    const saveFlowItem = async () => {
        if (!flowItemForm.label.trim()) return show("Label obrigatório", "error");
        try {
            let r;
            if (flowItemModal.mode === "add") {
                r = await authFetch(`${API}/flow/menu-items`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ ...flowItemForm, parentId: flowItemModal.parentId ?? null }),
                });
            } else {
                r = await authFetch(`${API}/flow/menu-items/${flowItemModal.item.id}`, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(flowItemForm),
                });
            }
            if (r.ok) { show(flowItemModal.mode === "add" ? "Item adicionado!" : "Item salvo!", "success"); setFlowItemModal(null); loadFlowConfig(); }
            else show((await r.json()).error, "error");
        } catch { show("Erro ao salvar item", "error"); }
    };
    const deleteMenuItem = async (id) => {
        if (!confirm("Remover este item e todos os seus sub-itens?")) return;
        try {
            const r = await authFetch(`${API}/flow/menu-items/${id}`, { method: "DELETE" });
            if (r.ok) { show("Item removido", "info"); loadFlowConfig(); }
        } catch { show("Erro ao remover", "error"); }
    };
    const deleteLead = async (id) => {
        try {
            const r = await authFetch(`${API}/flow/leads/${id}`, { method: "DELETE" });
            if (r.ok) { show("Lead removido", "info"); loadFlowLeads(flowLeadsPage, flowLeadsFilter); loadFlowStats(); }
        } catch { show("Erro ao remover lead", "error"); }
    };

    // ── Admin: Usuários ──
    const [users, setUsers] = useState([]);
    const [usersLoading, setUsersLoading] = useState(false);
    const [newUser, setNewUser] = useState({ name: "", email: "", password: "", role: "USER", boxId: "" });
    const [newUserLoading, setNewUserLoading] = useState(false);
    const [newUserError, setNewUserError] = useState("");

    const loadAccessRequests = async () => {
        setReqsLoading(true);
        try {
            const r = await authFetch(`${API}/admin/access-requests`);
            if (r.ok) { const d = await r.json(); setAccessRequests(d.requests); setPendingCount(d.pending); }
        } catch { } finally { setReqsLoading(false); }
    };

    const handleApprove = async (id) => {
        const pwd = prompt("Senha inicial para o usuário (deixe em branco para gerar automaticamente):");
        if (pwd === null) return;
        try {
            const r = await authFetch(`${API}/admin/access-requests/${id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "approve", password: pwd || undefined }),
            });
            const d = await r.json();
            if (!r.ok) return show(d.error || "Erro", "error");
            show("Acesso aprovado!", "success");
            if (d.password) setApprovedCred({ email: d.email, password: d.password });
            loadAccessRequests();
        } catch { show("Erro ao aprovar", "error"); }
    };

    const handleDeny = async (id) => {
        if (!confirm("Rejeitar esta solicitação?")) return;
        try {
            const r = await authFetch(`${API}/admin/access-requests/${id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "deny" }),
            });
            if (r.ok) { show("Solicitação rejeitada", "info"); loadAccessRequests(); }
        } catch { show("Erro ao rejeitar", "error"); }
    };

    const submitAccessRequest = async (e) => {
        e.preventDefault();
        setReqSending(true);
        try {
            const r = await fetch(`${API}/auth/request-access`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(reqForm),
            });
            const d = await r.json();
            if (!r.ok) throw new Error(d.error || "Erro ao enviar");
            setReqSent(true);
        } catch (err) {
            show(err.message, "error");
        }
        setReqSending(false);
    };


    const loadUsers = async () => {
        setUsersLoading(true);
        try {
            const r = await authFetch(`${API}/admin/users`);
            if (r.ok) setUsers(await r.json());
        } catch { } finally { setUsersLoading(false); }
    };

    const toggleUser = async (id) => {
        try {
            const r = await authFetch(`${API}/admin/users/${id}/toggle`, { method: "PATCH" });
            if (r.ok) setUsers((u) => u.map((x) => x.id === id ? { ...x, active: !x.active } : x));
            else show((await r.json()).error, "error");
        } catch { show("Erro ao alterar usuário", "error"); }
    };

    const changeRole = async (id, role) => {
        try {
            const r = await authFetch(`${API}/admin/users/${id}/role`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ role }),
            });
            if (r.ok) setUsers((u) => u.map((x) => x.id === id ? { ...x, role } : x));
            else show((await r.json()).error, "error");
        } catch { show("Erro ao alterar papel", "error"); }
    };

    const deleteUser = async (id, email) => {
        if (!confirm(`Deletar ${email}? Esta ação é irreversível.`)) return;
        try {
            const r = await authFetch(`${API}/admin/users/${id}`, { method: "DELETE" });
            if (r.ok) { setUsers((u) => u.filter((x) => x.id !== id)); show("Usuário deletado", "success"); }
            else show((await r.json()).error, "error");
        } catch { show("Erro ao deletar", "error"); }
    };

    const createUser = async (e) => {
        e.preventDefault();
        setNewUserError("");
        if (newUser.password.length < 8) { setNewUserError("Senha deve ter no mínimo 8 caracteres"); return; }
        setNewUserLoading(true);
        try {
            const r = await authFetch(`${API}/admin/users`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(newUser),
            });
            const d = await r.json();
            if (!r.ok) { setNewUserError(d.error || "Erro ao criar usuário"); return; }
            setUsers((u) => [d, ...u]);
            setNewUser({ name: "", email: "", password: "", role: "USER", boxId: "" });
            show(`Usuário ${d.email} criado!`, "success");
        } catch { setNewUserError("Erro interno"); } finally { setNewUserLoading(false); }
    };

    // ── Pareamento por código ──
    const [pairingPhone, setPairingPhone] = useState("");
    const formatPhone = (v) => {
        const d = v.replace(/\D/g, "").slice(0, 13);
        if (d.length <= 2) return d;
        if (d.length <= 4) return `+${d.slice(0, 2)} (${d.slice(2)}`;
        if (d.length <= 9) return `+${d.slice(0, 2)} (${d.slice(2, 4)}) ${d.slice(4)}`;
        return `+${d.slice(0, 2)} (${d.slice(2, 4)}) ${d.slice(4, 9)}-${d.slice(9)}`;
    };
    const [pairingCode, setPairingCode] = useState("");
    const [pairingLoading, setPairingLoading] = useState(false);

    // ── Automações de grupo (tab "manual") ──
    const DAYS_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
    const emptyDays = () => [0, 1, 2, 3, 4, 5, 6].map(day => ({ day, message: "", enabled: true }));

    const [groupAutomations, setGroupAutomations] = useState([]);
    // autoModal: null | { mode:"add" } | { mode:"edit", item } | { mode:"days", item }
    const [autoModal, setAutoModal] = useState(null);
    const [autoForm, setAutoForm] = useState({ groupJid: "", groupName: "", timezone: "America/Sao_Paulo", scheduleTime: "05:00", active: true });
    const [autoDays, setAutoDays] = useState(emptyDays());
    const [autoSaving, setAutoSaving] = useState(false);

    const loadGroupAutomations = async () => {
        try {
            const r = await authFetch(`${API}/group-automations`);
            if (r.ok) setGroupAutomations(await r.json());
        } catch { }
    };

    const openAddAutoModal = () => {
        setAutoForm({ groupJid: "", groupName: "", timezone: "America/Sao_Paulo", scheduleTime: "05:00", active: true });
        setAutoModal({ mode: "add" });
    };

    const openEditAutoModal = (item) => {
        setAutoForm({ groupJid: item.groupJid, groupName: item.groupName || "", timezone: item.timezone, scheduleTime: item.scheduleTime, active: item.active });
        setAutoModal({ mode: "edit", item });
    };

    const openDaysModal = (item) => {
        const merged = emptyDays().map(def => {
            const found = (item.days || []).find(d => d.day === def.day);
            return found ? { ...def, message: found.message, enabled: found.enabled } : def;
        });
        setAutoDays(merged);
        setAutoModal({ mode: "days", item });
    };

    const saveAutoModal = async () => {
        if (!autoForm.groupJid) return show("Selecione um grupo", "error");
        setAutoSaving(true);
        try {
            const groupName = groups.find(g => g.jid === autoForm.groupJid)?.name || autoForm.groupName || "";
            const payload = { ...autoForm, groupName };
            let r;
            if (autoModal.mode === "add") {
                r = await authFetch(`${API}/group-automations`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
            } else {
                r = await authFetch(`${API}/group-automations/${autoModal.item.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
            }
            const d = await r.json();
            if (!r.ok) throw new Error(d.error);
            show(autoModal.mode === "add" ? "Automação criada! Agora configure as mensagens por dia." : "Automação salva!", "success");
            if (autoModal.mode === "add") {
                setAutoModal({ mode: "days", item: d });
                setAutoDays(emptyDays());
            } else {
                setAutoModal(null);
            }
            loadGroupAutomations();
        } catch (e) { show(e.message, "error"); } finally { setAutoSaving(false); }
    };

    const saveDaysModal = async () => {
        setAutoSaving(true);
        try {
            const r = await authFetch(`${API}/group-automations/${autoModal.item.id}/days`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ days: autoDays }),
            });
            if (!r.ok) throw new Error((await r.json()).error);
            show("Mensagens da semana salvas!", "success");
            setAutoModal(null);
            loadGroupAutomations();
        } catch (e) { show(e.message, "error"); } finally { setAutoSaving(false); }
    };

    const deleteGroupAutomation = async (id) => {
        if (!confirm("Remover esta automação?")) return;
        try {
            const r = await authFetch(`${API}/group-automations/${id}`, { method: "DELETE" });
            if (r.ok) { show("Automação removida", "info"); loadGroupAutomations(); }
            else show((await r.json()).error, "error");
        } catch { show("Erro ao remover", "error"); }
    };

    const toggleGroupAutomation = async (item) => {
        try {
            const r = await authFetch(`${API}/group-automations/${item.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ active: !item.active }) });
            if (r.ok) loadGroupAutomations();
            else show((await r.json()).error, "error");
        } catch { show("Erro ao atualizar", "error"); }
    };

    // ── Manual tab state ──
    const [manualGroup, setManualGroup] = useState("");
    const [manualMsg, setManualMsg] = useState("");
    const [manualPhoto, setManualPhoto] = useState(null);
    const [manualSending, setManualSending] = useState(false);
    const manualPhotoRef = useRef(null);
    const profileAvatarRef = useRef(null);

    // Agendamento
    const [manualScheduled, setManualScheduled] = useState(false);
    const [manualScheduleAt, setManualScheduleAt] = useState("");
    const [scheduledMsgs, setScheduledMsgs] = useState([]);
    const [schedLoading, setSchedLoading] = useState(false);

    const loadScheduled = async () => {
        setSchedLoading(true);
        try {
            const r = await authFetch(`${API}/scheduled-messages`);
            if (r.ok) setScheduledMsgs(await r.json());
        } catch { } finally { setSchedLoading(false); }
    };

    const cancelScheduled = async (id) => {
        try {
            const r = await authFetch(`${API}/scheduled-messages/${id}`, { method: "DELETE" });
            if (r.ok) { setScheduledMsgs((m) => m.filter((x) => x.id !== id)); show("Agendamento cancelado", "info"); }
            else show((await r.json()).error, "error");
        } catch { show("Erro ao cancelar", "error"); }
    };
    const [uploading, setUploading] = useState(null);

    const [sentToday, setSentToday] = useState({});
    const [auditLogs, setAuditLogs] = useState([]);
    const [auditTotal, setAuditTotal] = useState(0);
    const [auditPage, setAuditPage] = useState(1);
    const [auditLoading, setAuditLoading] = useState(false);
    const [showAudit, setShowAudit] = useState(false);
    const [auditFilter, setAuditFilter] = useState("");


    // ── Portal do Aluno (Box) ──
    const [alunoTab, setAlunoTab] = useState("wod");
    const [boxPrograms, setBoxPrograms] = useState([]);
    const [boxSchedules, setBoxSchedules] = useState([]);
    const [boxPlans, setBoxPlans] = useState([]);
    const [boxDataLoading, setBoxDataLoading] = useState(false);
    const [scheduleDay, setScheduleDay] = useState(() => { const d = new Date().getDay(); return d === 0 ? 1 : d; });

    // ── Admin Box Management ──
    const [mgmtSection, setMgmtSection] = useState("programs");
    const [mgmtBoxId, setMgmtBoxId] = useState("");
    const [newProgram, setNewProgram] = useState({ date: new Date().toISOString().slice(0, 10), title: "", content: "" });
    const [newSchedule, setNewSchedule] = useState({ dayOfWeek: 1, startTime: "06:00", endTime: "07:00", className: "", coach: "" });
    const [newPlan, setNewPlan] = useState({ name: "", description: "", price: "", period: "mensal", features: "", highlighted: false });


    // ── Toggle dia ativo/inativo ──
    const toggleDay = async (day) => {
        const info = photos[day];
        const newEnabled = info?.enabled !== false ? false : true;
        try {
            const r = await authFetch(`${API}/photos/${day}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ enabled: newEnabled }),
            });
            if (!r.ok) { show((await r.json()).error, "error"); return; }
            setPhotos((p) => ({ ...p, [day]: { ...p[day], enabled: newEnabled } }));
            show(`${DAYS[day]} ${newEnabled ? "ativado ✅" : "desativado ⏸️"}`, "info");
        } catch { show("Erro ao alterar dia", "error"); }
    };

    // ── Preview modal ──
    const [previewDay, setPreviewDay] = useState(null); // null = fechado, número = dia aberto

    // ── Boxes ──
    const [boxes, setBoxes] = useState([]);
    const [boxesLoading, setBoxesLoading] = useState(false);
    const [newBoxName, setNewBoxName] = useState("");
    const [newBoxLoading, setNewBoxLoading] = useState(false);

    const loadBoxes = async () => {
        setBoxesLoading(true);
        try {
            const r = await authFetch(`${API}/boxes`);
            if (r.ok) setBoxes(await r.json());
        } catch { } finally { setBoxesLoading(false); }
    };

    const createBox = async (e) => {
        e.preventDefault();
        if (!newBoxName.trim()) return show("Nome do box é obrigatório", "error");
        setNewBoxLoading(true);
        try {
            const r = await authFetch(`${API}/boxes`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: newBoxName.trim() }),
            });
            const d = await r.json();
            if (!r.ok) throw new Error(d.error);
            setBoxes((b) => [...b, d].sort((a, b2) => a.name.localeCompare(b2.name)));
            setNewBoxName("");
            show(`Box "${d.name}" criado!`, "success");
        } catch (e) { show(e.message, "error"); } finally { setNewBoxLoading(false); }
    };

    const deleteBox = async (id, name) => {
        if (!confirm(`Deletar box "${name}"? Os usuários vinculados perderão o Box.`)) return;
        try {
            const r = await authFetch(`${API}/boxes/${id}`, { method: "DELETE" });
            if (!r.ok) { show((await r.json()).error, "error"); return; }
            setBoxes((b) => b.filter((x) => x.id !== id));
            show(`Box "${name}" removido`, "info");
        } catch { show("Erro ao remover box", "error"); }
    };

    // ── Polling status (autenticado, por usuário) ──
    const checkStatus = useCallback(async () => {
        if (!token) return;
        try {
            const res = await authFetch(`${API}/status`);
            if (!res.ok) return;
            const data = await res.json();
            setStatus(data.status);
            setQr(data.qr);
            setPairingCode(data.pairingCode || "");
        } catch {
            setStatus("offline");
        }
    }, [token, authFetch]);

    useEffect(() => {
        if (!token) return;
        checkStatus();
        const id = setInterval(checkStatus, 4000);
        return () => clearInterval(id);
    }, [token, checkStatus]);

    // ALUNO não depende do status do WhatsApp — carrega dados assim que tem token
    useEffect(() => {
        if (token && currentUser?.role === "ALUNO") { loadBoxData(); }
    }, [token, currentUser?.role]);

    useEffect(() => {
        if (token && status === "open") {
            loadConfig();
            loadPhotos();
            loadSentToday();
            loadGroups();
            loadScheduled();
            if (currentUser?.role === "ADMIN") { loadUsers(); loadBoxes(); loadAccessRequests(); }
        }
    }, [status]);

    // Recarrega dados quando o usuário faz login (token muda de null → valor)
    useEffect(() => {
        if (token && status === "open") {
            loadConfig();
            loadPhotos();
            loadSentToday();
            loadGroups();
            loadScheduled();
            if (currentUser?.role === "ADMIN") { loadUsers(); loadBoxes(); loadAccessRequests(); }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [token]);

    const show = (text, type = "info") => {
        setToast({ text, type });
        setTimeout(() => setToast({ text: "", type: "" }), 3500);
    };

    const loadConfig = async () => {
        try {
            const r = await authFetch(`${API}/config`);
            const d = await r.json();
            setConfig(d);
        } catch { }
    };

    const loadSentToday = async () => {
        try {
            const r = await authFetch(`${API}/sent-today`);
            if (r.ok) setSentToday(await r.json());
        } catch { }
    };


    const loadBoxData = async () => {
        setBoxDataLoading(true);
        try {
            const [prg, sch, pln] = await Promise.all([
                authFetch(`${API}/box/programs`).then(r => r.ok ? r.json() : []),
                authFetch(`${API}/box/schedules`).then(r => r.ok ? r.json() : []),
                authFetch(`${API}/box/plans`).then(r => r.ok ? r.json() : []),
            ]);
            setBoxPrograms(prg);
            setBoxSchedules(sch);
            setBoxPlans(pln);
        } catch { } finally { setBoxDataLoading(false); }
    };



    const loadAuditLogs = async (page, filter) => {
        const pg = page ?? auditPage;
        const flt = filter ?? auditFilter;
        setAuditLoading(true);
        try {
            const params = new URLSearchParams({ page: pg, limit: 50 });
            if (flt) params.set("action", flt);
            const r = await authFetch(`${API}/admin/audit?${params}`);
            if (r.ok) {
                const d = await r.json();
                setAuditLogs(d.logs);
                setAuditTotal(d.total);
                setAuditPage(pg);
            }
        } catch { } finally { setAuditLoading(false); }
    };

    const loadPhotos = async () => {
        try {
            const r = await authFetch(`${API}/photos`);
            const d = await r.json();
            setPhotos(d);
        } catch { }
    };

    const loadGroups = async () => {
        try {
            const r = await authFetch(`${API}/groups`);
            if (r.ok) setGroups(await r.json());
        } catch { }
    };

    const saveConfig = async () => {
        try {
            const r = await authFetch(`${API}/config`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(config),
            });
            if (!r.ok) throw new Error("Erro ao salvar");
            show("Configuração salva!", "success");
        } catch (e) {
            show(e.message, "error");
        }
    };

    const uploadPhoto = async (day, file) => {
        setUploading(day);
        try {
            const fd = new FormData();
            fd.append("photo", file);
            const r = await authFetch(`${API}/photos/${day}`, { method: "POST", body: fd });
            if (!r.ok) {
                const err = await r.json();
                throw new Error(err.error);
            }
            await loadPhotos();
            setPhotoVer((v) => v + 1);
            show(`Foto de ${DAYS[day]} salva!`, "success");
        } catch (e) {
            show(e.message, "error");
        }
        setUploading(null);
    };

    const deletePhoto = async (day) => {
        try {
            await authFetch(`${API}/photos/${day}`, { method: "DELETE" });
            await loadPhotos();
            setPhotoVer((v) => v + 1);
            show(`Foto de ${DAYS[day]} removida`, "info");
        } catch (e) {
            show(e.message, "error");
        }
    };


    const sendNow = async () => {
        if (!config.groupJid) return show("Configure o grupo primeiro", "error");
        if (!photos[today]?.hasPhoto) return show("Adicione uma foto para hoje antes de enviar", "error");
        setSending(true);
        try {
            const r = await authFetch(`${API}/send-now`, { method: "POST" });
            const d = await r.json();
            if (!r.ok) throw new Error(d.error);
            show(`Enviado! (${d.day}${d.hadPhoto ? " + foto" : ""})`, "success");
            loadSentToday();
        } catch (e) {
            show(e.message, "error");
        }
        setSending(false);
    };

    const sendManual = async () => {
        if (!manualGroup) return show("Selecione um grupo", "error");
        if (!manualPhoto) return show("Selecione uma imagem para enviar", "error");
        if (manualScheduled && !manualScheduleAt) return show("Selecione data e hora para agendamento", "error");
        setManualSending(true);
        try {
            const fd = new FormData();
            fd.append("groupJid", manualGroup);
            if (manualMsg.trim()) fd.append("message", manualMsg);
            if (manualPhoto) fd.append("photo", manualPhoto);
            if (manualScheduled) {
                fd.append("scheduledAt", new Date(manualScheduleAt).toISOString());
                const r = await authFetch(`${API}/schedule-message`, { method: "POST", body: fd });
                const d = await r.json();
                if (!r.ok) throw new Error(d.error);
                show(`Agendado para ${new Date(manualScheduleAt).toLocaleString("pt-BR")}!`, "success");
                setScheduledMsgs((m) => [...m, d].sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt)));
            } else {
                const r = await authFetch(`${API}/send-manual`, { method: "POST", body: fd });
                const d = await r.json();
                if (!r.ok) throw new Error(d.error);
                show("Enviado com sucesso!", "success");
            }
            setManualMsg("");
            setManualPhoto(null);
        } catch (e) {
            show(e.message, "error");
        }
        setManualSending(false);
    };

    const disconnect = async () => {
        await authFetch(`${API}/disconnect`, { method: "POST" });
        setGroups([]);
        setStatus("disconnected");
        setPairingCode("");
        setQr(null);
        show("Desconectado — use o pareamento para conectar novamente");
    };

    const resetSession = async () => {
        show("Resetando sessão...");
        await authFetch(`${API}/reset`, { method: "POST" });
        setGroups([]);
        setPairingCode("");
        setQr(null);
    };

    const requestPairingCode = async () => {
        const digits = pairingPhone.replace(/\D/g, "");
        if (digits.length < 12) return show("Número incompleto! Digite: código do país + DDD + número (ex: +55 (11) 98765-4321)", "error");
        setPairingLoading(true);
        try {
            const r = await authFetch(`${API}/start-pairing`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ phone: pairingPhone }),
            });
            const d = await r.json();
            if (!r.ok) throw new Error(d.error);
            show("Aguardando código... (pode levar alguns segundos)", "info");
            // O código virá pelo polling do /status
        } catch (e) {
            show(e.message, "error");
        }
        setPairingLoading(false);
    };

    const today = new Date().getDay();
    const photosReady = Object.values(photos).filter((p) => p.hasPhoto).length;
    const groupName = groups.find((g) => g.jid === config.groupJid)?.name;


    // ── Tela de login ──────────────────────────────────────────────────────────
    if (!authChecked) return null; // aguardando localStorage

    if (!token) {
        const GlobalStyle = () => (
            <style jsx global>{`
                * { box-sizing: border-box; }
                html, body { margin: 0; padding: 0; background: #0b1120; }
                @keyframes floatUp { from { opacity:0; transform:translateY(18px); } to { opacity:1; transform:translateY(0); } }
                .tm-link-card { transition: transform .18s, box-shadow .18s; }
                .tm-link-card:hover { transform: translateY(-3px); box-shadow: 0 8px 28px rgba(37,211,102,0.18) !important; }
            `}</style>
        );

        // ── LANDING ───────────────────────────────────────────────────────────
        if (view === "landing") return (
            <>
                <Head><title>Team Muniz57</title></Head>
                <GlobalStyle />
                <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "32px 16px", background: "linear-gradient(180deg,#0b1120 0%,#0d1929 100%)" }}>
                    <div style={{ width: "100%", maxWidth: 420, animation: "floatUp .5s ease both" }}>
                        {/* Logo + Nome */}
                        <div style={{ textAlign: "center", marginBottom: 36 }}>
                            <img src="/logo-team-muniz.jpeg" alt="Team Muniz57" style={{ width: 110, height: 110, borderRadius: "50%", objectFit: "cover", border: "3px solid rgba(37,211,102,0.5)", boxShadow: "0 0 32px rgba(37,211,102,0.18)", marginBottom: 16 }} />
                            <h1 style={{ margin: 0, fontSize: 26, fontWeight: 900, color: "#d0dae8", letterSpacing: "-0.01em" }}>Team Muniz<span style={{ color: "#25D366" }}>57</span></h1>
                            <p style={{ margin: "6px 0 0", fontSize: 14, color: "#5a7a9a" }}>Performance & Discipline</p>
                        </div>

                        {/* Links */}
                        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

                            <a href="https://wa.me/5521999673608" target="_blank" rel="noopener noreferrer" className="tm-link-card" style={{ display: "flex", alignItems: "center", gap: 16, background: "#0f1e31", border: "1px solid #1e3a55", borderRadius: 14, padding: "18px 20px", textDecoration: "none", boxShadow: "0 2px 12px rgba(0,0,0,0.3)" }}>
                                <span style={{ fontSize: 28, flexShrink: 0 }}>💬</span>
                                <div>
                                    <div style={{ fontSize: 15, fontWeight: 700, color: "#d0dae8" }}>Fale pelo WhatsApp</div>
                                    <div style={{ fontSize: 12, color: "#5a7a9a", marginTop: 2 }}>+55 21 99967-3608</div>
                                </div>
                                <span style={{ marginLeft: "auto", color: "#25D366", fontSize: 18 }}>›</span>
                            </a>

                            <a href="https://www.instagram.com/teammuniz57?igsh=MTR5cW1jbHAxOTl6cQ==" target="_blank" rel="noopener noreferrer" className="tm-link-card" style={{ display: "flex", alignItems: "center", gap: 16, background: "#0f1e31", border: "1px solid #1e3a55", borderRadius: 14, padding: "18px 20px", textDecoration: "none", boxShadow: "0 2px 12px rgba(0,0,0,0.3)" }}>
                                <span style={{ fontSize: 28, flexShrink: 0 }}>📸</span>
                                <div>
                                    <div style={{ fontSize: 15, fontWeight: 700, color: "#d0dae8" }}>Instagram</div>
                                    <div style={{ fontSize: 12, color: "#5a7a9a", marginTop: 2 }}>@teammuniz57</div>
                                </div>
                                <span style={{ marginLeft: "auto", color: "#25D366", fontSize: 18 }}>›</span>
                            </a>

                            <a href="https://wa.me/5521999673608" target="_blank" rel="noopener noreferrer" className="tm-link-card" style={{ display: "flex", alignItems: "center", gap: 16, background: "#0f1e31", border: "1px solid #1e3a55", borderRadius: 14, padding: "18px 20px", textDecoration: "none", boxShadow: "0 2px 12px rgba(0,0,0,0.3)" }}>
                                <span style={{ fontSize: 28, flexShrink: 0 }}>🎯</span>
                                <div>
                                    <div style={{ fontSize: 15, fontWeight: 700, color: "#d0dae8" }}>Mentoria Team Muniz57</div>
                                    <div style={{ fontSize: 12, color: "#5a7a9a", marginTop: 2 }}>Assessoria online e presencial</div>
                                </div>
                                <span style={{ marginLeft: "auto", color: "#25D366", fontSize: 18 }}>›</span>
                            </a>
                        </div>

                        {/* Botão painel */}
                        <div style={{ textAlign: "center", marginTop: 36 }}>
                            <button onClick={() => setView("login")} style={{ background: "none", border: "1px solid #1e3a55", borderRadius: 10, padding: "10px 28px", color: "#5a7a9a", fontSize: 13, cursor: "pointer", transition: "color .15s, border-color .15s" }}
                                onMouseEnter={e => { e.currentTarget.style.color="#25D366"; e.currentTarget.style.borderColor="#25D366"; }}
                                onMouseLeave={e => { e.currentTarget.style.color="#5a7a9a"; e.currentTarget.style.borderColor="#1e3a55"; }}>
                                🔐 Acessar painel
                            </button>
                        </div>

                        <p style={{ textAlign: "center", marginTop: 20, fontSize: 11, color: "#2a3a50" }}>© 2026 Team Muniz57</p>
                    </div>
                </div>
            </>
        );

        // ── SOLICITAR ACESSO ──────────────────────────────────────────────────
        if (view === "requestAccess") return (
            <>
                <Head><title>Solicitar Acesso - Team Muniz57</title></Head>
                <GlobalStyle />
                <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
                    <div style={{ width: "100%", maxWidth: 420, background: "#0f1e31", border: "1px solid #1e2d44", borderRadius: 16, padding: 32 }}>
                        <button onClick={() => setView("login")} style={{ background: "none", border: "none", color: "#5a7a9a", cursor: "pointer", fontSize: 13, marginBottom: 20, padding: 0 }}>← Voltar</button>
                        <div style={{ textAlign: "center", marginBottom: 24 }}>
                            <img src="/logo-team-muniz.jpeg" alt="Team Muniz57" style={{ width: 72, height: 72, borderRadius: "50%", objectFit: "cover", border: "2px solid rgba(37,211,102,0.4)", marginBottom: 12 }} />
                            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: "#d0dae8" }}>Solicitar Acesso</h2>
                            <p style={{ margin: "6px 0 0", fontSize: 13, color: "#5a7a9a" }}>O administrador vai liberar seu acesso</p>
                        </div>
                        {reqSent ? (
                            <div style={{ textAlign: "center", padding: "24px 0" }}>
                                <div style={{ fontSize: 48, marginBottom: 12 }}>✅</div>
                                <p style={{ color: "#25D366", fontWeight: 700, fontSize: 16, margin: 0 }}>Solicitação enviada!</p>
                                <p style={{ color: "#5a7a9a", fontSize: 13, marginTop: 8 }}>Aguarde o administrador liberar seu acesso. Você receberá seus dados de login em breve.</p>
                                <button onClick={() => { setReqSent(false); setView("login"); }} style={{ marginTop: 20, background: "none", border: "1px solid #25D366", borderRadius: 8, padding: "8px 20px", color: "#25D366", fontSize: 13, cursor: "pointer" }}>Ir para login</button>
                            </div>
                        ) : (
                            <form onSubmit={submitAccessRequest} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                                <div>
                                    <label style={{ display: "block", fontSize: 12, color: "#5a7a9a", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>Nome completo *</label>
                                    <input required value={reqForm.name} onChange={e => setReqForm(f => ({ ...f, name: e.target.value }))} placeholder="João Silva" style={{ ...S.input, width: "100%" }} />
                                </div>
                                <div>
                                    <label style={{ display: "block", fontSize: 12, color: "#5a7a9a", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>Email *</label>
                                    <input required type="email" value={reqForm.email} onChange={e => setReqForm(f => ({ ...f, email: e.target.value }))} placeholder="joao@email.com" style={{ ...S.input, width: "100%" }} />
                                </div>
                                <div>
                                    <label style={{ display: "block", fontSize: 12, color: "#5a7a9a", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>WhatsApp</label>
                                    <input value={reqForm.phone} onChange={e => setReqForm(f => ({ ...f, phone: e.target.value }))} placeholder="(11) 99999-9999" style={{ ...S.input, width: "100%" }} />
                                </div>
                                <div>
                                    <label style={{ display: "block", fontSize: 12, color: "#5a7a9a", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>Mensagem (opcional)</label>
                                    <textarea value={reqForm.message} onChange={e => setReqForm(f => ({ ...f, message: e.target.value }))} placeholder="Conte um pouco sobre você..." rows={3} style={{ ...S.input, width: "100%", resize: "vertical", fontFamily: "inherit" }} />
                                </div>
                                <button type="submit" disabled={reqSending} style={{ ...S.btnPrimary, marginTop: 4, opacity: reqSending ? 0.7 : 1 }}>
                                    {reqSending ? "Enviando..." : "📩 Enviar solicitação"}
                                </button>
                            </form>
                        )}
                    </div>
                </div>
            </>
        );

        // ── LOGIN ─────────────────────────────────────────────────────────────
        return (
            <>
                <Head><title>Team Muniz57 — Login</title></Head>
                <GlobalStyle />
                <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
                    <div style={{ width: "100%", maxWidth: 400, background: "#0f1e31", border: "1px solid #1e2d44", borderRadius: 16, padding: 32 }}>
                        <button onClick={() => setView("landing")} style={{ background: "none", border: "none", color: "#5a7a9a", cursor: "pointer", fontSize: 13, marginBottom: 20, padding: 0 }}>← Voltar</button>
                        <div style={{ textAlign: "center", marginBottom: 28 }}>
                            <img src="/logo-team-muniz.jpeg" alt="Team Muniz" style={{ width: 120, height: 120, borderRadius: "50%", objectFit: "cover", marginBottom: 14, border: "3px solid rgba(37,211,102,0.5)", boxShadow: "0 0 24px rgba(37,211,102,0.15)" }} />
                            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: "#d0dae8", letterSpacing: "0.01em" }}>Team Muniz<span style={{ color: "#25D366" }}>57</span></h1>
                            <p style={{ margin: "6px 0 0", fontSize: 13, color: "#5a7a9a" }}>Painel de controle</p>
                        </div>
                        <form onSubmit={handleLogin} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                            <div>
                                <label style={{ display: "block", fontSize: 12, color: "#5a7a9a", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>Email</label>
                                <input
                                    type="email"
                                    required
                                    autoFocus
                                    value={loginEmail}
                                    onChange={(e) => setLoginEmail(e.target.value)}
                                    placeholder="seu@email.com"
                                    style={{ ...S.input, width: "100%" }}
                                />
                            </div>
                            <div>
                                <label style={{ display: "block", fontSize: 12, color: "#5a7a9a", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>Senha</label>
                                <input
                                    type="password"
                                    required
                                    value={loginPassword}
                                    onChange={(e) => setLoginPassword(e.target.value)}
                                    placeholder="••••••••"
                                    style={{ ...S.input, width: "100%" }}
                                />
                            </div>
                            {loginError && (
                                <div style={{ background: "rgba(255,80,80,0.1)", border: "1px solid rgba(255,80,80,0.3)", borderRadius: 8, padding: "8px 12px", color: "#ff6b6b", fontSize: 13 }}>
                                    {loginError}
                                </div>
                            )}
                            <button
                                type="submit"
                                disabled={loginLoading}
                                style={{ ...S.btnPrimary, marginTop: 4, opacity: loginLoading ? 0.7 : 1 }}
                            >
                                {loginLoading ? "Entrando..." : "Entrar"}
                            </button>
                        </form>
                        <div style={{ textAlign: "center", marginTop: 20 }}>
                            <button onClick={() => { setReqForm({ name: "", email: "", phone: "", message: "" }); setReqSent(false); setView("requestAccess"); }} style={{ background: "none", border: "none", color: "#5a7a9a", cursor: "pointer", fontSize: 13 }}>
                                Não tenho conta — <span style={{ color: "#25D366" }}>Solicitar acesso</span>
                            </button>
                        </div>
                    </div>
                </div>
            </>
        );
    }

    return (
        <>
            <Head>
                <title>Team Muniz</title>
            </Head>
            <style jsx global>{`
        * { box-sizing: border-box; }
        html, body { margin: 0; padding: 0; background: #0b1120; }
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-thumb { background: #2a3a50; border-radius: 3px; }
      `}</style>

            <div style={S.page}>
                {/* ── HEADER COMPACTO (mobile-first) ── */}
                <header style={S.header}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <img src="/logo-team-muniz.jpeg" alt="Team Muniz" style={{ width: 38, height: 38, borderRadius: "50%", objectFit: "cover", border: "2px solid rgba(37,211,102,0.5)", flexShrink: 0 }} />
                        <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.2 }}>
                            <span style={{ fontSize: 15, fontWeight: 800, color: "#d0dae8", letterSpacing: "0.01em" }}>Team Muniz<span style={{ color: "#25D366" }}>57</span></span>
                            <span style={{ fontSize: 11, color: "#5a6e84" }}>{currentUser?.name}</span>
                        </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        {currentUser?.role !== "ALUNO" && (
                            <span style={{
                                display: "inline-flex", alignItems: "center", gap: 5,
                                padding: "5px 10px", borderRadius: 20, fontSize: 12, fontWeight: 500,
                                background: status === "open" ? "rgba(37,211,102,0.12)" : status === "waiting_qr" || status === "connecting" ? "rgba(255,193,7,0.12)" : status === "logged_out" ? "rgba(255,152,0,0.12)" : "rgba(244,67,54,0.12)",
                                color: status === "open" ? "#25D366" : status === "waiting_qr" || status === "connecting" ? "#FFC107" : status === "logged_out" ? "#FF9800" : "#f55",
                                border: "1px solid",
                                borderColor: status === "open" ? "rgba(37,211,102,0.25)" : status === "waiting_qr" || status === "connecting" ? "rgba(255,193,7,0.25)" : status === "logged_out" ? "rgba(255,152,0,0.25)" : "rgba(244,67,54,0.25)",
                            }}>
                                <span style={{ width: 7, height: 7, borderRadius: "50%", flexShrink: 0, display: "inline-block", background: status === "open" ? "#25D366" : status === "waiting_qr" || status === "connecting" ? "#FFC107" : status === "logged_out" ? "#FF9800" : "#f55" }} />
                                {status === "open" ? "Online" : status === "waiting_qr" ? "QR" : status === "waiting_pairing" ? "Código" : status === "connecting" ? "..." : status === "logged_out" ? "Expirado" : status === "offline" ? "Offline" : "—"}
                            </span>
                        )}
                        <div style={{ position: "relative" }}>
                            <button
                                onClick={() => setShowUserMenu(m => !m)}
                                style={{ width: 36, height: 36, borderRadius: "50%", border: "2px solid rgba(37,211,102,0.4)", background: "#152238", cursor: "pointer", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", padding: 0, flexShrink: 0 }}
                            >
                                {currentUser?.avatar
                                    ? <img src={`data:image/jpeg;base64,${currentUser.avatar}`} style={{ width: "100%", height: "100%", objectFit: "cover" }} alt="avatar" />
                                    : <span style={{ fontSize: 15, fontWeight: 700, color: "#25D366" }}>{currentUser?.name?.[0]?.toUpperCase() || "U"}</span>
                                }
                            </button>
                            {showUserMenu && (
                                <>
                                    <div style={{ position: "fixed", inset: 0, zIndex: 199 }} onClick={() => setShowUserMenu(false)} />
                                    <div style={{ position: "absolute", right: 0, top: "calc(100% + 8px)", background: "#0f1e31", border: "1px solid #1a3a5a", borderRadius: 12, padding: "8px 0", minWidth: 190, boxShadow: "0 8px 24px rgba(0,0,0,0.5)", zIndex: 200 }}>
                                        <div style={{ padding: "8px 16px 10px", borderBottom: "1px solid #1a2a40", marginBottom: 4 }}>
                                            <div style={{ fontSize: 13, fontWeight: 700, color: "#d0dae8" }}>{currentUser?.name}</div>
                                            <div style={{ fontSize: 11, color: "#5a7a9a", marginTop: 2 }}>{currentUser?.email}</div>
                                        </div>
                                        {!isStandalone && (
                                            <button onClick={() => { setShowUserMenu(false); handleInstall(); }} style={{ width: "100%", padding: "10px 16px", background: "none", border: "none", cursor: "pointer", color: "#d0dae8", fontSize: 13, textAlign: "left", display: "flex", alignItems: "center", gap: 10 }}>
                                                📲 <span>Instalar App</span>
                                            </button>
                                        )}
                                        <button onClick={() => { setShowUserMenu(false); setProfileName(currentUser?.name || ""); setProfileAvatarFile(null); setProfileCurrentPwd(""); setProfileNewPwd(""); setProfileConfirmPwd(""); setShowProfileModal(true); }} style={{ width: "100%", padding: "10px 16px", background: "none", border: "none", cursor: "pointer", color: "#d0dae8", fontSize: 13, textAlign: "left", display: "flex", alignItems: "center", gap: 10 }}>
                                            👤 <span>Perfil</span>
                                        </button>
                                        <button onClick={() => { setShowUserMenu(false); handleLogout(); }} style={{ width: "100%", padding: "10px 16px", background: "none", border: "none", cursor: "pointer", color: "#ff6b6b", fontSize: 13, textAlign: "left", display: "flex", alignItems: "center", gap: 10 }}>
                                            🚶 <span>Sair</span>
                                        </button>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                </header>

                {/* ── Portal do ALUNO ── */}
                {currentUser?.role === "ALUNO" && (
                    <div style={{ minHeight: "calc(100vh - 72px)", paddingBottom: 80 }}>
                        <div style={{ ...S.page, paddingTop: 8 }}>

                            {/* ── WOD / Programação ── */}
                            {alunoTab === "wod" && (
                                <>
                                    {/* Hero do dia */}
                                    <div style={{ background: "linear-gradient(135deg, #0f2b1a 0%, #0b1528 60%)", border: "1px solid rgba(37,211,102,0.2)", borderRadius: 16, padding: "24px 20px", marginBottom: 16, position: "relative", overflow: "hidden" }}>
                                        <div style={{ position: "absolute", top: -30, right: -30, width: 120, height: 120, borderRadius: "50%", background: "rgba(37,211,102,0.06)" }} />
                                        <div style={{ fontSize: 12, color: "#25D366", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6 }}>
                                            {new Date().toLocaleDateString("pt-BR", { weekday: "long" })}
                                        </div>
                                        <div style={{ fontSize: 28, fontWeight: 900, color: "#e8f0e8", marginBottom: 4 }}>
                                            {new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })}
                                        </div>
                                        <div style={{ fontSize: 13, color: "#5a8a6a" }}>
                                            {currentUser?.boxName ? `📍 ${currentUser.boxName}` : "Treino do dia"}
                                        </div>
                                    </div>

                                    {/* WOD de hoje */}
                                    {(() => {
                                        const today = new Date().toISOString().slice(0, 10);
                                        const todayProgram = boxPrograms.find(p => p.date?.slice(0, 10) === today);
                                        if (boxDataLoading) return <div style={{ ...S.card, textAlign: "center", padding: 40, color: "#5a7a9a" }}>⏳ Carregando...</div>;
                                        if (todayProgram) return (
                                            <div style={{ ...S.card, border: "1px solid rgba(37,211,102,0.25)", background: "linear-gradient(180deg, #111b2e 0%, #0f1e31 100%)" }}>
                                                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                                                    <div style={{ width: 40, height: 40, borderRadius: 10, background: "rgba(37,211,102,0.12)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>🏋️</div>
                                                    <div>
                                                        <div style={{ fontSize: 18, fontWeight: 800, color: "#e1e8f0" }}>{todayProgram.title}</div>
                                                        <div style={{ fontSize: 11, color: "#5a7a9a" }}>Postado por {todayProgram.user?.name || "Admin"}</div>
                                                    </div>
                                                </div>
                                                {todayProgram.hasImage && (
                                                    <img
                                                        src={`${API}/box/programs/${todayProgram.id}/image?token=${token}`}
                                                        alt="WOD do dia"
                                                        style={{ width: "100%", borderRadius: 10, marginBottom: 12 }}
                                                        onError={(e) => { e.target.style.display = "none"; }}
                                                    />
                                                )}
                                                {todayProgram.content && todayProgram.content !== "WOD do Dia" && (
                                                    <div style={{ background: "#0b1528", borderRadius: 10, padding: "16px 14px", whiteSpace: "pre-wrap", fontSize: 14, color: "#c0d0e0", lineHeight: 1.7, fontFamily: "monospace", borderLeft: "3px solid #25D366" }}>
                                                        {todayProgram.content}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                        return (
                                            <div style={{ ...S.card, textAlign: "center", padding: "40px 20px" }}>
                                                <div style={{ fontSize: 48, marginBottom: 12 }}>😴</div>
                                                <div style={{ fontSize: 16, fontWeight: 700, color: "#d0dae8", marginBottom: 6 }}>Nenhum WOD postado hoje</div>
                                                <div style={{ fontSize: 13, color: "#5a7a9a" }}>O treino do dia será publicado em breve pelo coach.</div>
                                            </div>
                                        );
                                    })()}

                                    {/* Dias anteriores */}
                                    {boxPrograms.filter(p => p.date?.slice(0, 10) !== new Date().toISOString().slice(0, 10)).length > 0 && (
                                        <div style={{ marginTop: 8 }}>
                                            <div style={{ fontSize: 14, fontWeight: 700, color: "#7a8ea2", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 12 }}>Últimos treinos</div>
                                            {boxPrograms.filter(p => p.date?.slice(0, 10) !== new Date().toISOString().slice(0, 10)).slice(0, 7).map(p => (
                                                <details key={p.id} style={{ ...S.card, marginBottom: 8, cursor: "pointer" }}>
                                                    <summary style={{ display: "flex", alignItems: "center", justifyContent: "space-between", listStyle: "none" }}>
                                                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                                            <div style={{ width: 32, height: 32, borderRadius: 8, background: "rgba(90,122,154,0.12)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, color: "#5a7a9a" }}>
                                                                {new Date(p.date + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit" })}
                                                            </div>
                                                            <div>
                                                                <div style={{ fontSize: 14, fontWeight: 700, color: "#d0dae8" }}>{p.title}</div>
                                                                <div style={{ fontSize: 11, color: "#5a7a9a" }}>{new Date(p.date + "T12:00:00").toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "short" })}</div>
                                                            </div>
                                                        </div>
                                                        <span style={{ fontSize: 16, color: "#5a7a9a" }}>▸</span>
                                                    </summary>
                                                    <div style={{ background: "#0b1528", borderRadius: 8, padding: "12px 14px", marginTop: 10 }}>
                                                        {p.hasImage && (
                                                            <img src={`${API}/box/programs/${p.id}/image?token=${token}`} alt={p.title} style={{ width: "100%", borderRadius: 8, marginBottom: 10 }} onError={(e) => { e.target.style.display = "none"; }} />
                                                        )}
                                                        {p.content && p.content !== "WOD do Dia" && (
                                                            <div style={{ whiteSpace: "pre-wrap", fontSize: 13, color: "#a0b8cc", lineHeight: 1.6, fontFamily: "monospace", borderLeft: "3px solid #1e3a55", paddingLeft: 12 }}>
                                                                {p.content}
                                                            </div>
                                                        )}
                                                    </div>
                                                </details>
                                            ))}
                                        </div>
                                    )}
                                </>
                            )}

                            {/* ── Horários ── */}
                            {alunoTab === "horarios" && (
                                <>
                                    <div style={{ ...S.card, padding: "16px 14px" }}>
                                        <h2 style={{ ...S.cardTitle, margin: "0 0 14px", fontSize: 18 }}>📅 Horários das Aulas</h2>

                                        {/* Seletor de dia */}
                                        <div style={{ display: "flex", gap: 4, marginBottom: 18, overflowX: "auto" }}>
                                            {[1, 2, 3, 4, 5, 6, 0].map(d => (
                                                <button key={d} onClick={() => setScheduleDay(d)} style={{
                                                    flex: 1, minWidth: 42, padding: "10px 4px", borderRadius: 10, border: "1px solid",
                                                    background: scheduleDay === d ? "rgba(37,211,102,0.15)" : "#0b1528",
                                                    borderColor: scheduleDay === d ? "#25D366" : "#1a2a40",
                                                    color: scheduleDay === d ? "#25D366" : "#7a8ea2",
                                                    fontWeight: scheduleDay === d ? 800 : 500, fontSize: 11, cursor: "pointer",
                                                    display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
                                                }}>
                                                    <span style={{ fontSize: 10 }}>{["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"][d]}</span>
                                                    {d === new Date().getDay() && <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#25D366" }} />}
                                                </button>
                                            ))}
                                        </div>

                                        {/* Aulas do dia */}
                                        {(() => {
                                            const daySchedules = boxSchedules.filter(s => s.dayOfWeek === scheduleDay);
                                            if (boxDataLoading) return <div style={{ textAlign: "center", color: "#5a7a9a", padding: 30 }}>⏳ Carregando...</div>;
                                            if (daySchedules.length === 0) return (
                                                <div style={{ textAlign: "center", padding: "30px 20px" }}>
                                                    <div style={{ fontSize: 36, marginBottom: 8 }}>🚫</div>
                                                    <div style={{ fontSize: 14, color: "#5a7a9a" }}>Nenhuma aula neste dia</div>
                                                </div>
                                            );
                                            return (
                                                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                                                    {daySchedules.map(s => (
                                                        <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 14, background: "#0b1528", borderRadius: 12, padding: "14px 16px", border: "1px solid #1a2a40" }}>
                                                            <div style={{ minWidth: 62, textAlign: "center" }}>
                                                                <div style={{ fontSize: 16, fontWeight: 800, color: "#25D366" }}>{s.startTime}</div>
                                                                <div style={{ fontSize: 10, color: "#5a7a9a" }}>{s.endTime}</div>
                                                            </div>
                                                            <div style={{ width: 1, height: 36, background: "#1a2a40" }} />
                                                            <div style={{ flex: 1 }}>
                                                                <div style={{ fontSize: 15, fontWeight: 700, color: "#d0dae8" }}>{s.className}</div>
                                                                {s.coach && <div style={{ fontSize: 12, color: "#5a7a9a", marginTop: 2 }}>🏅 {s.coach}</div>}
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            );
                                        })()}
                                    </div>
                                </>
                            )}

                            {/* ── Planos ── */}
                            {alunoTab === "planos" && (
                                <>
                                    <div style={{ marginBottom: 16 }}>
                                        <h2 style={{ fontSize: 20, fontWeight: 800, color: "#e1e8f0", margin: "0 0 4px" }}>💳 Planos</h2>
                                        <p style={{ fontSize: 13, color: "#5a7a9a", margin: 0 }}>Escolha o plano ideal para você</p>
                                    </div>

                                    {boxDataLoading && <div style={{ textAlign: "center", color: "#5a7a9a", padding: 40 }}>⏳ Carregando...</div>}

                                    {!boxDataLoading && boxPlans.length === 0 && (
                                        <div style={{ ...S.card, textAlign: "center", padding: "40px 20px" }}>
                                            <div style={{ fontSize: 48, marginBottom: 12 }}>💰</div>
                                            <div style={{ fontSize: 16, fontWeight: 700, color: "#d0dae8", marginBottom: 6 }}>Planos em breve</div>
                                            <div style={{ fontSize: 13, color: "#5a7a9a" }}>Os planos serão publicados aqui pelo seu box.</div>
                                        </div>
                                    )}

                                    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                                        {boxPlans.map(plan => (
                                            <div key={plan.id} style={{
                                                background: plan.highlighted ? "linear-gradient(135deg, #0f2b1a 0%, #111b2e 100%)" : "#111b2e",
                                                border: `2px solid ${plan.highlighted ? "#25D366" : "#1a2a40"}`,
                                                borderRadius: 16, padding: "24px 20px", position: "relative", overflow: "hidden",
                                            }}>
                                                {plan.highlighted && (
                                                    <div style={{ position: "absolute", top: 12, right: -28, background: "#25D366", color: "#000", fontSize: 10, fontWeight: 800, padding: "3px 32px", transform: "rotate(45deg)", textTransform: "uppercase" }}>Popular</div>
                                                )}
                                                <div style={{ fontSize: 18, fontWeight: 800, color: "#e1e8f0", marginBottom: 4 }}>{plan.name}</div>
                                                {plan.description && <div style={{ fontSize: 13, color: "#5a7a9a", marginBottom: 12 }}>{plan.description}</div>}
                                                <div style={{ display: "flex", alignItems: "baseline", gap: 4, marginBottom: 16 }}>
                                                    <span style={{ fontSize: 12, color: "#5a7a9a" }}>R$</span>
                                                    <span style={{ fontSize: 36, fontWeight: 900, color: plan.highlighted ? "#25D366" : "#d0dae8" }}>{plan.price.toFixed(0)}</span>
                                                    <span style={{ fontSize: 13, color: "#5a7a9a" }}>/{plan.period}</span>
                                                </div>
                                                {plan.features && (() => {
                                                    try {
                                                        const feats = JSON.parse(plan.features);
                                                        return (
                                                            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                                                                {feats.map((f, i) => (
                                                                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#a0b8cc" }}>
                                                                        <span style={{ color: "#25D366", fontSize: 14, flexShrink: 0 }}>✓</span> {f}
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        );
                                                    } catch { return null; }
                                                })()}
                                            </div>
                                        ))}
                                    </div>
                                </>
                            )}

                        </div>

                        {/* ── Bottom Nav do ALUNO ── */}
                        <nav style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: "#0d1929", borderTop: "1px solid #1a3a2a", display: "flex", justifyContent: "center", zIndex: 200 }}>
                            <div style={{ width: "100%", maxWidth: 720, display: "flex" }}>
                                {[
                                    { key: "wod", icon: "🏋️", label: "WOD" },
                                    { key: "horarios", icon: "📅", label: "Horários" },
                                    { key: "planos", icon: "💳", label: "Planos" },
                                ].map(({ key, icon, label }) => (
                                    <button key={key} onClick={() => setAlunoTab(key)} style={{
                                        flex: 1, display: "flex", flexDirection: "column", alignItems: "center",
                                        gap: 2, padding: "10px 0 8px", background: "none", border: "none",
                                        cursor: "pointer", color: alunoTab === key ? "#25D366" : "#5a7a9a",
                                        borderTop: `2px solid ${alunoTab === key ? "#25D366" : "transparent"}`,
                                    }}>
                                        <span style={{ fontSize: 22 }}>{icon}</span>
                                        <span style={{ fontSize: 10, fontWeight: alunoTab === key ? 700 : 400 }}>{label}</span>
                                    </button>
                                ))}
                            </div>
                        </nav>
                    </div>
                )}

                {/* ── Pareamento/QR — exibido enquanto não conectado ── */}
                {currentUser?.role !== "ALUNO" && status !== "open" && (
                    <div style={{ minHeight: "calc(100vh - 72px)", display: "flex", alignItems: "center", justifyContent: "center", padding: "16px 0" }}>

                        {/* ── CÓDIGO GERADO — aguardando digitar no celular ── */}
                        {pairingCode && (
                            <div style={{ width: "100%", maxWidth: 400, background: "#0f1e31", border: "1px solid #1a3a2a", borderRadius: 20, padding: "32px 28px", textAlign: "center" }}>
                                <div style={{ width: 64, height: 64, borderRadius: "50%", background: "rgba(37,211,102,0.12)", border: "2px solid rgba(37,211,102,0.3)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 30, margin: "0 auto 20px" }}>🔑</div>
                                <div style={{ fontSize: 20, fontWeight: 800, color: "#d0dae8", marginBottom: 6 }}>Código de Pareamento</div>
                                <div style={{ fontSize: 13, color: "#5a7a9a", marginBottom: 24 }}>Válido por alguns minutos</div>
                                <div style={{ background: "#0b1528", border: "2px solid #25D366", borderRadius: 14, padding: "18px 32px", display: "inline-block", marginBottom: 24, boxShadow: "0 0 24px rgba(37,211,102,0.15)" }}>
                                    <span style={{ fontSize: 40, fontWeight: 900, letterSpacing: 10, color: "#25D366", fontFamily: "monospace" }}>{pairingCode}</span>
                                </div>
                                <div style={{ background: "#0b1528", border: "1px solid #1a2a40", borderRadius: 12, padding: "16px 18px", textAlign: "left", marginBottom: 20 }}>
                                    <div style={{ fontSize: 12, color: "#5a7a9a", fontWeight: 700, marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.05em" }}>Como digitar no WhatsApp</div>
                                    {[
                                        ["1", "Abra o WhatsApp no seu celular"],
                                        ["2", "Toque em ⋮ Menu → Aparelhos conectados"],
                                        ["3", "Toque em Conectar aparelho"],
                                        ["4", "Escolha Usar número de telefone"],
                                        ["5", "Digite o código acima"],
                                    ].map(([n, t]) => (
                                        <div key={n} style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 8 }}>
                                            <span style={{ width: 22, height: 22, borderRadius: "50%", background: "rgba(37,211,102,0.12)", border: "1px solid rgba(37,211,102,0.25)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: "#25D366", flexShrink: 0 }}>{n}</span>
                                            <span style={{ fontSize: 13, color: "#a0b8cc", lineHeight: 1.5 }}>{t}</span>
                                        </div>
                                    ))}
                                </div>
                                <div style={{ background: "rgba(255,165,0,0.07)", border: "1px solid rgba(255,165,0,0.2)", borderRadius: 10, padding: "10px 14px", fontSize: 12, color: "#f5a623", lineHeight: 1.5, marginBottom: 20 }}>
                                    ⚠️ Não feche nem atualize esta página até o pareamento concluir.
                                </div>
                                <button onClick={disconnect} style={{ width: "100%", padding: "11px", borderRadius: 10, border: "1px solid rgba(244,67,54,0.3)", background: "rgba(244,67,54,0.07)", color: "#f55", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>Cancelar</button>
                            </div>
                        )}

                        {/* ── QR CODE ── */}
                        {qr && !pairingCode && (
                            <div style={{ width: "100%", maxWidth: 400, background: "#0f1e31", border: "1px solid #1a2a40", borderRadius: 20, padding: "32px 28px", textAlign: "center" }}>
                                <div style={{ fontSize: 20, fontWeight: 800, color: "#d0dae8", marginBottom: 6 }}>Escanear QR Code</div>
                                <div style={{ fontSize: 13, color: "#5a7a9a", marginBottom: 20 }}>Abra o WhatsApp e escaneie o código abaixo</div>
                                <div style={{ background: "#fff", borderRadius: 16, padding: 16, display: "inline-block", marginBottom: 20, boxShadow: "0 4px 24px rgba(0,0,0,0.4)" }}>
                                    <img src={qr} alt="QR Code" style={{ width: 220, height: 220, display: "block" }} />
                                </div>
                                <div style={{ background: "#0b1528", border: "1px solid #1a2a40", borderRadius: 12, padding: "12px 16px", textAlign: "left", marginBottom: 24, fontSize: 12, color: "#a0b8cc", lineHeight: 1.6 }}>
                                    No WhatsApp: <strong style={{ color: "#d0dae8" }}>Menu ⋮</strong> → <strong style={{ color: "#d0dae8" }}>Aparelhos conectados</strong> → <strong style={{ color: "#d0dae8" }}>Conectar aparelho</strong>
                                </div>
                                <div style={{ borderTop: "1px solid #1a2a40", paddingTop: 20 }}>
                                    <div style={{ fontSize: 13, color: "#5a7a9a", marginBottom: 12 }}>Prefere usar código de pareamento?</div>
                                    <div style={{ display: "flex", gap: 8 }}>
                                        <input
                                            type="tel"
                                            placeholder="+55 (11) 99999-0000"
                                            value={formatPhone(pairingPhone)}
                                            onChange={(e) => setPairingPhone(e.target.value.replace(/\D/g, ""))}
                                            style={{ flex: 1, padding: "10px 14px", borderRadius: 10, border: "1px solid #1e2d44", background: "#0b1528", color: "#d0dae8", fontSize: 14, outline: "none" }}
                                        />
                                        <button onClick={requestPairingCode} disabled={pairingLoading} style={{ padding: "10px 16px", borderRadius: 10, border: "none", background: "#25D366", color: "#000", fontWeight: 700, fontSize: 13, cursor: pairingLoading ? "not-allowed" : "pointer", opacity: pairingLoading ? 0.7 : 1, whiteSpace: "nowrap" }}>
                                            {pairingLoading ? "..." : "Gerar código"}
                                        </button>
                                    </div>
                                    <div style={{ fontSize: 11, color: "#3a5a7a", marginTop: 8 }}>Ex: +55 (11) 98765-4321</div>
                                </div>
                            </div>
                        )}

                        {/* ── DESCONECTADO / TELA INICIAL ── */}
                        {!qr && !pairingCode && (
                            <div style={{ width: "100%", maxWidth: 400, background: "#0f1e31", border: "1px solid #1a2a40", borderRadius: 20, padding: "36px 28px", textAlign: "center" }}>
                                <div style={{ width: 72, height: 72, borderRadius: "50%", background: "rgba(37,211,102,0.08)", border: "2px solid rgba(37,211,102,0.2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 34, margin: "0 auto 20px" }}>📱</div>
                                <div style={{ fontSize: 22, fontWeight: 800, color: "#d0dae8", marginBottom: 8 }}>Conectar WhatsApp</div>
                                <div style={{ fontSize: 14, color: "#5a7a9a", marginBottom: 28, lineHeight: 1.5 }}>Digite seu número para receber um código de pareamento</div>

                                <div style={{ textAlign: "left", marginBottom: 8 }}>
                                    <label style={{ fontSize: 12, color: "#5a7a9a", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: 8 }}>Número do WhatsApp</label>
                                    <input
                                        type="tel"
                                        placeholder="+55 (11) 99999-0000"
                                        value={formatPhone(pairingPhone)}
                                        onChange={(e) => setPairingPhone(e.target.value.replace(/\D/g, ""))}
                                        style={{ width: "100%", padding: "13px 16px", borderRadius: 12, border: "1px solid #1e2d44", background: "#0b1528", color: "#d0dae8", fontSize: 16, outline: "none", boxSizing: "border-box", transition: "border-color 0.2s" }}
                                        onFocus={(e) => e.target.style.borderColor = "#25D366"}
                                        onBlur={(e) => e.target.style.borderColor = "#1e2d44"}
                                    />
                                    <div style={{ fontSize: 11, color: "#3a5a7a", marginTop: 6 }}>Formato com DDD: +55 (11) 98765-4321</div>
                                </div>

                                <button
                                    onClick={requestPairingCode}
                                    disabled={pairingLoading || pairingPhone.replace(/\D/g, "").length < 12}
                                    style={{ width: "100%", padding: "14px", borderRadius: 12, border: "none", background: pairingPhone.replace(/\D/g, "").length >= 12 ? "#25D366" : "#132030", color: pairingPhone.replace(/\D/g, "").length >= 12 ? "#000" : "#3a5a7a", fontWeight: 800, fontSize: 16, cursor: (pairingLoading || pairingPhone.replace(/\D/g, "").length < 12) ? "not-allowed" : "pointer", marginTop: 16, transition: "all 0.2s" }}
                                >
                                    {pairingLoading ? "Aguardando código..." : "Gerar código de pareamento"}
                                </button>

                                <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "20px 0" }}>
                                    <div style={{ flex: 1, height: 1, background: "#1a2a40" }} />
                                    <span style={{ fontSize: 12, color: "#3a5a7a" }}>ou</span>
                                    <div style={{ flex: 1, height: 1, background: "#1a2a40" }} />
                                </div>

                                <button onClick={resetSession} style={{ width: "100%", padding: "12px", borderRadius: 12, border: "1px solid #1e2d44", background: "transparent", color: "#7a9ab8", fontWeight: 600, fontSize: 14, cursor: "pointer" }}>Usar QR Code</button>

                                <div style={{ marginTop: 24, background: "#0b1528", border: "1px solid #1a2a40", borderRadius: 12, padding: "14px 16px", textAlign: "left" }}>
                                    <div style={{ fontSize: 11, color: "#5a7a9a", fontWeight: 700, marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.05em" }}>Como funciona</div>
                                    {[
                                        ["📱", "Digite seu número com DDD"],
                                        ["🔑", "Um código de 8 dígitos será gerado"],
                                        ["💬", "Digite-o no WhatsApp → Aparelhos conectados"],
                                        ["✅", "Pronto! Bot conectado e pronto para usar"],
                                    ].map(([icon, text]) => (
                                        <div key={text} style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 8 }}>
                                            <span style={{ fontSize: 16 }}>{icon}</span>
                                            <span style={{ fontSize: 12, color: "#7a9ab8" }}>{text}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {currentUser?.role !== "ALUNO" && status === "open" && (
                    <>
                        {/* ══════════ ABA AUTOMAÇÃO ══════════ */}
                        {tab === "auto" && (
                            <>
                                {/* ── RESUMO ── */}
                                <div className="stats-grid" style={S.statsRow}>
                                    <div style={S.stat}>
                                        <span style={S.statNum}>{photosReady}</span>
                                        <span style={S.statLabel}>Fotos prontas</span>
                                    </div>
                                    <div style={S.stat}>
                                        <span style={S.statNum}>7</span>
                                        <span style={S.statLabel}>Dias</span>
                                    </div>
                                    <div style={S.stat}>
                                        <span style={S.statNum}>{config.scheduleTime || "05:00"}</span>
                                        <span style={S.statLabel}>Horário</span>
                                    </div>
                                    <div style={S.stat}>
                                        <span style={{ ...S.statNum, fontSize: 18, textTransform: "uppercase", wordBreak: "break-word", lineHeight: 1.2 }}>
                                            {currentUser?.boxName || "—"}
                                        </span>
                                        <span style={S.statLabel}>Box</span>
                                    </div>
                                </div>

                                {/* ── CONFIG ── */}
                                <div style={S.card}>
                                    <h2 style={S.cardTitle}>⚙️ Configurações</h2>

                                    <div style={S.formGroup}>
                                        <label style={S.label}>Grupo do WhatsApp</label>
                                        <div style={{ display: "flex", gap: 8, alignItems: "center", minWidth: 0 }}>
                                            <select
                                                style={{ ...S.select, flex: 1, minWidth: 0 }}
                                                value={config.groupJid}
                                                onChange={(e) =>
                                                    setConfig((c) => ({ ...c, groupJid: e.target.value }))
                                                }
                                            >
                                                <option value="">-- Selecione --</option>
                                                {groups.map((g) => (
                                                    <option key={g.jid} value={g.jid}>
                                                        {g.name}
                                                    </option>
                                                ))}
                                            </select>
                                            <button style={{ ...S.btnIcon, flexShrink: 0 }} onClick={loadGroups} title="Atualizar grupos">
                                                🔄
                                            </button>
                                        </div>
                                    </div>

                                    <div style={S.formGroup}>
                                        <label style={S.label}>Mensagem automática (enviada antes da foto)</label>
                                        <textarea
                                            style={S.textarea}
                                            rows={3}
                                            value={config.message}
                                            placeholder="Ex: Bom dia! Aqui vai o treino de hoje! 💪"
                                            onChange={(e) =>
                                                setConfig((c) => ({ ...c, message: e.target.value }))
                                            }
                                        />
                                    </div>

                                    <div style={S.formGroup}>
                                        <label style={S.label}>Fuso horário</label>
                                        <input
                                            style={S.input}
                                            value={config.timezone}
                                            onChange={(e) =>
                                                setConfig((c) => ({ ...c, timezone: e.target.value }))
                                            }
                                        />
                                    </div>

                                    <div style={S.formGroup}>
                                        <label style={S.label}>Horário do envio automático</label>
                                        <input
                                            type="time"
                                            style={{ ...S.input, width: 140 }}
                                            value={config.scheduleTime || "05:00"}
                                            onChange={(e) =>
                                                setConfig((c) => ({ ...c, scheduleTime: e.target.value }))
                                            }
                                        />
                                    </div>

                                    <div style={S.infoBox}>
                                        📅 Envio automático <strong>todos os dias às {config.scheduleTime || "05:00"}</strong> ({config.timezone})
                                        <br />
                                        Primeiro a mensagem de texto, depois a foto do dia.
                                    </div>

                                    <button style={S.btnPrimary} onClick={saveConfig}>
                                        💾 Salvar Configurações
                                    </button>
                                </div>

                                {/* ── FOTOS POR DIA ── */}
                                <div style={S.card}>
                                    <h2 style={S.cardTitle}>📸 Fotos por Dia da Semana</h2>
                                    <p style={S.cardSub}>
                                        Faça upload da foto de treino para cada dia. O bot envia
                                        automaticamente a foto correspondente.
                                    </p>

                                    <div style={S.grid}>
                                        {DAYS.map((name, day) => {
                                            const info = photos[day];
                                            const isToday = day === today;
                                            const isEnabled = info?.enabled !== false;
                                            const sentInfo = isToday ? sentToday[day] : null;
                                            const sentTime = sentInfo ? new Date(sentInfo.sentAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : null;
                                            return (
                                                <div
                                                    key={day}
                                                    style={{
                                                        ...S.dayCard,
                                                        borderColor: !isEnabled ? "#2a2a3a" : sentInfo ? "#1a6b3b" : isToday ? "#25D366" : "#1e2d44",
                                                        boxShadow: sentInfo
                                                            ? "0 0 14px rgba(37,211,102,0.2)"
                                                            : isToday && isEnabled
                                                                ? "0 0 12px rgba(37,211,102,0.15)"
                                                                : "none",
                                                        opacity: isEnabled ? 1 : 0.55,
                                                    }}
                                                >
                                                    {sentInfo && (
                                                        <span style={{ ...S.todayTag, background: "#1a4d2e", color: "#4ade80" }}>✅ ENVIADO {sentTime}</span>
                                                    )}
                                                    {!sentInfo && isToday && isEnabled && <span style={S.todayTag}>HOJE</span>}
                                                    {!isEnabled && (
                                                        <span style={{ ...S.todayTag, background: "#555", color: "#ccc" }}>DESCANSO</span>
                                                    )}
                                                    <div style={S.dayHeader}>
                                                        <span style={{ fontSize: 20 }}>{DAY_ICONS[day]}</span>
                                                        <h3 style={S.dayName}>{name}</h3>
                                                    </div>

                                                    <div style={S.photoBox}>
                                                        {info?.hasPhoto && !sentInfo ? (
                                                            <img
                                                                src={info.dataUrl}
                                                                alt={name}
                                                                style={{ ...S.photoImg, cursor: "pointer" }}
                                                                onClick={() => setPreviewDay(day)}
                                                                title="Clique para preview"
                                                                onError={(e) => { e.target.style.display = "none"; }}
                                                            />
                                                        ) : (
                                                            <div style={S.photoEmpty}>
                                                                <span style={{ fontSize: 28, opacity: 0.4 }}>
                                                                    {sentInfo ? "✅" : "📷"}
                                                                </span>
                                                                <span style={{ fontSize: 11, color: sentInfo ? "#4ade80" : "#4a5a70", marginTop: 4, textAlign: "center" }}>
                                                                    {sentInfo ? `Enviado ${sentInfo.source === "auto" ? "auto" : sentInfo.source === "test" ? "teste" : "manual"}` : "Sem foto"}
                                                                </span>
                                                            </div>
                                                        )}
                                                    </div>

                                                    <div style={{ opacity: sentInfo ? 0.4 : 1, pointerEvents: sentInfo ? "none" : "auto" }}>
                                                        <div style={S.dayBtns}>
                                                            <input
                                                                type="file"
                                                                accept="image/*"
                                                                style={{ display: "none" }}
                                                                ref={(el) => (fileRefs.current[day] = el)}
                                                                onChange={(e) => {
                                                                    if (e.target.files[0])
                                                                        uploadPhoto(day, e.target.files[0]);
                                                                    e.target.value = "";
                                                                }}
                                                            />
                                                            <button
                                                                style={S.btnUpload}
                                                                disabled={uploading === day || !!sentInfo}
                                                                onClick={() => fileRefs.current[day]?.click()}
                                                            >
                                                                {uploading === day ? "⏳" : "📤"}{" "}
                                                                {info?.hasPhoto ? "Trocar" : "Upload"}
                                                            </button>
                                                            {info?.hasPhoto && (
                                                                <button
                                                                    style={S.btnDel}
                                                                    disabled={!!sentInfo}
                                                                    onClick={() => deletePhoto(day)}
                                                                >
                                                                    🗑️
                                                                </button>
                                                            )}
                                                        </div>
                                                        <button
                                                            style={{
                                                                marginTop: 6,
                                                                width: "100%",
                                                                padding: "5px 0",
                                                                background: isEnabled ? "rgba(244,67,54,0.08)" : "rgba(37,211,102,0.08)",
                                                                border: isEnabled ? "1px solid rgba(244,67,54,0.25)" : "1px solid rgba(37,211,102,0.25)",
                                                                borderRadius: 6,
                                                                color: isEnabled ? "#f88" : "#25D366",
                                                                fontSize: 11,
                                                                cursor: sentInfo ? "not-allowed" : "pointer",
                                                            }}
                                                            disabled={!!sentInfo}
                                                            onClick={() => toggleDay(day)}
                                                        >
                                                            {isEnabled ? "⏸️ Descanso" : "▶️ Ativar"}
                                                        </button>
                                                    </div>
                                                </div>
                                            );
                                        })}

                                        {/* ── Resumo da Semana card ── */}
                                        <div
                                            style={{
                                                ...S.dayCard,
                                                borderColor: photosReady === 7 ? "#25D366" : "#2a3a50",
                                                background: "linear-gradient(135deg, #0d1a2e 0%, #142240 100%)",
                                                display: "flex",
                                                flexDirection: "column",
                                                alignItems: "center",
                                                justifyContent: "center",
                                                gap: 6,
                                            }}
                                        >
                                            <span style={{ fontSize: 26 }}>📊</span>
                                            <h3 style={{ ...S.dayName, color: "#7ab8e8", fontSize: 12 }}>Resumo</h3>
                                            <div style={{
                                                display: "flex",
                                                flexDirection: "column",
                                                alignItems: "center",
                                                gap: 4,
                                                marginTop: 2,
                                            }}>
                                                <span style={{
                                                    fontSize: 28,
                                                    fontWeight: 700,
                                                    color: photosReady === 7 ? "#25D366" : "#FFC107",
                                                }}>
                                                    {photosReady}/7
                                                </span>
                                                <span style={{ fontSize: 10, color: "#5a6e84", textTransform: "uppercase" }}>
                                                    fotos prontas
                                                </span>
                                            </div>
                                            <div style={{
                                                width: "80%",
                                                height: 4,
                                                background: "#1a2a40",
                                                borderRadius: 2,
                                                overflow: "hidden",
                                                marginTop: 4,
                                            }}>
                                                <div style={{
                                                    width: `${(photosReady / 7) * 100}%`,
                                                    height: "100%",
                                                    background: photosReady === 7 ? "#25D366" : "#FFC107",
                                                    borderRadius: 2,
                                                    transition: "width 0.3s ease",
                                                }} />
                                            </div>
                                            <span style={{
                                                fontSize: 10,
                                                color: photosReady === 7 ? "#25D366" : "#5a6e84",
                                                marginTop: 2,
                                            }}>
                                                {photosReady === 7 ? "✅ Semana completa!" : `Faltam ${7 - photosReady} fotos`}
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                {/* ── TESTAR ENVIO ── */}
                                <div style={S.card}>
                                    <h2 style={S.cardTitle}>🚀 Testar Envio</h2>
                                    <p style={S.cardSub}>
                                        Envia agora a mensagem + foto do dia atual para o grupo configurado.
                                    </p>
                                    {sentToday[today] ? (
                                        <div style={{ background: "rgba(37,211,102,0.07)", border: "1px solid rgba(37,211,102,0.2)", borderRadius: 10, padding: "12px 16px", display: "flex", alignItems: "center", gap: 10 }}>
                                            <span style={{ fontSize: 22 }}>✅</span>
                                            <div>
                                                <div style={{ fontSize: 13, fontWeight: 600, color: "#4ade80" }}>Já enviado hoje às {new Date(sentToday[today].sentAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</div>
                                                <div style={{ fontSize: 11, color: "#3a8a5a", marginTop: 2 }}>O envio de hoje ({DAYS[today]}) já foi realizado. Nenhum reenvio permitido.</div>
                                            </div>
                                        </div>
                                    ) : (
                                        <button
                                            style={{
                                                ...S.btnPrimary,
                                                ...((!config.groupJid || !photos[today]?.hasPhoto || sending) ? { opacity: 0.5, cursor: "not-allowed" } : {}),
                                            }}
                                            onClick={sendNow}
                                            disabled={sending || !config.groupJid || !photos[today]?.hasPhoto}
                                        >
                                            {sending
                                                ? "⏳ Enviando..."
                                                : `📤 Enviar Agora (${DAYS[today]})`}
                                        </button>
                                    )}
                                </div>

                                {/* ── SESSÃO ── */}
                                <div style={S.card}>
                                    <h2 style={S.cardTitle}>🔌 Sessão</h2>
                                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                                        <button style={S.btnDanger} onClick={disconnect}>
                                            Desconectar
                                        </button>
                                        <button style={S.btnWarn} onClick={resetSession}>
                                            Resetar Sessão
                                        </button>
                                    </div>
                                </div>
                            </>
                        )}


                        {/* ══════════ ABA SOLICITAÇÕES DE ACESSO (admin) ══════════ */}
                        {tab === "requests" && currentUser?.role === "ADMIN" && (
                            <div style={S.card}>
                                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
                                    <h2 style={{ ...S.cardTitle, marginBottom: 0 }}>🔔 Solicitações de Acesso {pendingCount > 0 && <span style={{ background: "#f44", color: "#fff", borderRadius: 8, fontSize: 11, padding: "2px 7px", marginLeft: 8, verticalAlign: "middle" }}>{pendingCount}</span>}</h2>
                                    <button onClick={loadAccessRequests} style={S.btnIcon} disabled={reqsLoading}>{reqsLoading ? "..." : "🔄 Atualizar"}</button>
                                </div>

                                {/* Modal credenciais geradas */}
                                {approvedCred && (
                                    <div style={{ background: "rgba(37,211,102,0.08)", border: "1px solid rgba(37,211,102,0.3)", borderRadius: 10, padding: 16, marginBottom: 16 }}>
                                        <div style={{ fontSize: 14, fontWeight: 700, color: "#25D366", marginBottom: 8 }}>✅ Acesso criado! Envie estas credenciais ao usuário:</div>
                                        <div style={{ fontSize: 13, color: "#d0dae8" }}>Email: <strong>{approvedCred.email}</strong></div>
                                        <div style={{ fontSize: 13, color: "#d0dae8", marginTop: 4 }}>Senha: <strong>{approvedCred.password}</strong></div>
                                        <button onClick={() => setApprovedCred(null)} style={{ marginTop: 10, background: "none", border: "1px solid #25D366", borderRadius: 6, padding: "5px 14px", color: "#25D366", fontSize: 12, cursor: "pointer" }}>Fechar</button>
                                    </div>
                                )}

                                {accessRequests.length === 0 && !reqsLoading ? (
                                    <p style={{ color: "#5a7a9a", textAlign: "center", padding: "24px 0" }}>Nenhuma solicitação encontrada.</p>
                                ) : (
                                    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                                        {accessRequests.map(req => (
                                            <div key={req.id} style={{ background: "#0b1528", border: `1px solid ${req.status === "pending" ? "rgba(37,211,102,0.2)" : req.status === "approved" ? "rgba(52,211,153,0.15)" : "rgba(244,67,54,0.15)"}`, borderRadius: 12, padding: "14px 16px" }}>
                                                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                                                    <div style={{ flex: 1 }}>
                                                        <div style={{ fontSize: 14, fontWeight: 700, color: "#d0dae8" }}>{req.name}</div>
                                                        <div style={{ fontSize: 12, color: "#5a7a9a", marginTop: 2 }}>{req.email}{req.phone ? ` · ${req.phone}` : ""}</div>
                                                        {req.message && <div style={{ fontSize: 12, color: "#8a9ab0", marginTop: 6, fontStyle: "italic" }}>"{req.message}"</div>}
                                                        <div style={{ fontSize: 11, color: "#3a5a7a", marginTop: 6 }}>{new Date(req.createdAt).toLocaleString("pt-BR")}</div>
                                                    </div>
                                                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                                                        {req.status === "pending" ? (
                                                            <>
                                                                <button onClick={() => handleApprove(req.id)} style={{ background: "rgba(37,211,102,0.15)", border: "1px solid rgba(37,211,102,0.3)", borderRadius: 8, padding: "6px 14px", color: "#25D366", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>✅ Aprovar</button>
                                                                <button onClick={() => handleDeny(req.id)} style={{ background: "rgba(244,67,54,0.1)", border: "1px solid rgba(244,67,54,0.25)", borderRadius: 8, padding: "6px 14px", color: "#f66", fontSize: 12, cursor: "pointer" }}>❌ Rejeitar</button>
                                                            </>
                                                        ) : (
                                                            <span style={{ fontSize: 12, fontWeight: 700, color: req.status === "approved" ? "#25D366" : "#f66", padding: "4px 10px", border: "1px solid", borderColor: req.status === "approved" ? "rgba(37,211,102,0.3)" : "rgba(244,67,54,0.3)", borderRadius: 6 }}>
                                                                {req.status === "approved" ? "✅ Aprovado" : "❌ Rejeitado"}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* ══════════ ABA USUÁRIOS (admin) ══════════ */}
                        {tab === "users" && currentUser?.role === "ADMIN" && (
                            <>
                                {/* Criar usuário */}
                                <div style={S.card}>
                                    <h2 style={S.cardTitle}>👤 Novo Usuário</h2>
                                    <form onSubmit={createUser} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                                            <div>
                                                <label style={S.label}>Nome</label>
                                                <input
                                                    style={S.input}
                                                    placeholder="João Silva"
                                                    value={newUser.name}
                                                    onChange={(e) => setNewUser((u) => ({ ...u, name: e.target.value }))}
                                                />
                                            </div>
                                            <div>
                                                <label style={S.label}>Email</label>
                                                <input
                                                    style={S.input}
                                                    type="email"
                                                    required
                                                    placeholder="joao@exemplo.com"
                                                    value={newUser.email}
                                                    onChange={(e) => setNewUser((u) => ({ ...u, email: e.target.value }))}
                                                />
                                            </div>
                                            <div>
                                                <label style={S.label}>Senha inicial</label>
                                                <input
                                                    style={S.input}
                                                    type="password"
                                                    required
                                                    placeholder="Mín. 8 caracteres"
                                                    value={newUser.password}
                                                    onChange={(e) => setNewUser((u) => ({ ...u, password: e.target.value }))}
                                                />
                                            </div>
                                            <div>
                                                <label style={S.label}>Papel</label>
                                                <select
                                                    style={S.select}
                                                    value={newUser.role}
                                                    onChange={(e) => setNewUser((u) => ({ ...u, role: e.target.value }))}
                                                >
                                                    <option value="USER">Usuário</option>
                                                    <option value="ADMIN">Administrador</option>
                                                    <option value="ALUNO">Aluno</option>
                                                </select>
                                            </div>
                                            <div>
                                                <label style={S.label}>Box</label>
                                                <select
                                                    style={S.select}
                                                    value={newUser.boxId}
                                                    onChange={(e) => setNewUser((u) => ({ ...u, boxId: e.target.value }))}
                                                >
                                                    <option value="">— Sem box —</option>
                                                    {boxes.map((b) => (
                                                        <option key={b.id} value={b.id}>{b.name}</option>
                                                    ))}
                                                </select>
                                            </div>
                                        </div>
                                        {newUserError && (
                                            <div style={{ background: "rgba(255,80,80,0.1)", border: "1px solid rgba(255,80,80,0.3)", borderRadius: 8, padding: "8px 12px", color: "#ff6b6b", fontSize: 13 }}>
                                                {newUserError}
                                            </div>
                                        )}
                                        <button
                                            type="submit"
                                            disabled={newUserLoading}
                                            style={{ ...S.btnPrimary, alignSelf: "flex-start", opacity: newUserLoading ? 0.7 : 1 }}
                                        >
                                            {newUserLoading ? "Criando..." : "+ Criar Usuário"}
                                        </button>
                                    </form>
                                </div>

                                {/* Lista de usuários */}
                                <div style={S.card}>
                                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                                        <h2 style={{ ...S.cardTitle, margin: 0 }}>👥 Usuários Cadastrados</h2>
                                        <button style={S.btnIcon} onClick={loadUsers} title="Atualizar">🔄</button>
                                    </div>
                                    {usersLoading ? (
                                        <p style={{ color: "#5a7a9a", fontSize: 14 }}>Carregando...</p>
                                    ) : (
                                        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                                            {users.map((u) => (
                                                <div key={u.id} style={{
                                                    background: u.active ? "rgba(37,211,102,0.04)" : "rgba(244,67,54,0.04)",
                                                    border: `1px solid ${u.active ? "rgba(37,211,102,0.15)" : "rgba(244,67,54,0.15)"}`,
                                                    borderRadius: 10,
                                                    padding: "12px 16px",
                                                    display: "flex",
                                                    alignItems: "center",
                                                    gap: 12,
                                                    flexWrap: "wrap",
                                                }}>
                                                    <div style={{ flex: 1, minWidth: 160 }}>
                                                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                                                            <span style={{ fontWeight: 700, color: "#d0dae8", fontSize: 14 }}>{u.name || u.email.split("@")[0]}</span>
                                                            <span style={{
                                                                fontSize: 10,
                                                                padding: "2px 8px",
                                                                borderRadius: 20,
                                                                fontWeight: 600,
                                                                background: u.role === "ADMIN" ? "rgba(255,193,7,0.15)" : u.role === "ALUNO" ? "rgba(52,211,153,0.15)" : "rgba(100,140,180,0.15)",
                                                                color: u.role === "ADMIN" ? "#FFC107" : u.role === "ALUNO" ? "#34d399" : "#7aa8cc",
                                                                textTransform: "uppercase",
                                                            }}>{u.role}</span>
                                                            <span style={{
                                                                fontSize: 10,
                                                                padding: "2px 8px",
                                                                borderRadius: 20,
                                                                fontWeight: 600,
                                                                background: u.active ? "rgba(37,211,102,0.12)" : "rgba(244,67,54,0.12)",
                                                                color: u.active ? "#25D366" : "#f55",
                                                            }}>{u.active ? "Ativo" : "Inativo"}</span>
                                                        </div>
                                                        <div style={{ fontSize: 12, color: "#5a7a9a", marginTop: 2 }}>{u.email}</div>
                                                        {u.lastLoginAt && (
                                                            <div style={{ fontSize: 11, color: "#3a5a7a", marginTop: 2 }}>
                                                                Último login: {new Date(u.lastLoginAt).toLocaleString("pt-BR")}
                                                            </div>
                                                        )}
                                                    </div>
                                                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                                                        {u.id !== currentUser.id && (
                                                            <>
                                                                <select
                                                                    value={u.role}
                                                                    onChange={(e) => changeRole(u.id, e.target.value)}
                                                                    style={{
                                                                        background: "#0f1e31",
                                                                        border: "1px solid #1e3a55",
                                                                        borderRadius: 6,
                                                                        color: "#d0dae8",
                                                                        fontSize: 12,
                                                                        padding: "4px 8px",
                                                                        cursor: "pointer",
                                                                    }}
                                                                >
                                                                    <option value="USER">Usuário</option>
                                                                    <option value="ADMIN">Admin</option>
                                                                    <option value="ALUNO">Aluno</option>
                                                                </select>
                                                                <button
                                                                    onClick={() => toggleUser(u.id)}
                                                                    style={{
                                                                        padding: "4px 12px",
                                                                        borderRadius: 6,
                                                                        border: "none",
                                                                        fontSize: 12,
                                                                        fontWeight: 600,
                                                                        cursor: "pointer",
                                                                        background: u.active ? "rgba(244,67,54,0.12)" : "rgba(37,211,102,0.12)",
                                                                        color: u.active ? "#f55" : "#25D366",
                                                                    }}
                                                                >
                                                                    {u.active ? "Desativar" : "Ativar"}
                                                                </button>
                                                                <button
                                                                    onClick={() => deleteUser(u.id, u.email)}
                                                                    style={{
                                                                        padding: "4px 10px",
                                                                        borderRadius: 6,
                                                                        border: "none",
                                                                        fontSize: 12,
                                                                        cursor: "pointer",
                                                                        background: "rgba(244,67,54,0.08)",
                                                                        color: "#f55",
                                                                    }}
                                                                    title="Deletar usuário"
                                                                >
                                                                    🗑️
                                                                </button>
                                                            </>
                                                        )}
                                                        {u.id === currentUser.id && (
                                                            <span style={{ fontSize: 12, color: "#5a7a9a" }}>Você</span>
                                                        )}
                                                    </div>
                                                </div>
                                            ))}
                                            {users.length === 0 && <p style={{ color: "#5a7a9a", fontSize: 14 }}>Nenhum usuário encontrado.</p>}
                                        </div>
                                    )}
                                </div>

                                {/* ── BOXES ── */}
                                <div style={S.card}>
                                    <h2 style={S.cardTitle}>🏢 Boxes</h2>
                                    <form onSubmit={createBox} style={{ display: "flex", gap: 10, marginBottom: 16 }}>
                                        <input
                                            style={{ ...S.input, flex: 1 }}
                                            placeholder="Nome do box (ex: Box Rio)"
                                            value={newBoxName}
                                            onChange={(e) => setNewBoxName(e.target.value)}
                                        />
                                        <button type="submit" style={{ ...S.btnPrimary, whiteSpace: "nowrap" }}>
                                            {newBoxLoading ? "…" : "+ Criar"}
                                        </button>
                                    </form>
                                    {boxesLoading ? (
                                        <p style={{ color: "#5a7a9a", fontSize: 14 }}>Carregando…</p>
                                    ) : boxes.length === 0 ? (
                                        <p style={{ color: "#5a7a9a", fontSize: 14 }}>Nenhum box criado ainda.</p>
                                    ) : (
                                        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                                            {boxes.map((b) => (
                                                <div key={b.id} style={{
                                                    display: "flex", alignItems: "center", justifyContent: "space-between",
                                                    background: "rgba(30,58,85,0.4)", border: "1px solid #1e3a55",
                                                    borderRadius: 8, padding: "10px 14px",
                                                }}>
                                                    <div>
                                                        <div style={{ fontSize: 14, fontWeight: 600, color: "#d0dae8" }}>{b.name}</div>
                                                        <div style={{ fontSize: 12, color: "#5a7a9a" }}>{b._count?.users ?? 0} usuário(s)</div>
                                                    </div>
                                                    <button
                                                        onClick={() => deleteBox(b.id, b.name)}
                                                        style={{ background: "rgba(244,67,54,0.1)", border: "none", borderRadius: 6, color: "#f55", padding: "4px 10px", cursor: "pointer", fontSize: 14 }}
                                                    >🗑️</button>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                {/* ── LOGS ── */}
                                <div style={S.card}>
                                    <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <h2 style={{ ...S.cardTitle, margin: 0, marginBottom: 2, fontSize: "clamp(13px, 3.5vw, 16px)", whiteSpace: "normal" }}>📜 Logs do Sistema</h2>
                                            <p style={{ ...S.cardSub, marginBottom: 0, fontSize: "clamp(10px, 2.5vw, 12px)", whiteSpace: "normal" }}>Monitoramento de todas as ações realizadas</p>
                                        </div>
                                        <button
                                            style={{ ...S.btnUpload, fontSize: "clamp(11px, 2.8vw, 13px)", padding: "7px 14px", whiteSpace: "nowrap", flexShrink: 0 }}
                                            onClick={() => { setShowAudit(true); loadAuditLogs(1, ""); }}
                                        >📋 Ver Logs</button>
                                    </div>
                                </div>

                                {/* ── Gestão do Box ── */}
                                <div style={S.card}>
                                    <h2 style={{ ...S.cardTitle, marginBottom: 14 }}>📋 Gestão do Box</h2>

                                    <div style={{ marginBottom: 14 }}>
                                        <label style={S.label}>Box</label>
                                        <select style={S.select} value={mgmtBoxId} onChange={e => { setMgmtBoxId(e.target.value); }}>
                                            <option value="">Selecione um box</option>
                                            {(boxes || []).map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                                        </select>
                                    </div>

                                    <div style={{ display: "flex", gap: 4, marginBottom: 16 }}>
                                        {[{ key: "programs", label: "🏋️ WOD" }, { key: "schedules", label: "📅 Horários" }, { key: "plans", label: "💳 Planos" }].map(t => (
                                            <button key={t.key} onClick={() => setMgmtSection(t.key)} style={{
                                                flex: 1, padding: "8px 4px", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer",
                                                background: mgmtSection === t.key ? "rgba(37,211,102,0.15)" : "#0b1528",
                                                border: `1px solid ${mgmtSection === t.key ? "#25D366" : "#1a2a40"}`,
                                                color: mgmtSection === t.key ? "#25D366" : "#5a7a9a",
                                            }}>{t.label}</button>
                                        ))}
                                    </div>
                                </div>

                                {!mgmtBoxId && (
                                    <div style={{ ...S.card, textAlign: "center", padding: 30, color: "#5a7a9a" }}>Selecione um box acima para gerenciar</div>
                                )}

                                {mgmtBoxId && mgmtSection === "programs" && (
                                    <>
                                        <div style={{ ...S.card, background: "linear-gradient(135deg, #0a1628 0%, #0f1e31 100%)", border: "1px solid #1a3a2a", padding: 16, marginBottom: 12 }}>
                                            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                                                <span style={{ fontSize: 18 }}>🤖</span>
                                                <span style={{ fontSize: 13, fontWeight: 700, color: "#25D366" }}>WOD Automático</span>
                                            </div>
                                            <div style={{ fontSize: 12, color: "#7aa8cc", lineHeight: 1.5 }}>
                                                O WOD é criado automaticamente a partir da mensagem diária enviada ao grupo do WhatsApp (envio automático, teste ou manual).
                                            </div>
                                        </div>
                                        <div style={S.card}>
                                            <h3 style={{ fontSize: 14, color: "#e1e8f0", margin: "0 0 12px" }}>WODs publicados</h3>
                                            {boxPrograms.filter(p => p.boxId === parseInt(mgmtBoxId)).length === 0 && (
                                                <div style={{ textAlign: "center", color: "#5a7a9a", padding: 20, fontSize: 13 }}>Nenhum WOD publicado para este box</div>
                                            )}
                                            {boxPrograms.filter(p => p.boxId === parseInt(mgmtBoxId)).map(p => (
                                                <div key={p.id} style={{ background: "#0b1528", borderRadius: 8, padding: "10px 12px", marginBottom: 8, border: "1px solid #1a2a40", display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
                                                    <div style={{ flex: 1, minWidth: 0 }}>
                                                        <div style={{ fontSize: 13, fontWeight: 700, color: "#d0dae8" }}>{p.title}</div>
                                                        <div style={{ fontSize: 11, color: "#5a7a9a" }}>{new Date(p.date + "T12:00:00").toLocaleDateString("pt-BR")}</div>
                                                        <div style={{ fontSize: 11, color: "#6a8aaa", marginTop: 4, whiteSpace: "pre-wrap", maxHeight: 60, overflow: "hidden" }}>{p.content}</div>
                                                    </div>
                                                    <button onClick={async () => {
                                                        try { await authFetch(`${API}/box/programs/${p.id}`, { method: "DELETE" }); loadBoxData(); show("WOD removido", "info"); } catch { }
                                                    }} style={{ ...S.btnDel, flexShrink: 0, fontSize: 11 }}>🗑️</button>
                                                </div>
                                            ))}
                                        </div>
                                    </>
                                )}

                                {mgmtBoxId && mgmtSection === "schedules" && (
                                    <>
                                        <div style={S.card}>
                                            <h3 style={{ fontSize: 14, color: "#e1e8f0", margin: "0 0 12px" }}>Nova Aula</h3>
                                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 10 }}>
                                                <div>
                                                    <label style={S.label}>Dia</label>
                                                    <select style={S.select} value={newSchedule.dayOfWeek} onChange={e => setNewSchedule(s => ({ ...s, dayOfWeek: parseInt(e.target.value) }))}>
                                                        {[1, 2, 3, 4, 5, 6, 0].map(d => <option key={d} value={d}>{["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"][d]}</option>)}
                                                    </select>
                                                </div>
                                                <div>
                                                    <label style={S.label}>Início</label>
                                                    <input type="time" style={{ ...S.input, colorScheme: "dark" }} value={newSchedule.startTime} onChange={e => setNewSchedule(s => ({ ...s, startTime: e.target.value }))} />
                                                </div>
                                                <div>
                                                    <label style={S.label}>Fim</label>
                                                    <input type="time" style={{ ...S.input, colorScheme: "dark" }} value={newSchedule.endTime} onChange={e => setNewSchedule(s => ({ ...s, endTime: e.target.value }))} />
                                                </div>
                                            </div>
                                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
                                                <div>
                                                    <label style={S.label}>Aula</label>
                                                    <input style={S.input} placeholder="CrossFit" value={newSchedule.className} onChange={e => setNewSchedule(s => ({ ...s, className: e.target.value }))} />
                                                </div>
                                                <div>
                                                    <label style={S.label}>Coach</label>
                                                    <input style={S.input} placeholder="Nome do coach" value={newSchedule.coach} onChange={e => setNewSchedule(s => ({ ...s, coach: e.target.value }))} />
                                                </div>
                                            </div>
                                            <button onClick={async () => {
                                                if (!newSchedule.className.trim()) return show("Nome da aula obrigatório", "error");
                                                try {
                                                    const r = await authFetch(`${API}/box/schedules`, {
                                                        method: "POST", headers: { "Content-Type": "application/json" },
                                                        body: JSON.stringify({ boxId: parseInt(mgmtBoxId), ...newSchedule }),
                                                    });
                                                    if (r.ok) { show("Horário criado!", "success"); setNewSchedule({ dayOfWeek: 1, startTime: "06:00", endTime: "07:00", className: "", coach: "" }); loadBoxData(); }
                                                    else show((await r.json()).error, "error");
                                                } catch { show("Erro ao criar horário", "error"); }
                                            }} style={{ ...S.btnPrimary, width: "100%" }}>Adicionar Horário</button>
                                        </div>
                                        <div style={S.card}>
                                            <h3 style={{ fontSize: 14, color: "#e1e8f0", margin: "0 0 12px" }}>Horários cadastrados</h3>
                                            {boxSchedules.filter(s => s.boxId === parseInt(mgmtBoxId)).length === 0 && (
                                                <div style={{ textAlign: "center", color: "#5a7a9a", padding: 20, fontSize: 13 }}>Nenhum horário cadastrado para este box</div>
                                            )}
                                            {[1, 2, 3, 4, 5, 6, 0].map(d => {
                                                const dayItems = boxSchedules.filter(s => s.boxId === parseInt(mgmtBoxId) && s.dayOfWeek === d);
                                                if (dayItems.length === 0) return null;
                                                return (
                                                    <div key={d} style={{ marginBottom: 12 }}>
                                                        <div style={{ fontSize: 12, fontWeight: 700, color: "#7a8ea2", marginBottom: 6 }}>{["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"][d]}</div>
                                                        {dayItems.map(s => (
                                                            <div key={s.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "#0b1528", borderRadius: 8, padding: "8px 12px", marginBottom: 4, border: "1px solid #1a2a40" }}>
                                                                <div>
                                                                    <span style={{ fontSize: 13, fontWeight: 700, color: "#25D366" }}>{s.startTime}–{s.endTime}</span>
                                                                    <span style={{ fontSize: 13, color: "#d0dae8", marginLeft: 10 }}>{s.className}</span>
                                                                    {s.coach && <span style={{ fontSize: 11, color: "#5a7a9a", marginLeft: 8 }}>({s.coach})</span>}
                                                                </div>
                                                                <button onClick={async () => {
                                                                    try { await authFetch(`${API}/box/schedules/${s.id}`, { method: "DELETE" }); loadBoxData(); show("Horário removido", "info"); } catch { }
                                                                }} style={{ ...S.btnDel, fontSize: 11, padding: "3px 8px" }}>🗑️</button>
                                                            </div>
                                                        ))}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </>
                                )}

                                {mgmtBoxId && mgmtSection === "plans" && (
                                    <>
                                        <div style={S.card}>
                                            <h3 style={{ fontSize: 14, color: "#e1e8f0", margin: "0 0 12px" }}>Novo Plano</h3>
                                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
                                                <div>
                                                    <label style={S.label}>Nome</label>
                                                    <input style={S.input} placeholder="Plano Mensal" value={newPlan.name} onChange={e => setNewPlan(p => ({ ...p, name: e.target.value }))} />
                                                </div>
                                                <div>
                                                    <label style={S.label}>Preço (R$)</label>
                                                    <input type="number" step="0.01" style={S.input} placeholder="199.90" value={newPlan.price} onChange={e => setNewPlan(p => ({ ...p, price: e.target.value }))} />
                                                </div>
                                            </div>
                                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
                                                <div>
                                                    <label style={S.label}>Período</label>
                                                    <select style={S.select} value={newPlan.period} onChange={e => setNewPlan(p => ({ ...p, period: e.target.value }))}>
                                                        <option value="mensal">Mensal</option>
                                                        <option value="trimestral">Trimestral</option>
                                                        <option value="semestral">Semestral</option>
                                                        <option value="anual">Anual</option>
                                                    </select>
                                                </div>
                                                <div style={{ display: "flex", alignItems: "center", gap: 8, paddingTop: 22 }}>
                                                    <input type="checkbox" checked={newPlan.highlighted} onChange={e => setNewPlan(p => ({ ...p, highlighted: e.target.checked }))} style={{ accentColor: "#25D366" }} />
                                                    <label style={{ fontSize: 13, color: "#7a8ea2" }}>Destacar</label>
                                                </div>
                                            </div>
                                            <div style={{ marginBottom: 10 }}>
                                                <label style={S.label}>Descrição</label>
                                                <input style={S.input} placeholder="Ideal para quem quer começar" value={newPlan.description} onChange={e => setNewPlan(p => ({ ...p, description: e.target.value }))} />
                                            </div>
                                            <div style={{ marginBottom: 10 }}>
                                                <label style={S.label}>Benefícios (um por linha)</label>
                                                <textarea rows={4} style={S.textarea} placeholder={"Acesso ilimitado\nAcompanhamento de coach\n1 avaliação física/mês"} value={newPlan.features} onChange={e => setNewPlan(p => ({ ...p, features: e.target.value }))} />
                                            </div>
                                            <button onClick={async () => {
                                                if (!newPlan.name.trim() || !newPlan.price) return show("Nome e preço obrigatórios", "error");
                                                try {
                                                    const feats = newPlan.features.trim() ? JSON.stringify(newPlan.features.trim().split("\n").filter(Boolean)) : null;
                                                    const r = await authFetch(`${API}/box/plans`, {
                                                        method: "POST", headers: { "Content-Type": "application/json" },
                                                        body: JSON.stringify({ boxId: parseInt(mgmtBoxId), name: newPlan.name, description: newPlan.description, price: parseFloat(newPlan.price), period: newPlan.period, features: feats, highlighted: newPlan.highlighted }),
                                                    });
                                                    if (r.ok) { show("Plano criado!", "success"); setNewPlan({ name: "", description: "", price: "", period: "mensal", features: "", highlighted: false }); loadBoxData(); }
                                                    else show((await r.json()).error, "error");
                                                } catch { show("Erro ao criar plano", "error"); }
                                            }} style={{ ...S.btnPrimary, width: "100%" }}>Criar Plano</button>
                                        </div>
                                        <div style={S.card}>
                                            <h3 style={{ fontSize: 14, color: "#e1e8f0", margin: "0 0 12px" }}>Planos cadastrados</h3>
                                            {boxPlans.filter(p => p.boxId === parseInt(mgmtBoxId)).length === 0 && (
                                                <div style={{ textAlign: "center", color: "#5a7a9a", padding: 20, fontSize: 13 }}>Nenhum plano cadastrado para este box</div>
                                            )}
                                            {boxPlans.filter(p => p.boxId === parseInt(mgmtBoxId)).map(p => (
                                                <div key={p.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "#0b1528", borderRadius: 8, padding: "10px 12px", marginBottom: 6, border: `1px solid ${p.highlighted ? "rgba(37,211,102,0.3)" : "#1a2a40"}` }}>
                                                    <div>
                                                        <div style={{ fontSize: 13, fontWeight: 700, color: "#d0dae8" }}>{p.name} {p.highlighted && <span style={{ fontSize: 10, color: "#25D366" }}>⭐</span>}</div>
                                                        <div style={{ fontSize: 12, color: "#25D366", fontWeight: 700 }}>R$ {p.price.toFixed(2)} / {p.period}</div>
                                                    </div>
                                                    <button onClick={async () => {
                                                        try { await authFetch(`${API}/box/plans/${p.id}`, { method: "DELETE" }); loadBoxData(); show("Plano removido", "info"); } catch { }
                                                    }} style={{ ...S.btnDel, fontSize: 11, padding: "3px 8px" }}>🗑️</button>
                                                </div>
                                            ))}
                                        </div>
                                    </>
                                )}
                            </>
                        )}

                        {/* ══════════ ABA BOT DE VENDAS ══════════ */}
                        {tab === "flow" && (
                            <>
                                {/* Stats */}
                                {flowStats && (
                                    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 12 }}>
                                        {[
                                            { label: "Total Leads", value: flowStats.total, color: "#7aa8cc" },
                                            { label: "Convertidos", value: flowStats.converted, color: "#25D366" },
                                            { label: "Taxa", value: `${flowStats.conversionRate}%`, color: "#fbbf24" },
                                        ].map(({ label, value, color }) => (
                                            <div key={label} style={{ background: "#0b1528", border: "1px solid #1a2a40", borderRadius: 10, padding: "12px 10px", textAlign: "center" }}>
                                                <div style={{ fontSize: 20, fontWeight: 800, color }}>{value}</div>
                                                <div style={{ fontSize: 10, color: "#5a7a9a", marginTop: 2 }}>{label}</div>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {/* Sub-abas */}
                                <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
                                    {[{ key: "config", label: "⚙️ Config" }, { key: "menu", label: "🌿 Fluxo" }, { key: "leads", label: "👥 Leads" }].map(t => (
                                        <button key={t.key} onClick={() => setFlowSection(t.key)} style={{
                                            flex: 1, padding: "8px 4px", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer",
                                            background: flowSection === t.key ? "rgba(37,211,102,0.15)" : "#0b1528",
                                            border: `1px solid ${flowSection === t.key ? "#25D366" : "#1a2a40"}`,
                                            color: flowSection === t.key ? "#25D366" : "#5a7a9a",
                                        }}>{t.label}</button>
                                    ))}
                                </div>

                                {/* ── CONFIG ── */}
                                {flowSection === "config" && flowConfig && (
                                    <div style={S.card}>
                                        <h2 style={S.cardTitle}>⚙️ Configurações do Bot</h2>

                                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: flowConfig.enabled ? "rgba(37,211,102,0.08)" : "rgba(244,67,54,0.06)", border: `1px solid ${flowConfig.enabled ? "rgba(37,211,102,0.25)" : "rgba(244,67,54,0.2)"}`, borderRadius: 10, padding: "12px 16px", marginBottom: 16 }}>
                                            <div>
                                                <div style={{ fontSize: 14, fontWeight: 700, color: "#d0dae8" }}>Bot de Vendas</div>
                                                <div style={{ fontSize: 12, color: "#5a7a9a" }}>{flowConfig.enabled ? "Respondendo mensagens" : "Desativado"}</div>
                                            </div>
                                            <button onClick={() => { const updated = { ...flowConfig, enabled: !flowConfig.enabled }; setFlowConfig(updated); saveFlowConfig(updated); }} style={{ padding: "8px 18px", borderRadius: 8, border: "none", fontWeight: 700, fontSize: 13, cursor: "pointer", background: flowConfig.enabled ? "rgba(244,67,54,0.15)" : "rgba(37,211,102,0.15)", color: flowConfig.enabled ? "#f55" : "#25D366" }}>
                                                {flowConfig.enabled ? "Desativar" : "Ativar"}
                                            </button>
                                        </div>

                                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
                                            <div style={{ gridColumn: "1 / -1" }}>
                                                <label style={S.label}>Nome do Proprietário</label>
                                                <input type="text" placeholder="Ex: João Muniz" style={S.input} value={flowConfig.ownerName || ""} onChange={e => setFlowConfig(c => ({ ...c, ownerName: e.target.value }))} />
                                            </div>
                                            <div>
                                                <label style={S.label}>Horário início (h)</label>
                                                <input type="number" min="0" max="23" style={S.input} value={flowConfig.attendanceStart} onChange={e => setFlowConfig(c => ({ ...c, attendanceStart: parseInt(e.target.value) }))} />
                                            </div>
                                            <div>
                                                <label style={S.label}>Horário fim (h)</label>
                                                <input type="number" min="0" max="24" style={S.input} value={flowConfig.attendanceEnd} onChange={e => setFlowConfig(c => ({ ...c, attendanceEnd: parseInt(e.target.value) }))} />
                                            </div>
                                            <div>
                                                <label style={S.label}>Lembrete a cada (dias)</label>
                                                <input type="number" min="1" max="30" style={S.input} value={flowConfig.reminderDays} onChange={e => setFlowConfig(c => ({ ...c, reminderDays: parseInt(e.target.value) }))} />
                                            </div>
                                        </div>

                                        {[
                                            { key: "welcomeMessage", label: "Mensagem de boas-vindas" },
                                            { key: "menuMessage", label: "Cabeçalho do menu" },
                                            { key: "offHoursMessage", label: "Mensagem fora do horário" },
                                            { key: "humanMessage", label: "Mensagem ao transferir para humano" },
                                            { key: "followupMessage", label: "Mensagem de follow-up (2x/sem)" },
                                        ].map(({ key, label }) => (
                                            <div key={key} style={{ marginBottom: 12 }}>
                                                <label style={S.label}>{label}</label>
                                                <textarea rows={3} style={S.textarea} value={flowConfig[key] || ""} onChange={e => setFlowConfig(c => ({ ...c, [key]: e.target.value }))} />
                                            </div>
                                        ))}

                                        <button onClick={saveFlowConfig} disabled={flowSaving} style={{ ...S.btnPrimary, width: "100%", opacity: flowSaving ? 0.7 : 1 }}>
                                            {flowSaving ? "Salvando..." : "💾 Salvar Configurações"}
                                        </button>
                                    </div>
                                )}

                                {/* ── FLUXO (árvore de menus) ── */}
                                {flowSection === "menu" && flowConfig && (() => {
                                    const allItems = flowConfig.menuItems || [];
                                    const getChildren = (parentId) => allItems.filter(i => (i.parentId ?? null) === (parentId ?? null)).sort((a, b) => a.sortOrder - b.sortOrder);
                                    const typeLabel = (item) => {
                                        const hasChildren = allItems.some(i => (i.parentId ?? null) === item.id);
                                        if (hasChildren) return { txt: "📂 Sub-menu", color: "#60a5fa" };
                                        if (item.isHuman) return { txt: "👤 Transfere humano", color: "#4ade80" };
                                        return { txt: "ℹ️ Informativo", color: "#fbbf24" };
                                    };
                                    const renderNode = (item, depth) => {
                                        const children = getChildren(item.id);
                                        const tp = typeLabel(item);
                                        return (
                                            <div key={item.id}>
                                                <div style={{ display: "flex", alignItems: "flex-start", gap: 8, marginLeft: depth * 20, marginBottom: 6 }}>
                                                    {depth > 0 && <div style={{ width: 2, minHeight: 36, background: "#1a3a5a", borderRadius: 2, flexShrink: 0, marginTop: 4 }} />}
                                                    <div style={{ flex: 1, background: "#0b1528", border: "1px solid #1a2a40", borderRadius: 10, padding: "10px 12px" }}>
                                                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                                <div style={{ fontSize: 13, fontWeight: 700, color: "#d0dae8" }}>{item.label}</div>
                                                                {item.description && <div style={{ fontSize: 11, color: "#7a8ea2", marginTop: 3, whiteSpace: "pre-wrap" }}>{item.description}</div>}
                                                                {item.price && <div style={{ fontSize: 11, color: "#fbbf24", marginTop: 3 }}>💰 {item.price}</div>}
                                                                <div style={{ fontSize: 10, color: tp.color, marginTop: 4, fontWeight: 600 }}>{tp.txt}</div>
                                                            </div>
                                                            <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                                                                <button title="Adicionar sub-opção" onClick={() => openAddModal(item.id)} style={{ ...S.btnIcon, padding: "3px 7px", fontSize: 12 }}>＋</button>
                                                                <button title="Editar" onClick={() => openEditModal(item)} style={{ ...S.btnIcon, padding: "3px 7px", fontSize: 12 }}>✏️</button>
                                                                <button title="Excluir" onClick={() => deleteMenuItem(item.id)} style={{ ...S.btnDel, padding: "3px 7px", fontSize: 12 }}>🗑️</button>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                                {children.map(child => renderNode(child, depth + 1))}
                                            </div>
                                        );
                                    };
                                    const rootItems = getChildren(null);
                                    return (
                                        <div style={S.card}>
                                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                                                <h2 style={{ ...S.cardTitle, margin: 0 }}>🌿 Fluxo de Atendimento</h2>
                                                <button onClick={() => openAddModal(null)} style={{ ...S.btnPrimary, padding: "7px 14px", fontSize: 12 }}>＋ Adicionar opção</button>
                                            </div>
                                            {rootItems.length === 0 && (
                                                <p style={{ color: "#5a7a9a", fontSize: 13, textAlign: "center", padding: "20px 0" }}>Nenhuma opção cadastrada. Clique em "＋ Adicionar opção" para começar.</p>
                                            )}
                                            {rootItems.map(item => renderNode(item, 0))}
                                            <div style={{ marginTop: 14, padding: "10px 12px", background: "rgba(37,211,102,0.04)", border: "1px solid rgba(37,211,102,0.12)", borderRadius: 8, fontSize: 11, color: "#5a7a9a" }}>
                                                <b style={{ color: "#60a5fa" }}>📂 Sub-menu</b> — abre outro nível de opções &nbsp;|&nbsp;
                                                <b style={{ color: "#4ade80" }}>👤 Transfere humano</b> — encerra e chama o atendente &nbsp;|&nbsp;
                                                <b style={{ color: "#fbbf24" }}>ℹ️ Informativo</b> — exibe detalhes e oferece falar com especialista
                                            </div>
                                        </div>
                                    );
                                })()}

                                {/* ── LEADS ── */}
                                {flowSection === "leads" && (
                                    <div style={S.card}>
                                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                                            <h2 style={{ ...S.cardTitle, margin: 0 }}>👥 Leads</h2>
                                            <button style={S.btnIcon} onClick={() => { loadFlowLeads(1, flowLeadsFilter); loadFlowStats(); }}>🔄</button>
                                        </div>
                                        <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
                                            {[{ v: "all", l: "Todos" }, { v: "pending", l: "Pendentes" }, { v: "converted", l: "Convertidos" }].map(({ v, l }) => (
                                                <button key={v} onClick={() => { setFlowLeadsFilter(v); loadFlowLeads(1, v); }} style={{ flex: 1, padding: "6px", borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: "pointer", background: flowLeadsFilter === v ? "rgba(37,211,102,0.15)" : "#0b1528", border: `1px solid ${flowLeadsFilter === v ? "#25D366" : "#1a2a40"}`, color: flowLeadsFilter === v ? "#25D366" : "#5a7a9a" }}>{l}</button>
                                            ))}
                                        </div>
                                        {flowLeadsLoading ? (
                                            <p style={{ color: "#5a7a9a", fontSize: 13, textAlign: "center" }}>Carregando...</p>
                                        ) : flowLeads.length === 0 ? (
                                            <p style={{ color: "#5a7a9a", fontSize: 13, textAlign: "center", padding: "20px 0" }}>Nenhum lead encontrado.</p>
                                        ) : (
                                            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                                                {flowLeads.map(lead => (
                                                    <div key={lead.id} style={{ background: "#0b1528", border: `1px solid ${lead.converted ? "rgba(37,211,102,0.2)" : "#1a2a40"}`, borderRadius: 10, padding: "10px 12px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                                                        <div style={{ flex: 1, minWidth: 0 }}>
                                                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                                                <span style={{ fontSize: 13, fontWeight: 700, color: "#d0dae8" }}>{lead.name || lead.phone.replace("@s.whatsapp.net", "")}</span>
                                                                <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 20, fontWeight: 600, background: lead.converted ? "rgba(37,211,102,0.12)" : "rgba(251,191,36,0.12)", color: lead.converted ? "#25D366" : "#fbbf24" }}>{lead.converted ? "Convertido" : "Pendente"}</span>
                                                            </div>
                                                            <div style={{ fontSize: 11, color: "#5a7a9a", marginTop: 2 }}>Etapa: {lead.step} · Último contato: {new Date(lead.lastContact).toLocaleString("pt-BR")}</div>
                                                        </div>
                                                        <button onClick={() => deleteLead(lead.id)} style={{ ...S.btnDel, padding: "4px 8px", fontSize: 11, flexShrink: 0 }}>🗑️</button>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                        {flowLeadsTotal > 20 && (
                                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 12 }}>
                                                <button style={{ ...S.btnIcon, opacity: flowLeadsPage <= 1 ? 0.4 : 1 }} disabled={flowLeadsPage <= 1} onClick={() => loadFlowLeads(flowLeadsPage - 1, flowLeadsFilter)}>← Ant</button>
                                                <span style={{ fontSize: 12, color: "#5a7a9a" }}>{flowLeadsPage}/{Math.ceil(flowLeadsTotal / 20)} · {flowLeadsTotal} leads</span>
                                                <button style={{ ...S.btnIcon, opacity: flowLeadsPage >= Math.ceil(flowLeadsTotal / 20) ? 0.4 : 1 }} disabled={flowLeadsPage >= Math.ceil(flowLeadsTotal / 20)} onClick={() => loadFlowLeads(flowLeadsPage + 1, flowLeadsFilter)}>Próx →</button>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </>
                        )}

                        {/* ══════════ MODAL ADD/EDIT ITEM DE FLUXO ══════════ */}
                        {flowItemModal && (
                            <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
                                onClick={(e) => e.target === e.currentTarget && setFlowItemModal(null)}>
                                <div style={{ width: "100%", maxWidth: 440, background: "#0e1829", borderRadius: 14, padding: 22 }}>
                                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                                        <h2 style={{ ...S.cardTitle, margin: 0 }}>{flowItemModal.mode === "add" ? (flowItemModal.parentId ? "➕ Adicionar sub-opção" : "➕ Adicionar opção") : "✏️ Editar opção"}</h2>
                                        <button onClick={() => setFlowItemModal(null)} style={{ background: "none", border: "none", color: "#5a7a9a", fontSize: 22, cursor: "pointer", lineHeight: 1 }}>×</button>
                                    </div>
                                    <div style={{ marginBottom: 10 }}>
                                        <label style={S.label}>Nome da opção *</label>
                                        <input style={S.input} placeholder="Ex: Musculação Online" autoFocus value={flowItemForm.label} onChange={e => setFlowItemForm(f => ({ ...f, label: e.target.value }))} />
                                    </div>
                                    <div style={{ marginBottom: 10 }}>
                                        <label style={S.label}>Descrição</label>
                                        <textarea rows={3} style={S.textarea} placeholder="Detalhes, benefícios, o que está incluído..." value={flowItemForm.description} onChange={e => setFlowItemForm(f => ({ ...f, description: e.target.value }))} />
                                    </div>
                                    <div style={{ marginBottom: 14 }}>
                                        <label style={S.label}>Preço / Investimento</label>
                                        <input style={S.input} placeholder="R$ 199,90/mês" value={flowItemForm.price} onChange={e => setFlowItemForm(f => ({ ...f, price: e.target.value }))} />
                                    </div>
                                    <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
                                        {[
                                            { v: false, label: "📂 Tem sub-menu", desc: "Abre outro nível" },
                                            { v: false, label: "ℹ️ Informativo", desc: "Exibe detalhes" },
                                            { v: true, label: "👤 Humano", desc: "Transfere atendente" },
                                        ].map(opt => (
                                            <label key={String(opt.v) + opt.label} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4, cursor: "pointer", padding: "8px 6px", borderRadius: 8, border: `1px solid ${flowItemForm.isHuman === opt.v && !(opt.label.includes("sub") && !flowItemForm.isHuman) ? "#25D366" : "#1a2a40"}`, background: "rgba(37,211,102,0.04)" }}>
                                                <input type="radio" name="itemType" style={{ display: "none" }} checked={opt.label.includes("Humano") ? flowItemForm.isHuman : !flowItemForm.isHuman} onChange={() => setFlowItemForm(f => ({ ...f, isHuman: opt.v }))} />
                                                <span style={{ fontSize: 13 }}>{opt.label}</span>
                                                <span style={{ fontSize: 10, color: "#5a7a9a" }}>{opt.desc}</span>
                                            </label>
                                        ))}
                                    </div>
                                    <div style={{ display: "flex", gap: 8 }}>
                                        <button onClick={saveFlowItem} style={{ ...S.btnPrimary, flex: 1 }}>💾 Salvar</button>
                                        <button onClick={() => setFlowItemModal(null)} style={{ ...S.btnIcon, flex: 1 }}>Cancelar</button>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* ══════════ MODAL LOGS ══════════ */}
                        {showAudit && currentUser?.role === "ADMIN" && (
                            <div
                                style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 1000, display: "flex", flexDirection: "column", overflowY: "auto" }}
                                onClick={(e) => e.target === e.currentTarget && setShowAudit(false)}
                            >
                                <div style={{ margin: "auto", width: "100%", maxWidth: 700, background: "#0e1829", borderRadius: 14, padding: 24, maxHeight: "90vh", display: "flex", flexDirection: "column" }}>
                                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                                        <h2 style={{ ...S.cardTitle, margin: 0 }}>📜 Logs do Sistema</h2>
                                        <button onClick={() => setShowAudit(false)} style={{ background: "none", border: "none", color: "#5a7a9a", fontSize: 22, cursor: "pointer", lineHeight: 1 }}>×</button>
                                    </div>
                                    <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
                                        <input
                                            style={{ ...S.input, flex: 1 }}
                                            placeholder="Filtrar por ação (ex: LOGIN, PHOTO...)"
                                            value={auditFilter}
                                            onChange={(e) => setAuditFilter(e.target.value)}
                                            onKeyDown={(e) => e.key === "Enter" && loadAuditLogs(1, auditFilter)}
                                        />
                                        <button style={S.btnIcon} onClick={() => loadAuditLogs(1, auditFilter)}>🔍</button>
                                        <button style={S.btnIcon} onClick={() => { setAuditFilter(""); loadAuditLogs(1, ""); }}>❌</button>
                                    </div>
                                    <div style={{ overflowY: "auto", flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
                                        {auditLoading && <p style={{ color: "#5a7a9a", textAlign: "center" }}>Carregando…</p>}
                                        {!auditLoading && auditLogs.length === 0 && <p style={{ color: "#5a7a9a", textAlign: "center" }}>Nenhum log encontrado.</p>}
                                        {auditLogs.map((l) => {
                                            const actionColor =
                                                l.action.includes("ERROR") || l.action.includes("FAIL") ? "#f88" :
                                                    l.action.includes("OK") || l.action.includes("LOGIN_OK") ? "#4ade80" :
                                                        l.action.startsWith("AUTO_SEND") ? "#a78bfa" :
                                                            l.action.startsWith("MANUAL_SEND") ? "#38bdf8" :
                                                                l.action.startsWith("SCHEDULE") ? "#fbbf24" :
                                                                    l.action.startsWith("PHOTO") ? "#fb923c" :
                                                                        l.action.startsWith("DAY_") ? "#34d399" :
                                                                            l.action.startsWith("CONFIG") ? "#94a3b8" :
                                                                                l.action.startsWith("USER") ? "#e879f9" :
                                                                                    "#7aa8cc";
                                            const actionIcon =
                                                l.action === "AUTO_SEND_OK" ? "🤖" :
                                                    l.action === "AUTO_SEND_SKIP" ? "⏭️" :
                                                        l.action === "AUTO_SEND_ERROR" ? "❌" :
                                                            l.action === "MANUAL_SEND" ? "📤" :
                                                                l.action === "SEND_NOW" ? "🧪" :
                                                                    l.action === "SCHEDULE_CREATE" ? "📅" :
                                                                        l.action === "SCHEDULE_CANCEL" ? "🗑️" :
                                                                            l.action === "PHOTO_UPLOAD" ? "📸" :
                                                                                l.action === "PHOTO_DELETE" ? "🗑️" :
                                                                                    l.action === "DAY_ENABLED" ? "▶️" :
                                                                                        l.action === "DAY_DISABLED" ? "⏸️" :
                                                                                            l.action === "CONFIG_SAVE" ? "⚙️" :
                                                                                                l.action === "HISTORY_DELETE" ? "🗑️" :
                                                                                                    l.action === "LOGIN_OK" ? "🔓" :
                                                                                                        l.action === "LOGIN_FAIL" ? "🚫" :
                                                                                                            l.action === "LOGOUT" ? "🔒" :
                                                                                                                l.action === "CHANGE_PASSWORD" ? "🔑" :
                                                                                                                    "📋";
                                            return (
                                                <div key={l.id} style={{ background: "#0d1624", border: `1px solid ${actionColor}22`, borderRadius: 8, padding: "8px 14px" }}>
                                                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, flexWrap: "wrap" }}>
                                                        <span style={{ fontWeight: 700, fontSize: 12, color: actionColor, fontFamily: "monospace" }}>
                                                            {actionIcon} {l.action}
                                                        </span>
                                                        <span style={{ fontSize: 11, color: "#4a5a70", flexShrink: 0 }}>{new Date(l.createdAt).toLocaleString("pt-BR")}</span>
                                                    </div>
                                                    <div style={{ fontSize: 12, color: "#8a9ab0", marginTop: 4 }}>
                                                        {l.user ? `👤 ${l.user.name || l.user.email}` : "🤖 sistema"}
                                                        {l.ip && <span style={{ color: "#3a4a60", marginLeft: 8 }}>{l.ip}</span>}
                                                    </div>
                                                    {l.detail && <div style={{ fontSize: 11, color: "#5a7a9a", marginTop: 2, wordBreak: "break-all" }}>{l.detail}</div>}
                                                </div>
                                            );
                                        })}
                                    </div>
                                    {auditTotal > 50 && (
                                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 14, gap: 8 }}>
                                            <button style={{ ...S.btnIcon, opacity: auditPage <= 1 ? 0.4 : 1 }} disabled={auditPage <= 1} onClick={() => loadAuditLogs(auditPage - 1, auditFilter)}>← Anterior</button>
                                            <span style={{ fontSize: 12, color: "#5a7a9a" }}>{auditPage}/{Math.ceil(auditTotal / 50)} · {auditTotal} registros</span>
                                            <button style={{ ...S.btnIcon, opacity: auditPage >= Math.ceil(auditTotal / 50) ? 0.4 : 1 }} disabled={auditPage >= Math.ceil(auditTotal / 50)} onClick={() => loadAuditLogs(auditPage + 1, auditFilter)}>Próximo →</button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}


                        {/* ══════════ ABA AUTOMAÇÕES DE GRUPO ══════════ */}
                        {tab === "manual" && (
                            <div style={S.card}>
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                                    <h2 style={{ ...S.cardTitle, margin: 0 }}>⚙️ Automações de Grupo</h2>
                                    <div style={{ display: "flex", gap: 8 }}>
                                        <button style={S.btnIcon} onClick={() => { loadGroupAutomations(); loadGroups(); }} title="Atualizar">🔄</button>
                                        <button style={{ ...S.btnPrimary, padding: "8px 14px", fontSize: 13 }} onClick={openAddAutoModal}>+ Nova</button>
                                    </div>
                                </div>
                                <p style={{ ...S.cardSub, marginBottom: 16 }}>
                                    Cada grupo pode ter um horário e mensagem diferentes. A foto do dia é a mesma para todos.
                                </p>

                                {groupAutomations.length === 0 ? (
                                    <div style={{ textAlign: "center", padding: "32px 0", color: "#5a7a9a" }}>
                                        <div style={{ fontSize: 36, marginBottom: 12 }}>⚙️</div>
                                        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>Nenhuma automação extra</div>
                                        <div style={{ fontSize: 12 }}>Clique em &quot;+ Nova&quot; para adicionar um grupo.</div>
                                    </div>
                                ) : (
                                    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                                        {groupAutomations.map((a) => {
                                            const configuredDays = (a.days || []).filter(d => d.enabled && d.message?.trim());
                                            return (
                                                <div key={a.id} style={{
                                                    background: a.active ? "rgba(37,211,102,0.04)" : "rgba(30,58,85,0.3)",
                                                    border: `1px solid ${a.active ? "rgba(37,211,102,0.18)" : "#1e3a55"}`,
                                                    borderRadius: 14, overflow: "hidden",
                                                }}>
                                                    {/* Header do card */}
                                                    <div style={{ padding: "14px 16px", display: "flex", alignItems: "flex-start", gap: 10 }}>
                                                        <div style={{ flex: 1, minWidth: 0 }}>
                                                            <div style={{ fontSize: 14, fontWeight: 700, color: "#d0dae8", marginBottom: 4, wordBreak: "break-word" }}>
                                                                {a.groupName || a.groupJid.replace(/@g\.us$/, "")}
                                                            </div>
                                                            <div style={{ fontSize: 12, color: "#5a7a9a" }}>
                                                                ⏰ {a.scheduleTime} · {a.timezone}
                                                            </div>
                                                            <div style={{ fontSize: 11, color: configuredDays.length === 7 ? "#25D366" : configuredDays.length > 0 ? "#f0a030" : "#f55", marginTop: 4 }}>
                                                                {configuredDays.length === 0
                                                                    ? "⚠️ Nenhuma mensagem configurada"
                                                                    : configuredDays.length === 7
                                                                        ? "✅ Semana completa"
                                                                        : `📝 ${configuredDays.length}/7 dias com mensagem`}
                                                            </div>
                                                        </div>
                                                        <div style={{ display: "flex", flexDirection: "column", gap: 6, flexShrink: 0 }}>
                                                            <button onClick={() => toggleGroupAutomation(a)} style={{ padding: "5px 10px", borderRadius: 8, border: "none", fontSize: 11, fontWeight: 700, cursor: "pointer", background: a.active ? "rgba(37,211,102,0.15)" : "rgba(90,122,154,0.15)", color: a.active ? "#25D366" : "#5a7a9a" }}>
                                                                {a.active ? "✅ Ativo" : "⏸ Parado"}
                                                            </button>
                                                            <button onClick={() => openEditAutoModal(a)} style={{ padding: "5px 10px", borderRadius: 8, border: "1px solid #1e3a55", fontSize: 11, cursor: "pointer", background: "transparent", color: "#7aa8cc" }}>
                                                                ✏️ Config
                                                            </button>
                                                            <button onClick={() => deleteGroupAutomation(a.id)} style={{ padding: "5px 10px", borderRadius: 8, border: "none", fontSize: 11, cursor: "pointer", background: "rgba(244,67,54,0.1)", color: "#f55" }}>
                                                                🗑️
                                                            </button>
                                                        </div>
                                                    </div>

                                                    {/* Preview dos dias da semana */}
                                                    <div style={{ borderTop: "1px solid #1a2d45", padding: "10px 16px", display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                                                        {DAYS_LABELS.map((label, idx) => {
                                                            const d = (a.days || []).find(x => x.day === idx);
                                                            const ok = d?.enabled && d?.message?.trim();
                                                            return (
                                                                <span key={idx} style={{ fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 6, background: ok ? "rgba(37,211,102,0.15)" : "rgba(30,58,85,0.5)", color: ok ? "#25D366" : "#5a7a9a", border: `1px solid ${ok ? "rgba(37,211,102,0.2)" : "#1e3a55"}` }}>
                                                                    {label}
                                                                </span>
                                                            );
                                                        })}
                                                        <button onClick={() => openDaysModal(a)} style={{ marginLeft: "auto", padding: "4px 12px", borderRadius: 8, border: "1px solid #25D366", fontSize: 11, fontWeight: 700, cursor: "pointer", background: "transparent", color: "#25D366" }}>
                                                            📝 Mensagens
                                                        </button>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        )}
                    </>
                )}


                {/* ══════════ MODAL ADD/EDIT CONFIG AUTOMAÇÃO ══════════ */}
                {autoModal && (autoModal.mode === "add" || autoModal.mode === "edit") && (
                    <div onClick={() => setAutoModal(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 2000 }}>
                        <div onClick={e => e.stopPropagation()} style={{ width: "100%", maxWidth: 480, background: "#0f1e31", border: "1px solid #1e3a55", borderRadius: "20px 20px 0 0", padding: "24px 20px 32px" }}>
                            <h2 style={{ ...S.cardTitle, marginTop: 0, marginBottom: 20 }}>{autoModal.mode === "add" ? "➕ Nova Automação" : "✏️ Configurar Grupo"}</h2>

                            <div style={S.formGroup}>
                                <label style={S.label}>Grupo do WhatsApp</label>
                                <div style={{ display: "flex", gap: 8 }}>
                                    <select style={{ ...S.select, flex: 1 }} value={autoForm.groupJid} onChange={e => setAutoForm(f => ({ ...f, groupJid: e.target.value }))} disabled={autoModal.mode === "edit"}>
                                        <option value="">-- Selecione --</option>
                                        {groups.map(g => <option key={g.jid} value={g.jid}>{g.name}</option>)}
                                    </select>
                                    <button style={S.btnIcon} onClick={loadGroups} title="Atualizar">🔄</button>
                                </div>
                            </div>

                            <div style={{ display: "flex", gap: 12 }}>
                                <div style={{ ...S.formGroup, flex: 1 }}>
                                    <label style={S.label}>Fuso horário</label>
                                    <input style={S.input} value={autoForm.timezone} onChange={e => setAutoForm(f => ({ ...f, timezone: e.target.value }))} />
                                </div>
                                <div style={{ ...S.formGroup, flex: 0 }}>
                                    <label style={S.label}>Horário</label>
                                    <input type="time" style={{ ...S.input, width: 110 }} value={autoForm.scheduleTime} onChange={e => setAutoForm(f => ({ ...f, scheduleTime: e.target.value }))} />
                                </div>
                            </div>

                            <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", marginBottom: 20 }}>
                                <input type="checkbox" checked={autoForm.active} onChange={e => setAutoForm(f => ({ ...f, active: e.target.checked }))} style={{ width: 16, height: 16, accentColor: "#25D366" }} />
                                <span style={{ fontSize: 13, color: "#d0dae8" }}>Automação ativa</span>
                            </label>

                            {autoModal.mode === "add" && (
                                <p style={{ fontSize: 12, color: "#5a7a9a", marginBottom: 16, background: "rgba(37,211,102,0.06)", border: "1px solid rgba(37,211,102,0.15)", borderRadius: 8, padding: "10px 12px" }}>
                                    💡 Após criar, você configurará as mensagens para cada dia da semana.
                                </p>
                            )}

                            <div style={{ display: "flex", gap: 10 }}>
                                <button style={{ ...S.btnPrimary, flex: 1, ...(autoSaving ? { opacity: 0.5 } : {}) }} onClick={saveAutoModal} disabled={autoSaving}>
                                    {autoSaving ? "⏳ Salvando..." : autoModal.mode === "add" ? "➡️ Próximo" : "💾 Salvar"}
                                </button>
                                <button style={{ ...S.btnIcon, flex: 0, padding: "12px 18px" }} onClick={() => setAutoModal(null)}>Cancelar</button>
                            </div>
                        </div>
                    </div>
                )}

                {/* ══════════ MODAL MENSAGENS POR DIA DA SEMANA ══════════ */}
                {autoModal && autoModal.mode === "days" && (
                    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 2000 }}>
                        <div style={{ width: "100%", maxWidth: 480, background: "#0b1528", border: "1px solid #1e3a55", borderRadius: "20px 20px 0 0", maxHeight: "90vh", display: "flex", flexDirection: "column" }}>
                            <div style={{ padding: "20px 20px 12px", borderBottom: "1px solid #1e3a55", flexShrink: 0 }}>
                                <h2 style={{ ...S.cardTitle, marginTop: 0, marginBottom: 4 }}>📝 Mensagens da Semana</h2>
                                <p style={{ fontSize: 12, color: "#5a7a9a", margin: 0 }}>
                                    {autoModal.item.groupName || autoModal.item.groupJid?.replace(/@g\.us$/, "")} · {autoModal.item.scheduleTime}
                                </p>
                            </div>

                            <div style={{ overflowY: "auto", flex: 1, padding: "12px 16px 8px" }}>
                                {autoDays.map((d, idx) => (
                                    <div key={d.day} style={{ marginBottom: 14, background: "rgba(15,30,49,0.8)", border: `1px solid ${d.enabled && d.message?.trim() ? "rgba(37,211,102,0.2)" : "#1e3a55"}`, borderRadius: 12, padding: "12px 14px" }}>
                                        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                                            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", flex: 1 }}>
                                                <input
                                                    type="checkbox"
                                                    checked={d.enabled}
                                                    onChange={e => setAutoDays(days => days.map((x, i) => i === idx ? { ...x, enabled: e.target.checked } : x))}
                                                    style={{ width: 15, height: 15, accentColor: "#25D366" }}
                                                />
                                                <span style={{ fontSize: 13, fontWeight: 700, color: d.enabled ? "#d0dae8" : "#5a7a9a" }}>{DAYS_LABELS[d.day]}</span>
                                            </label>
                                            {d.enabled && d.message?.trim() && <span style={{ fontSize: 10, color: "#25D366" }}>✓</span>}
                                        </div>
                                        {d.enabled && (
                                            <textarea
                                                style={{ ...S.textarea, marginBottom: 0, fontSize: 12, minHeight: 60 }}
                                                rows={2}
                                                value={d.message}
                                                placeholder={`Mensagem para ${DAYS_LABELS[d.day]}...`}
                                                onChange={e => setAutoDays(days => days.map((x, i) => i === idx ? { ...x, message: e.target.value } : x))}
                                            />
                                        )}
                                    </div>
                                ))}
                            </div>

                            <div style={{ padding: "12px 16px 28px", borderTop: "1px solid #1e3a55", display: "flex", gap: 10, flexShrink: 0 }}>
                                <button style={{ ...S.btnPrimary, flex: 1, ...(autoSaving ? { opacity: 0.5 } : {}) }} onClick={saveDaysModal} disabled={autoSaving}>
                                    {autoSaving ? "⏳ Salvando..." : "💾 Salvar Mensagens"}
                                </button>
                                <button style={{ ...S.btnIcon, flex: 0, padding: "12px 18px" }} onClick={() => setAutoModal(null)}>Fechar</button>
                            </div>
                        </div>
                    </div>
                )}

                {/* ══════════ PREVIEW MODAL ══════════ */}
                {previewDay !== null && (
                    <div
                        onClick={() => setPreviewDay(null)}
                        style={{
                            position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            zIndex: 2000, padding: 16,
                        }}
                    >
                        <div
                            onClick={(e) => e.stopPropagation()}
                            style={{
                                background: "#0f1e31", border: "1px solid #1e2d44", borderRadius: 16,
                                padding: 24, maxWidth: 360, width: "100%",
                            }}
                        >
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                                <h3 style={{ margin: 0, fontSize: 16, color: "#d0dae8" }}>
                                    {DAY_ICONS[previewDay]} Preview — {DAYS[previewDay]}
                                </h3>
                                <button onClick={() => setPreviewDay(null)} style={{ background: "none", border: "none", color: "#5a7a9a", fontSize: 20, cursor: "pointer" }}>✕</button>
                            </div>
                            {/* Balão de mensagem estilo WhatsApp */}
                            <div style={{ background: "#128C7E", borderRadius: 12, padding: "10px 14px", marginBottom: 10, fontSize: 14, color: "#fff", lineHeight: 1.5 }}>
                                {(photos[previewDay]?.message?.trim()) || config.message || "(sem mensagem)"}
                            </div>
                            {photos[previewDay]?.dataUrl && (
                                <img
                                    src={photos[previewDay].dataUrl}
                                    alt="Preview"
                                    style={{ width: "100%", borderRadius: 10, border: "1px solid #1e2d44" }}
                                />
                            )}
                            <p style={{ fontSize: 11, color: "#5a7a9a", marginTop: 10, textAlign: "center" }}>
                                Será enviado às {config.scheduleTime || "05:00"} no grupo configurado
                            </p>
                        </div>
                    </div>
                )}

                {/* ── BOTTOM NAV — apenas quando conectado ── */}
                {currentUser?.role !== "ALUNO" && status === "open" && (
                    <nav style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: "#0d1929", borderTop: "1px solid #1a2a40", display: "flex", justifyContent: "center", zIndex: 200 }}>
                        <div style={{ width: "100%", maxWidth: 720, display: "flex" }}>
                            {[
                                { key: "auto", icon: "⏰", label: "Automação" },
                                { key: "manual", icon: "⚙️", label: "Grupos" },
                                { key: "flow", icon: "🤖", label: "Bot Vendas" },
                                ...(currentUser?.role === "ADMIN" ? [{ key: "users", icon: "👥", label: "Admin" }, { key: "requests", icon: "🔔", label: "Acesso", badge: pendingCount }] : []),
                            ].map(({ key, icon, label, badge }) => (
                                <button
                                    key={key}
                                    onClick={() => {
                                        setTab(key);
                                        if (key === "users") { loadUsers(); loadBoxes(); loadBoxData(); }
                                        if (key === "flow") { loadFlowConfig(); loadFlowStats(); loadFlowLeads(1, "all"); }
                                        if (key === "requests") { loadAccessRequests(); }
                                        if (key === "manual") { loadGroupAutomations(); loadGroups(); }
                                    }}
                                    style={{
                                        flex: 1, display: "flex", flexDirection: "column", alignItems: "center",
                                        gap: 2, padding: "10px 0 8px", background: "none", border: "none",
                                        cursor: "pointer", color: tab === key ? "#25D366" : "#5a7a9a",
                                        borderTop: `2px solid ${tab === key ? "#25D366" : "transparent"}`,
                                        position: "relative",
                                    }}
                                >
                                    <span style={{ fontSize: 22, position: "relative" }}>
                                        {icon}
                                        {badge > 0 && <span style={{ position: "absolute", top: -4, right: -6, background: "#f44", color: "#fff", fontSize: 9, fontWeight: 700, borderRadius: 8, padding: "1px 4px", lineHeight: 1.4 }}>{badge}</span>}
                                    </span>
                                    <span style={{ fontSize: 10, fontWeight: tab === key ? 700 : 400 }}>{label}</span>
                                </button>
                            ))}
                        </div>
                    </nav>
                )}

                {/* ── TOAST ── */}
                {toast.text && (
                    <div
                        style={{
                            ...S.toast,
                            background:
                                toast.type === "success"
                                    ? "#25D366"
                                    : toast.type === "error"
                                        ? "#f44"
                                        : "#334",
                        }}
                    >
                        {toast.text}
                    </div>
                )}

                {/* ── MODAL INSTALAR PWA ── */}
                {showInstallModal && (
                    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 900, display: "flex", alignItems: "flex-end", justifyContent: "center", padding: "0 0 24px" }}
                        onClick={() => setShowInstallModal(false)}>
                        <div style={{ width: "100%", maxWidth: 440, background: "#0f1e31", border: "1px solid #1a3a5a", borderRadius: 20, padding: "28px 24px", boxShadow: "0 -4px 32px rgba(0,0,0,0.5)" }}
                            onClick={e => e.stopPropagation()}>
                            <div style={{ fontSize: 20, fontWeight: 800, color: "#d0dae8", marginBottom: 6, textAlign: "center" }}>📲 Instalar Team Muniz</div>
                            <div style={{ fontSize: 13, color: "#5a7a9a", textAlign: "center", marginBottom: 24 }}>Adicione à tela inicial para usar como app</div>
                            <div style={{ background: "#0b1528", borderRadius: 12, padding: "16px", marginBottom: 16 }}>
                                <div style={{ fontSize: 13, fontWeight: 700, color: "#25D366", marginBottom: 10 }}>🍎 iPhone / iPad (Safari)</div>
                                <div style={{ fontSize: 13, color: "#8a9ab0", lineHeight: 1.7 }}>
                                    1. Toque em <strong style={{ color: "#d0dae8" }}>compartilhar</strong> (ícone da caixa com seta ↑)<br />
                                    2. Role e toque em <strong style={{ color: "#d0dae8" }}>&quot;Adicionar à Tela Inicial&quot;</strong><br />
                                    3. Confirme tocando em <strong style={{ color: "#d0dae8" }}>Adicionar</strong>
                                </div>
                            </div>
                            <div style={{ background: "#0b1528", borderRadius: 12, padding: "16px", marginBottom: 20 }}>
                                <div style={{ fontSize: 13, fontWeight: 700, color: "#25D366", marginBottom: 10 }}>🤖 Android (Chrome)</div>
                                <div style={{ fontSize: 13, color: "#8a9ab0", lineHeight: 1.7 }}>
                                    1. Toque nos <strong style={{ color: "#d0dae8" }}>3 pontos ⋮</strong> no canto superior direito<br />
                                    2. Toque em <strong style={{ color: "#d0dae8" }}>&quot;Adicionar à tela inicial&quot;</strong><br />
                                    3. Confirme tocando em <strong style={{ color: "#d0dae8" }}>Adicionar</strong>
                                </div>
                            </div>
                            <button onClick={() => setShowInstallModal(false)} style={{ width: "100%", padding: "14px", background: "#25D366", border: "none", borderRadius: 12, color: "#000", fontWeight: 700, fontSize: 15, cursor: "pointer" }}>Entendido</button>
                        </div>
                    </div>
                )}

                {/* ── MODAL PERFIL ── */}
                {showProfileModal && (
                    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 900, display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }}
                        onClick={() => setShowProfileModal(false)}>
                        <div style={{ width: "100%", maxWidth: 420, background: "#0f1e31", border: "1px solid #1a3a5a", borderRadius: 20, padding: "28px 24px", boxShadow: "0 4px 32px rgba(0,0,0,0.5)", maxHeight: "90vh", overflowY: "auto" }}
                            onClick={e => e.stopPropagation()}>
                            <div style={{ fontSize: 18, fontWeight: 800, color: "#d0dae8", marginBottom: 20, textAlign: "center" }}>👤 Meu Perfil</div>
                            {/* Avatar */}
                            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: 24 }}>
                                <div style={{ position: "relative", width: 80, height: 80, marginBottom: 10 }}>
                                    <div style={{ width: 80, height: 80, borderRadius: "50%", overflow: "hidden", background: "#152238", border: "2px solid #25D366", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 32, color: "#25D366", fontWeight: 700 }}>
                                        {profileAvatarFile
                                            ? <img src={URL.createObjectURL(profileAvatarFile)} style={{ width: "100%", height: "100%", objectFit: "cover" }} alt="preview" />
                                            : currentUser?.avatar
                                                ? <img src={`data:image/jpeg;base64,${currentUser.avatar}`} style={{ width: "100%", height: "100%", objectFit: "cover" }} alt="avatar" />
                                                : (currentUser?.name?.[0]?.toUpperCase() || "U")
                                        }
                                    </div>
                                    <button onClick={() => profileAvatarRef.current?.click()} style={{ position: "absolute", bottom: -2, right: -2, width: 26, height: 26, borderRadius: "50%", background: "#25D366", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12 }}>📷</button>
                                </div>
                                <input type="file" accept="image/*" ref={profileAvatarRef} style={{ display: "none" }} onChange={e => { if (e.target.files[0]) setProfileAvatarFile(e.target.files[0]); e.target.value = ""; }} />
                            </div>
                            {/* Nome */}
                            <div style={{ marginBottom: 14 }}>
                                <label style={S.label}>Nome</label>
                                <input style={S.input} value={profileName} onChange={e => setProfileName(e.target.value)} />
                            </div>
                            {/* Email (readonly) */}
                            <div style={{ marginBottom: 14 }}>
                                <label style={S.label}>Email</label>
                                <input style={{ ...S.input, opacity: 0.6 }} value={currentUser?.email || ""} readOnly />
                            </div>
                            <hr style={{ border: "none", borderTop: "1px solid #1a2a40", margin: "18px 0" }} />
                            <div style={{ fontSize: 12, fontWeight: 700, color: "#7a8ea2", textTransform: "uppercase", letterSpacing: 1, marginBottom: 14 }}>Alterar Senha</div>
                            <div style={{ marginBottom: 12 }}>
                                <label style={S.label}>Senha atual</label>
                                <div style={{ position: "relative" }}>
                                    <input style={{ ...S.input, paddingRight: 40 }} type={showPwd.current ? "text" : "password"} value={profileCurrentPwd} onChange={e => setProfileCurrentPwd(e.target.value)} placeholder="••••••••" />
                                    <button type="button" onClick={() => setShowPwd(p => ({ ...p, current: !p.current }))} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "#5a7a9a", fontSize: 16, padding: 0, lineHeight: 1 }}>{showPwd.current ? "🙈" : "👁️"}</button>
                                </div>
                            </div>
                            <div style={{ marginBottom: 12 }}>
                                <label style={S.label}>Nova senha</label>
                                <div style={{ position: "relative" }}>
                                    <input style={{ ...S.input, paddingRight: 40 }} type={showPwd.newp ? "text" : "password"} value={profileNewPwd} onChange={e => setProfileNewPwd(e.target.value)} placeholder="Mínimo 8 caracteres" />
                                    <button type="button" onClick={() => setShowPwd(p => ({ ...p, newp: !p.newp }))} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "#5a7a9a", fontSize: 16, padding: 0, lineHeight: 1 }}>{showPwd.newp ? "🙈" : "👁️"}</button>
                                </div>
                            </div>
                            <div style={{ marginBottom: 20 }}>
                                <label style={S.label}>Confirmar nova senha</label>
                                <div style={{ position: "relative" }}>
                                    <input style={{ ...S.input, paddingRight: 40 }} type={showPwd.confirm ? "text" : "password"} value={profileConfirmPwd} onChange={e => setProfileConfirmPwd(e.target.value)} placeholder="Repita a nova senha" />
                                    <button type="button" onClick={() => setShowPwd(p => ({ ...p, confirm: !p.confirm }))} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "#5a7a9a", fontSize: 16, padding: 0, lineHeight: 1 }}>{showPwd.confirm ? "🙈" : "👁️"}</button>
                                </div>
                            </div>
                            <div style={{ display: "flex", gap: 10 }}>
                                <button onClick={() => setShowProfileModal(false)} style={{ flex: 1, padding: "12px", background: "rgba(255,255,255,0.05)", border: "1px solid #1a2a40", borderRadius: 10, color: "#7a8ea2", fontSize: 14, cursor: "pointer" }}>Cancelar</button>
                                <button onClick={saveProfile} disabled={profileSaving} style={{ flex: 2, padding: "12px", background: profileSaving ? "rgba(37,211,102,0.5)" : "#25D366", border: "none", borderRadius: 10, color: "#000", fontWeight: 700, fontSize: 14, cursor: profileSaving ? "not-allowed" : "pointer" }}>{profileSaving ? "Salvando..." : "Salvar"}</button>
                            </div>
                        </div>
                    </div>
                )}

            </div>
        </>
    );
}

// ── Estilos ──────────────────────────────────────────────────────────────────
const S = {
    page: {
        maxWidth: 720,
        margin: "0 auto",
        padding: "20px 16px 80px",
        fontFamily:
            '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif',
        color: "#d0dae8",
    },
    header: {
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: 20,
        paddingBottom: 16,
        borderBottom: "1px solid #1a2a40",
    },
    title: { fontSize: 24, margin: 0, color: "#25D366" },
    subtitle: { fontSize: 13, margin: "4px 0 0", color: "#5a6e84" },
    badge: {
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "6px 14px",
        borderRadius: 20,
        fontSize: 13,
        fontWeight: 500,
        border: "1px solid",
    },
    dot: { width: 8, height: 8, borderRadius: "50%", flexShrink: 0 },

    qrCard: {
        background: "#fff",
        borderRadius: 12,
        padding: 24,
        textAlign: "center",
        marginBottom: 16,
    },

    // ── Tabs ──
    tabBar: {
        display: "flex",
        gap: 0,
        marginBottom: 16,
        background: "#111b2e",
        border: "1px solid #1a2a40",
        borderRadius: 10,
        padding: 4,
    },
    tabBtn: {
        flex: 1,
        padding: "10px 0",
        background: "transparent",
        border: "none",
        borderRadius: 8,
        color: "#5a7a9a",
        fontSize: 14,
        fontWeight: 600,
        cursor: "pointer",
        transition: "all 0.2s",
    },
    tabActive: {
        background: "#25D366",
        color: "#000",
    },

    statsRow: {
        display: "grid",
        gap: 10,
        marginBottom: 16,
    },
    stat: {
        background: "#111b2e",
        border: "1px solid #1a2a40",
        borderRadius: 10,
        padding: "14px 10px",
        textAlign: "center",
        display: "flex",
        flexDirection: "column",
        gap: 4,
    },
    statNum: { fontSize: 22, fontWeight: 700, color: "#25D366" },
    statLabel: { fontSize: 11, color: "#5a6e84", textTransform: "uppercase" },

    card: {
        background: "#111b2e",
        border: "1px solid #1a2a40",
        borderRadius: 12,
        padding: 20,
        marginBottom: 16,
    },
    cardTitle: { fontSize: 16, margin: "0 0 4px", color: "#e1e8f0" },
    cardSub: { fontSize: 13, color: "#5a6e84", margin: "0 0 16px" },

    formGroup: { marginBottom: 14 },
    label: {
        display: "block",
        fontSize: 13,
        color: "#7a8ea2",
        marginBottom: 6,
        fontWeight: 500,
    },
    input: {
        width: "100%",
        padding: "10px 12px",
        background: "#0b1528",
        border: "1px solid #1e2d44",
        borderRadius: 8,
        color: "#d0dae8",
        fontSize: 14,
        boxSizing: "border-box",
        outline: "none",
    },
    select: {
        padding: "10px 12px",
        background: "#0b1528",
        border: "1px solid #1e2d44",
        borderRadius: 8,
        color: "#d0dae8",
        fontSize: 14,
        outline: "none",
        boxSizing: "border-box",
        width: "100%",
        minWidth: 0,
        overflow: "hidden",
        textOverflow: "ellipsis",
    },
    textarea: {
        width: "100%",
        padding: "10px 12px",
        background: "#0b1528",
        border: "1px solid #1e2d44",
        borderRadius: 8,
        color: "#d0dae8",
        fontSize: 14,
        resize: "vertical",
        boxSizing: "border-box",
        outline: "none",
        fontFamily: "inherit",
    },
    infoBox: {
        background: "rgba(37,211,102,0.06)",
        border: "1px solid rgba(37,211,102,0.15)",
        borderRadius: 8,
        padding: "10px 14px",
        fontSize: 13,
        color: "#7cc0a0",
        marginBottom: 14,
        lineHeight: 1.5,
    },
    btnIcon: {
        padding: "10px 14px",
        background: "#152238",
        border: "1px solid #1e2d44",
        borderRadius: 8,
        fontSize: 16,
        cursor: "pointer",
    },

    grid: {
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(135px, 1fr))",
        gap: 12,
    },
    dayCard: {
        background: "#0b1528",
        border: "2px solid #1e2d44",
        borderRadius: 10,
        padding: 10,
        textAlign: "center",
        position: "relative",
        transition: "border-color 0.2s, box-shadow 0.2s",
    },
    todayTag: {
        position: "absolute",
        top: -9,
        right: -6,
        background: "#25D366",
        color: "#000",
        fontSize: 10,
        fontWeight: 700,
        padding: "2px 8px",
        borderRadius: 10,
    },
    dayHeader: {
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
        marginBottom: 8,
    },
    dayName: { fontSize: 13, margin: 0, color: "#b0c0d0", fontWeight: 600 },
    photoBox: { marginBottom: 8 },
    photoImg: {
        width: "100%",
        height: 95,
        objectFit: "cover",
        borderRadius: 6,
        border: "1px solid #1e2d44",
    },
    photoEmpty: {
        width: "100%",
        height: 95,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: "#080e1c",
        borderRadius: 6,
        border: "1px dashed #1e2d44",
    },
    dayBtns: { display: "flex", gap: 6, justifyContent: "center" },
    btnUpload: {
        flex: 1,
        padding: "6px 0",
        background: "#152238",
        border: "1px solid #1e3050",
        borderRadius: 6,
        color: "#7ab8e8",
        fontSize: 12,
        cursor: "pointer",
    },
    btnDel: {
        padding: "6px 8px",
        background: "#281218",
        border: "1px solid #4a1a28",
        borderRadius: 6,
        color: "#f88",
        fontSize: 12,
        cursor: "pointer",
    },

    btnPrimary: {
        padding: "10px 22px",
        background: "#25D366",
        color: "#000",
        border: "none",
        borderRadius: 8,
        fontSize: 14,
        fontWeight: 600,
        cursor: "pointer",
    },
    btnDanger: {
        padding: "10px 18px",
        background: "rgba(244,67,54,0.1)",
        color: "#f55",
        border: "1px solid rgba(244,67,54,0.25)",
        borderRadius: 8,
        fontSize: 14,
        cursor: "pointer",
    },
    btnWarn: {
        padding: "10px 18px",
        background: "rgba(255,152,0,0.1)",
        color: "#FF9800",
        border: "1px solid rgba(255,152,0,0.25)",
        borderRadius: 8,
        fontSize: 14,
        cursor: "pointer",
    },
    toast: {
        position: "fixed",
        bottom: 80,
        left: "50%",
        transform: "translateX(-50%)",
        padding: "12px 24px",
        borderRadius: 8,
        fontSize: 14,
        fontWeight: 500,
        color: "#fff",
        zIndex: 1000,
        boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
    },
};
