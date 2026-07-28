import { useState, useEffect, useCallback, useRef } from "react";
import Head from "next/head";
import { Inter } from "next/font/google";
import {
    AlarmClock, AlertTriangle, ArrowLeft, Bell, Bot, Building2, Calendar, Camera, Check,
    CheckCircle2, ChevronRight, ClipboardList, Clock, CreditCard, Download, Dumbbell, Eye, EyeOff,
    FileText, Folder, ImagePlus, Info, KeyRound, ListTree, Lock, LogOut, Mail, MapPin, Medal, MessageCircle,
    Pause, Pencil, Play, Plus, Power, RefreshCw, RotateCcw, Save, Search, Send, Settings, Smartphone,
    Sparkles, Target, Trash2, Upload, User, Users, X, Zap,
} from "lucide-react";

const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600", "700", "800"], display: "swap" });

// Glifo do Instagram (lucide v1 não inclui ícones de marca)
const InstagramIcon = ({ size = 20, color = "currentColor" }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
        <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
        <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
    </svg>
);

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

    // ── Criar arte (WOD em texto -> imagem PNG, estilo quadro de treino) ──
    const [artDay, setArtDay] = useState(null); // null = fechado, número = dia sendo editado
    const [artText, setArtText] = useState("");
    const [artGenerating, setArtGenerating] = useState(false);
    const artCanvasRef = useRef(null);
    const ART_PLACEHOLDER = "# SKILL\nFront Squat (leve)\n\n# WOD\nAMRAP 6'\n5 Front Squats (40/29)\n10 Wallball\n20 D.U./60 S.U.\n\nRest 2'\n\n# FOR TIME\n15 - 10 - 5\nPull ups\nFront Squat";
    const DEFAULT_LOGO_SRC = "/logo/invictus-preto-sem-fundo.png";

    // ── Imagens/logo sobre a arte (estilo sticker de stories) ──
    const [artOverlays, setArtOverlays] = useState([]); // [{id, img, x, y, w, h}] em espaço do canvas (1080 x H)
    const [selectedOverlayId, setSelectedOverlayId] = useState(null);
    const [artDataByDay, setArtDataByDay] = useState({}); // day -> { text, overlays } (para permitir editar depois de pronto)
    const artPreviewWrapRef = useRef(null);
    const overlayDragRef = useRef(null);

    // ── Galeria de logos (imagens disponíveis em public/logo, estilo sticker do Stories) ──
    const [showLogoPicker, setShowLogoPicker] = useState(false);
    const [availableLogos, setAvailableLogos] = useState([]);
    const [loadingLogos, setLoadingLogos] = useState(false);

    // Ruído/textura tipo concreto — cacheada em "degraus" de altura (evita recriar
    // a cada tecla) e SEM pré-alocar um canvas gigante (canvas muito alto trava
    // silenciosamente em alguns navegadores mobile/iOS).
    const ART_TEX_BUCKET = 500;
    const ART_TEX_MAX_H = 4000; // teto seguro pra qualquer dispositivo
    const artTextureRef = useRef({ key: null, canvas: null });
    const getConcreteTexture = useCallback((W, neededH) => {
        const H = Math.min(ART_TEX_MAX_H, Math.ceil(neededH / ART_TEX_BUCKET) * ART_TEX_BUCKET);
        const key = `${W}x${H}`;
        if (artTextureRef.current.key === key) return artTextureRef.current.canvas;

        const t = document.createElement("canvas");
        t.width = W; t.height = H;
        const tctx = t.getContext("2d");

        // Base
        tctx.fillStyle = "#dcdbd6";
        tctx.fillRect(0, 0, W, H);

        // Manchas grandes (tipo nuvem/mármore) — mais contraste que a v1
        const blotches = Math.max(10, Math.round((W * H) / 90000));
        for (let i = 0; i < blotches; i++) {
            const x = Math.random() * W, y = Math.random() * H;
            const r = 120 + Math.random() * 320;
            const g = tctx.createRadialGradient(x, y, 0, x, y, r);
            const dark = Math.random() > 0.45;
            const shade = dark ? "70,68,64" : "255,255,255";
            g.addColorStop(0, `rgba(${shade},${0.10 + Math.random() * 0.14})`);
            g.addColorStop(0.6, `rgba(${shade},${0.04 + Math.random() * 0.06})`);
            g.addColorStop(1, "rgba(0,0,0,0)");
            tctx.fillStyle = g;
            tctx.beginPath();
            tctx.ellipse(x, y, r, r * (0.5 + Math.random() * 0.6), Math.random() * Math.PI, 0, Math.PI * 2);
            tctx.fill();
        }

        // Veios finos (riscos irregulares, tipo trincas do concreto)
        tctx.strokeStyle = "rgba(90,88,84,0.10)";
        tctx.lineWidth = 1.5;
        const veins = Math.max(6, Math.round(H / 220));
        for (let i = 0; i < veins; i++) {
            let x = Math.random() * W, y = Math.random() * H;
            tctx.beginPath();
            tctx.moveTo(x, y);
            const segs = 4 + Math.floor(Math.random() * 4);
            for (let s = 0; s < segs; s++) {
                x += (Math.random() - 0.5) * 220;
                y += (Math.random() - 0.5) * 140;
                tctx.lineTo(x, y);
            }
            tctx.stroke();
        }

        // Grão fino — em blocos horizontais pra não precisar de getImageData
        // no canvas inteiro de uma vez (mais leve e evita limites de memória)
        const rowH = 4;
        for (let y = 0; y < H; y += rowH) {
            for (let x = 0; x < W; x += 4) {
                if (Math.random() > 0.72) {
                    const n = (Math.random() - 0.5) * 22;
                    tctx.fillStyle = n > 0 ? `rgba(255,255,255,${Math.min(0.08, n / 100)})` : `rgba(60,58,54,${Math.min(0.08, -n / 100)})`;
                    tctx.fillRect(x, y, 4, rowH);
                }
            }
        }

        artTextureRef.current = { key, canvas: t };
        return t;
    }, []);

    // Quebra o texto em linhas que cabem em maxWidth, dado um ctx com fonte já setada
    const wrapLines = (ctx, text, maxWidth) => {
        const words = text.split(" ");
        const lines = [];
        let line = "";
        for (const word of words) {
            const test = line ? `${line} ${word}` : word;
            if (ctx.measureText(test).width > maxWidth && line) {
                lines.push(line);
                line = word;
            } else {
                line = test;
            }
        }
        if (line) lines.push(line);
        return lines;
    };

    // Interpreta o texto: linhas iniciadas com "#" viram títulos (seção nova)
    const parseArtBlocks = (raw) => {
        const blocks = [];
        let current = null;
        for (const rawLine of (raw || "").split("\n")) {
            const line = rawLine.trim();
            if (line.startsWith("#")) {
                current = { heading: line.replace(/^#+\s*/, ""), lines: [] };
                blocks.push(current);
            } else if (current) {
                current.lines.push(line);
            } else {
                current = { heading: null, lines: [line] };
                blocks.push(current);
            }
        }
        return blocks;
    };

    const drawWodArt = useCallback((canvas, text) => {
        const W = 1080;
        const PAD = 70;
        const maxWidth = W - PAD * 2;
        const HEAD_FONT = `900 78px Impact, "Arial Narrow", sans-serif`;
        const BODY_FONT = `700 38px Impact, "Arial Narrow", sans-serif`;
        const blocks = parseArtBlocks(text);

        // ── Passo 1: mede a altura total necessária ──
        const measureCtx = canvas.getContext("2d");
        let y = 80;
        const layout = [];
        for (const block of blocks) {
            const item = { heading: block.heading, bodyLines: [] };
            if (block.heading) {
                y += 78; // altura do título
                y += 20; // sublinhado + respiro
            }
            measureCtx.font = BODY_FONT;
            for (const l of block.lines) {
                if (!l) { item.bodyLines.push(""); y += 20; continue; }
                const wrapped = wrapLines(measureCtx, l, maxWidth);
                for (const w of wrapped) { item.bodyLines.push(w); y += 46; }
            }
            y += 46; // respiro entre blocos
            layout.push(item);
        }
        const H = Math.min(ART_TEX_MAX_H, Math.max(600, Math.round(y + 60)));

        canvas.width = W;
        canvas.height = H;
        const ctx = canvas.getContext("2d");

        // ── Fundo textura concreto ──
        ctx.drawImage(getConcreteTexture(W, H), 0, 0);

        // ── Passo 2: desenha ──
        ctx.textAlign = "left";
        ctx.fillStyle = "#161513";
        y = 80;
        for (const item of layout) {
            if (item.heading) {
                ctx.font = HEAD_FONT;
                ctx.fillText(item.heading.toUpperCase(), PAD, y + 60);
                const w = ctx.measureText(item.heading.toUpperCase()).width;
                ctx.fillRect(PAD, y + 78, w, 5);
                y += 78 + 20;
            }
            ctx.font = BODY_FONT;
            for (const line of item.bodyLines) {
                if (line) ctx.fillText(line.toUpperCase(), PAD, y + 30);
                y += line ? 46 : 20;
            }
            y += 46;
        }
    }, [getConcreteTexture]);

    useEffect(() => {
        if (artDay === null || !artCanvasRef.current) return;
        drawWodArt(artCanvasRef.current, artText);
    }, [artDay, artText, drawWodArt]);

    const openArtCreator = (day) => {
        const saved = artDataByDay[day];
        setArtText(saved?.text || "");
        setSelectedOverlayId(null);
        setArtDay(day);
        if (saved?.overlays) {
            setArtOverlays(saved.overlays.map((o) => ({ ...o })));
        } else {
            // Card novo: já entra com o logo padrão pronto pra usar ou excluir.
            setArtOverlays([]);
            addArtOverlayImage(DEFAULT_LOGO_SRC);
        }
    };

    const openLogoPicker = async () => {
        setShowLogoPicker(true);
        setLoadingLogos(true);
        try {
            const r = await fetch("/api/logos");
            const data = await r.json();
            setAvailableLogos(data.logos || []);
        } catch {
            setAvailableLogos([]);
        }
        setLoadingLogos(false);
    };

    const generateAndUseArt = async () => {
        if (!artText.trim()) return show("Digite o treino do dia", "error");
        setArtGenerating(true);
        try {
            const canvas = artCanvasRef.current;
            drawWodArt(canvas, artText);
            const ctx = canvas.getContext("2d");
            for (const ov of artOverlays) ctx.drawImage(ov.img, ov.x, ov.y, ov.w, ov.h);
            const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
            const file = new File([blob], `wod_${DAYS[artDay]}.png`, { type: "image/png" });
            await uploadPhoto(artDay, file);
            setArtDataByDay((prev) => ({ ...prev, [artDay]: { text: artText, overlays: artOverlays.map((o) => ({ ...o })) } }));
            setArtDay(null);
        } catch (e) {
            show("Erro ao gerar a arte", "error");
        }
        setArtGenerating(false);
    };

    // ── Adicionar/arrastar/redimensionar imagem sobre a arte ──
    // Aceita um File (upload local) ou uma string de URL (logo escolhido na galeria).
    const addArtOverlayImage = (source) => {
        const loadFromSrc = (src) => {
            const img = new window.Image();
            img.onload = () => {
                const W = 1080;
                const H = artCanvasRef.current?.height || 600;
                const ratio = img.naturalHeight / img.naturalWidth || 1;
                const w = Math.min(360, W * 0.5);
                const h = w * ratio;
                const id = `ov_${Date.now()}_${img.naturalWidth}x${img.naturalHeight}_${Math.random().toString(36).slice(2, 7)}`;
                const overlay = { id, img, x: (W - w) / 2, y: Math.max(20, (H - h) / 2), w, h };
                setArtOverlays((prev) => [...prev, overlay]);
                setSelectedOverlayId(id);
            };
            img.src = src;
        };

        if (typeof source === "string") {
            loadFromSrc(source);
            return;
        }
        const reader = new FileReader();
        reader.onload = () => loadFromSrc(reader.result);
        reader.readAsDataURL(source);
    };

    const removeArtOverlay = (id) => {
        setArtOverlays((prev) => prev.filter((o) => o.id !== id));
        setSelectedOverlayId((prev) => (prev === id ? null : prev));
    };

    const onOverlayPointerMove = useCallback((e) => {
        const ds = overlayDragRef.current;
        if (!ds) return;
        const dx = (e.clientX - ds.startX) / ds.scale;
        const dy = (e.clientY - ds.startY) / ds.scale;
        setArtOverlays((prev) => prev.map((o) => {
            if (o.id !== ds.id) return o;
            if (ds.mode === "drag") return { ...o, x: ds.ox + dx, y: ds.oy + dy };
            return { ...o, w: Math.max(24, ds.ow + dx), h: Math.max(24, ds.oh + dy) };
        }));
    }, []);

    const onOverlayPointerUp = useCallback(() => {
        overlayDragRef.current = null;
        window.removeEventListener("pointermove", onOverlayPointerMove);
        window.removeEventListener("pointerup", onOverlayPointerUp);
    }, [onOverlayPointerMove]);

    const overlayPointerDown = (e, id, mode) => {
        e.stopPropagation();
        e.preventDefault();
        const overlay = artOverlays.find((o) => o.id === id);
        if (!overlay) return;
        setSelectedOverlayId(id);
        const scale = artPreviewWrapRef.current ? artPreviewWrapRef.current.clientWidth / 1080 : 1;
        overlayDragRef.current = {
            id, mode, scale: scale || 1,
            startX: e.clientX, startY: e.clientY,
            ox: overlay.x, oy: overlay.y, ow: overlay.w, oh: overlay.h,
        };
        window.addEventListener("pointermove", onOverlayPointerMove);
        window.addEventListener("pointerup", onOverlayPointerUp);
    };

    useEffect(() => () => {
        window.removeEventListener("pointermove", onOverlayPointerMove);
        window.removeEventListener("pointerup", onOverlayPointerUp);
    }, [onOverlayPointerMove, onOverlayPointerUp]);

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
            setArtDataByDay((prev) => { if (!prev[day]) return prev; const next = { ...prev }; delete next[day]; return next; });
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
                @keyframes floatUp { from { opacity:0; transform:translateY(18px); } to { opacity:1; transform:translateY(0); } }
            `}</style>
        );

        // ── LANDING ───────────────────────────────────────────────────────────
        if (view === "landing") return (
            <>
                <Head><title>Team Muniz57</title></Head>
                <GlobalStyle />
                <div className={inter.className} style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "32px 16px", background: "var(--hero-glow), var(--bg)" }}>
                    <div style={{ width: "100%", maxWidth: 420, animation: "floatUp .5s ease both" }}>
                        {/* Logo + Nome */}
                        <div style={{ textAlign: "center", marginBottom: 36 }}>
                            <img src="/logo-team-muniz.jpeg" alt="Team Muniz57" style={{ width: 110, height: 110, borderRadius: "50%", objectFit: "cover", border: "3px solid rgba(59,130,246,0.5)", boxShadow: "0 0 40px rgba(59,130,246,0.3)", marginBottom: 16 }} />
                            <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, color: "var(--text)", letterSpacing: "-0.02em" }}>Team Muniz<span style={{ color: "var(--accent)" }}>57</span></h1>
                            <p style={{ margin: "6px 0 0", fontSize: 12, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600 }}>Performance & Discipline</p>
                        </div>

                        {/* Links */}
                        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

                            <a href="https://wa.me/5521999673608" target="_blank" rel="noopener noreferrer" className="tm-link-card" style={{ display: "flex", alignItems: "center", gap: 16, background: "var(--card)", border: "1px solid var(--border)", borderRadius: "var(--r-lg)", padding: "18px 20px", textDecoration: "none", boxShadow: "var(--shadow-1)" }}>
                                <span style={{ width: 44, height: 44, borderRadius: "var(--r-md)", background: "var(--bg-raised)", border: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                                    <MessageCircle size={20} strokeWidth={2} color="var(--whatsapp)" />
                                </span>
                                <div>
                                    <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text)" }}>Fale pelo WhatsApp</div>
                                    <div style={{ fontSize: 12, color: "var(--text-2)", marginTop: 2 }}>+55 21 99967-3608</div>
                                </div>
                                <ChevronRight size={18} strokeWidth={2} color="var(--text-3)" style={{ marginLeft: "auto", flexShrink: 0 }} />
                            </a>

                            <a href="https://www.instagram.com/teammuniz57?igsh=MTR5cW1jbHAxOTl6cQ==" target="_blank" rel="noopener noreferrer" className="tm-link-card" style={{ display: "flex", alignItems: "center", gap: 16, background: "var(--card)", border: "1px solid var(--border)", borderRadius: "var(--r-lg)", padding: "18px 20px", textDecoration: "none", boxShadow: "var(--shadow-1)" }}>
                                <span style={{ width: 44, height: 44, borderRadius: "var(--r-md)", background: "var(--bg-raised)", border: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                                    <InstagramIcon size={20} color="var(--accent)" />
                                </span>
                                <div>
                                    <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text)" }}>Instagram</div>
                                    <div style={{ fontSize: 12, color: "var(--text-2)", marginTop: 2 }}>@teammuniz57</div>
                                </div>
                                <ChevronRight size={18} strokeWidth={2} color="var(--text-3)" style={{ marginLeft: "auto", flexShrink: 0 }} />
                            </a>

                            <a href="https://wa.me/5521999673608" target="_blank" rel="noopener noreferrer" className="tm-link-card" style={{ display: "flex", alignItems: "center", gap: 16, background: "var(--card)", border: "1px solid var(--border)", borderRadius: "var(--r-lg)", padding: "18px 20px", textDecoration: "none", boxShadow: "var(--shadow-1)" }}>
                                <span style={{ width: 44, height: 44, borderRadius: "var(--r-md)", background: "var(--bg-raised)", border: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                                    <Target size={20} strokeWidth={2} color="var(--gold)" />
                                </span>
                                <div>
                                    <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text)" }}>Mentoria Team Muniz57</div>
                                    <div style={{ fontSize: 12, color: "var(--text-2)", marginTop: 2 }}>Assessoria online e presencial</div>
                                </div>
                                <ChevronRight size={18} strokeWidth={2} color="var(--text-3)" style={{ marginLeft: "auto", flexShrink: 0 }} />
                            </a>
                        </div>

                        {/* Botão painel */}
                        <div style={{ textAlign: "center", marginTop: 36 }}>
                            <button onClick={() => setView("login")} className="tm-btn" style={{ background: "none", border: "1px solid var(--border)", borderRadius: "var(--r-md)", padding: "10px 28px", color: "var(--text-2)", fontSize: 13, fontWeight: 500, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 8, transition: "color .15s, border-color .15s" }}
                                onMouseEnter={e => { e.currentTarget.style.color="var(--accent)"; e.currentTarget.style.borderColor="var(--accent)"; }}
                                onMouseLeave={e => { e.currentTarget.style.color="var(--text-2)"; e.currentTarget.style.borderColor="var(--border)"; }}>
                                <Lock size={14} strokeWidth={2} /> Acessar painel
                            </button>
                        </div>

                        <p style={{ textAlign: "center", marginTop: 20, fontSize: 11, color: "var(--text-3)" }}>© 2026 Team Muniz57</p>
                    </div>
                </div>
            </>
        );

        // ── SOLICITAR ACESSO ──────────────────────────────────────────────────
        if (view === "requestAccess") return (
            <>
                <Head><title>Solicitar Acesso - Team Muniz57</title></Head>
                <GlobalStyle />
                <div className={inter.className} style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, background: "var(--hero-glow), var(--bg)" }}>
                    <div className="fade-up" style={{ width: "100%", maxWidth: 420, background: "var(--card)", border: "1px solid var(--border)", borderRadius: "var(--r-lg)", padding: 32, boxShadow: "var(--shadow-2)" }}>
                        <button onClick={() => setView("login")} style={{ background: "none", border: "none", color: "var(--text-2)", cursor: "pointer", fontSize: 13, marginBottom: 20, padding: 0, display: "inline-flex", alignItems: "center", gap: 6 }}><ArrowLeft size={14} strokeWidth={2} /> Voltar</button>
                        <div style={{ textAlign: "center", marginBottom: 24 }}>
                            <img src="/logo-team-muniz.jpeg" alt="Team Muniz57" style={{ width: 72, height: 72, borderRadius: "50%", objectFit: "cover", border: "2px solid rgba(59,130,246,0.4)", marginBottom: 12 }} />
                            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: "var(--text)" }}>Solicitar Acesso</h2>
                            <p style={{ margin: "6px 0 0", fontSize: 13, color: "var(--text-2)" }}>O administrador vai liberar seu acesso</p>
                        </div>
                        {reqSent ? (
                            <div style={{ textAlign: "center", padding: "24px 0" }}>
                                <div style={{ marginBottom: 12, display: "flex", justifyContent: "center" }}><CheckCircle2 size={48} strokeWidth={1.5} color="var(--success)" /></div>
                                <p style={{ color: "var(--success)", fontWeight: 700, fontSize: 16, margin: 0 }}>Solicitação enviada!</p>
                                <p style={{ color: "var(--text-2)", fontSize: 13, marginTop: 8 }}>Aguarde o administrador liberar seu acesso. Você receberá seus dados de login em breve.</p>
                                <button onClick={() => { setReqSent(false); setView("login"); }} className="tm-btn" style={{ marginTop: 20, background: "none", border: "1px solid var(--accent)", borderRadius: "var(--r-md)", padding: "8px 20px", color: "var(--accent)", fontSize: 13, cursor: "pointer" }}>Ir para login</button>
                            </div>
                        ) : (
                            <form onSubmit={submitAccessRequest} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                                <div>
                                    <label style={{ display: "block", fontSize: 12, color: "var(--text-2)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>Nome completo *</label>
                                    <input required value={reqForm.name} onChange={e => setReqForm(f => ({ ...f, name: e.target.value }))} placeholder="João Silva" style={{ ...S.input, width: "100%" }} />
                                </div>
                                <div>
                                    <label style={{ display: "block", fontSize: 12, color: "var(--text-2)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>Email *</label>
                                    <input required type="email" value={reqForm.email} onChange={e => setReqForm(f => ({ ...f, email: e.target.value }))} placeholder="joao@email.com" style={{ ...S.input, width: "100%" }} />
                                </div>
                                <div>
                                    <label style={{ display: "block", fontSize: 12, color: "var(--text-2)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>WhatsApp</label>
                                    <input value={reqForm.phone} onChange={e => setReqForm(f => ({ ...f, phone: e.target.value }))} placeholder="(11) 99999-9999" style={{ ...S.input, width: "100%" }} />
                                </div>
                                <div>
                                    <label style={{ display: "block", fontSize: 12, color: "var(--text-2)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>Mensagem (opcional)</label>
                                    <textarea value={reqForm.message} onChange={e => setReqForm(f => ({ ...f, message: e.target.value }))} placeholder="Conte um pouco sobre você..." rows={3} style={{ ...S.input, width: "100%", resize: "vertical", fontFamily: "inherit" }} />
                                </div>
                                <button type="submit" disabled={reqSending} className="tm-btn tm-btn-primary" style={{ ...S.btnPrimary, marginTop: 4, opacity: reqSending ? 0.7 : 1 }}>
                                    {reqSending ? "Enviando..." : <><Send size={16} strokeWidth={2} /> Enviar solicitação</>}
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
                <div className={inter.className} style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, background: "var(--hero-glow), var(--bg)" }}>
                    <div className="fade-up" style={{ width: "100%", maxWidth: 400, background: "var(--card)", border: "1px solid var(--border)", borderRadius: "var(--r-lg)", padding: 32, boxShadow: "var(--shadow-2)" }}>
                        <button onClick={() => setView("landing")} style={{ background: "none", border: "none", color: "var(--text-2)", cursor: "pointer", fontSize: 13, marginBottom: 20, padding: 0, display: "inline-flex", alignItems: "center", gap: 6 }}><ArrowLeft size={14} strokeWidth={2} /> Voltar</button>
                        <div style={{ textAlign: "center", marginBottom: 28 }}>
                            <img src="/logo-team-muniz.jpeg" alt="Team Muniz" style={{ width: 120, height: 120, borderRadius: "50%", objectFit: "cover", marginBottom: 14, border: "3px solid rgba(59,130,246,0.5)", boxShadow: "0 0 40px rgba(59,130,246,0.3)" }} />
                            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: "var(--text)", letterSpacing: "-0.02em" }}>Team Muniz<span style={{ color: "var(--accent)" }}>57</span></h1>
                            <p style={{ margin: "6px 0 0", fontSize: 13, color: "var(--text-2)" }}>Painel de controle</p>
                        </div>
                        <form onSubmit={handleLogin} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                            <div>
                                <label style={{ ...S.label, fontSize: 12 }}>Email</label>
                                <div style={{ position: "relative" }}>
                                    <Mail size={16} strokeWidth={2} color="var(--text-3)" style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} />
                                    <input
                                        type="email"
                                        required
                                        autoFocus
                                        value={loginEmail}
                                        onChange={(e) => setLoginEmail(e.target.value)}
                                        placeholder="seu@email.com"
                                        style={{ ...S.input, width: "100%", paddingLeft: 42 }}
                                    />
                                </div>
                            </div>
                            <div>
                                <label style={{ ...S.label, fontSize: 12 }}>Senha</label>
                                <div style={{ position: "relative" }}>
                                    <Lock size={16} strokeWidth={2} color="var(--text-3)" style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} />
                                    <input
                                        type="password"
                                        required
                                        value={loginPassword}
                                        onChange={(e) => setLoginPassword(e.target.value)}
                                        placeholder="••••••••"
                                        style={{ ...S.input, width: "100%", paddingLeft: 42 }}
                                    />
                                </div>
                            </div>
                            {loginError && (
                                <div style={{ background: "var(--danger-soft)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: "var(--r-sm)", padding: "8px 12px", color: "var(--danger)", fontSize: 13 }}>
                                    {loginError}
                                </div>
                            )}
                            <button
                                type="submit"
                                disabled={loginLoading}
                                className="tm-btn tm-btn-primary"
                                style={{ ...S.btnPrimary, marginTop: 4, width: "100%", padding: "13px 22px", fontSize: 15, opacity: loginLoading ? 0.7 : 1 }}
                            >
                                {loginLoading ? "Entrando..." : "Entrar"}
                            </button>
                        </form>
                        <div style={{ textAlign: "center", marginTop: 20 }}>
                            <button onClick={() => { setReqForm({ name: "", email: "", phone: "", message: "" }); setReqSent(false); setView("requestAccess"); }} style={{ background: "none", border: "none", color: "var(--text-2)", cursor: "pointer", fontSize: 13 }}>
                                Não tenho conta — <span style={{ color: "var(--accent)" }}>Solicitar acesso</span>
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
            <div className={inter.className} style={S.page}>
                {/* ── HEADER COMPACTO (mobile-first) ── */}
                <header style={S.header}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <img src="/logo-team-muniz.jpeg" alt="Team Muniz" style={{ width: 38, height: 38, borderRadius: "50%", objectFit: "cover", border: "2px solid rgba(59,130,246,0.5)", flexShrink: 0 }} />
                        <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.2 }}>
                            <span style={{ fontSize: 15, fontWeight: 800, color: "var(--text)", letterSpacing: "0.01em" }}>Team Muniz<span style={{ color: "var(--accent)" }}>57</span></span>
                            <span style={{ fontSize: 11, color: "var(--text-3)" }}>{currentUser?.name}</span>
                        </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        {currentUser?.role !== "ALUNO" && (
                            <span style={{
                                display: "inline-flex", alignItems: "center", gap: 5,
                                padding: "5px 10px", borderRadius: "var(--r-full)", fontSize: 12, fontWeight: 500,
                                background: status === "open" ? "var(--success-soft)" : status === "waiting_qr" || status === "connecting" ? "var(--warning-soft)" : status === "logged_out" ? "var(--warning-soft)" : "var(--danger-soft)",
                                color: status === "open" ? "var(--success)" : status === "waiting_qr" || status === "connecting" ? "var(--warning)" : status === "logged_out" ? "var(--warning)" : "var(--danger)",
                                border: "1px solid",
                                borderColor: status === "open" ? "rgba(34,197,94,0.25)" : status === "waiting_qr" || status === "connecting" ? "rgba(245,158,11,0.25)" : status === "logged_out" ? "rgba(245,158,11,0.25)" : "rgba(239,68,68,0.25)",
                            }}>
                                <span style={{ width: 7, height: 7, borderRadius: "50%", flexShrink: 0, display: "inline-block", background: status === "open" ? "var(--success)" : status === "waiting_qr" || status === "connecting" ? "var(--warning)" : status === "logged_out" ? "var(--warning)" : "var(--danger)" }} />
                                {status === "open" ? "Online" : status === "waiting_qr" ? "QR" : status === "waiting_pairing" ? "Código" : status === "connecting" ? "..." : status === "logged_out" ? "Expirado" : status === "offline" ? "Offline" : "—"}
                            </span>
                        )}
                        <div style={{ position: "relative" }}>
                            <button
                                onClick={() => setShowUserMenu(m => !m)}
                                style={{ width: 36, height: 36, borderRadius: "50%", border: "2px solid rgba(59,130,246,0.4)", background: "var(--bg-raised)", cursor: "pointer", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", padding: 0, flexShrink: 0 }}
                            >
                                {currentUser?.avatar
                                    ? <img src={`data:image/jpeg;base64,${currentUser.avatar}`} style={{ width: "100%", height: "100%", objectFit: "cover" }} alt="avatar" />
                                    : <span style={{ fontSize: 15, fontWeight: 700, color: "var(--accent)" }}>{currentUser?.name?.[0]?.toUpperCase() || "U"}</span>
                                }
                            </button>
                            {showUserMenu && (
                                <>
                                    <div style={{ position: "fixed", inset: 0, zIndex: 199 }} onClick={() => setShowUserMenu(false)} />
                                    <div className="fade-up" style={{ position: "absolute", right: 0, top: "calc(100% + 8px)", background: "var(--card)", border: "1px solid var(--border)", borderRadius: "var(--r-md)", padding: "8px 0", minWidth: 190, boxShadow: "var(--shadow-2)", zIndex: 200 }}>
                                        <div style={{ padding: "8px 16px 10px", borderBottom: "1px solid var(--border)", marginBottom: 4 }}>
                                            <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>{currentUser?.name}</div>
                                            <div style={{ fontSize: 11, color: "var(--text-2)", marginTop: 2 }}>{currentUser?.email}</div>
                                        </div>
                                        {!isStandalone && (
                                            <button className="tm-row" onClick={() => { setShowUserMenu(false); handleInstall(); }} style={{ width: "100%", padding: "10px 16px", background: "none", border: "none", cursor: "pointer", color: "var(--text)", fontSize: 13, textAlign: "left", display: "flex", alignItems: "center", gap: 10 }}>
                                                <Download size={16} strokeWidth={2} color="var(--text-2)" /> <span>Instalar App</span>
                                            </button>
                                        )}
                                        <button className="tm-row" onClick={() => { setShowUserMenu(false); setProfileName(currentUser?.name || ""); setProfileAvatarFile(null); setProfileCurrentPwd(""); setProfileNewPwd(""); setProfileConfirmPwd(""); setShowProfileModal(true); }} style={{ width: "100%", padding: "10px 16px", background: "none", border: "none", cursor: "pointer", color: "var(--text)", fontSize: 13, textAlign: "left", display: "flex", alignItems: "center", gap: 10 }}>
                                            <User size={16} strokeWidth={2} color="var(--text-2)" /> <span>Perfil</span>
                                        </button>
                                        <button className="tm-row" onClick={() => { setShowUserMenu(false); handleLogout(); }} style={{ width: "100%", padding: "10px 16px", background: "none", border: "none", cursor: "pointer", color: "var(--danger)", fontSize: 13, textAlign: "left", display: "flex", alignItems: "center", gap: 10 }}>
                                            <LogOut size={16} strokeWidth={2} /> <span>Sair</span>
                                        </button>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                </header>

                {/* ── Portal do ALUNO ── */}
                {currentUser?.role === "ALUNO" && (
                    <div style={{ minHeight: "calc(100vh - 72px)" }}>
                        <div style={{ ...S.page, paddingTop: 8 }}>

                            {/* ── WOD / Programação ── */}
                            {alunoTab === "wod" && (
                                <>
                                    {/* Hero do dia */}
                                    <div style={{ background: "radial-gradient(ellipse at top left, rgba(59,130,246,0.16), transparent 65%) var(--card)", border: "1px solid rgba(59,130,246,0.25)", borderRadius: 16, padding: "24px 20px", marginBottom: 16, position: "relative", overflow: "hidden" }}>
                                        <div style={{ position: "absolute", top: -30, right: -30, width: 120, height: 120, borderRadius: "50%", background: "rgba(59,130,246,0.06)" }} />
                                        <div style={{ fontSize: 12, color: "var(--accent)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6 }}>
                                            {new Date().toLocaleDateString("pt-BR", { weekday: "long" })}
                                        </div>
                                        <div style={{ fontSize: 28, fontWeight: 900, color: "var(--text)", marginBottom: 4 }}>
                                            {new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })}
                                        </div>
                                        <div style={{ fontSize: 13, color: "var(--text-2)", display: "inline-flex", alignItems: "center", gap: 5 }}>
                                            {currentUser?.boxName ? <><MapPin size={13} strokeWidth={2} color="var(--accent)" /> {currentUser.boxName}</> : "Treino do dia"}
                                        </div>
                                    </div>

                                    {/* WOD de hoje */}
                                    {(() => {
                                        const today = new Date().toISOString().slice(0, 10);
                                        const todayProgram = boxPrograms.find(p => p.date?.slice(0, 10) === today);
                                        if (boxDataLoading) return <div className="tm-card fade-up" style={{ ...S.card, textAlign: "center", padding: 40, color: "var(--text-2)" }}>⏳ Carregando...</div>;
                                        if (todayProgram) return (
                                            <div className="tm-card fade-up" style={{ ...S.card, border: "1px solid rgba(59,130,246,0.25)", background: "var(--card)" }}>
                                                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                                                    <div style={{ width: 40, height: 40, borderRadius: "var(--r-md)", background: "var(--accent-soft)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>🏋️</div>
                                                    <div>
                                                        <div style={{ fontSize: 18, fontWeight: 800, color: "var(--text)" }}>{todayProgram.title}</div>
                                                        <div style={{ fontSize: 11, color: "var(--text-2)" }}>Postado por {todayProgram.user?.name || "Admin"}</div>
                                                    </div>
                                                </div>
                                                {todayProgram.hasImage && (
                                                    <img
                                                        src={`${API}/box/programs/${todayProgram.id}/image?token=${token}`}
                                                        alt="WOD do dia"
                                                        style={{ width: "100%", borderRadius: "var(--r-md)", marginBottom: 12 }}
                                                        onError={(e) => { e.target.style.display = "none"; }}
                                                    />
                                                )}
                                                {todayProgram.content && todayProgram.content !== "WOD do Dia" && (
                                                    <div style={{ background: "var(--bg-raised)", borderRadius: "var(--r-md)", padding: "16px 14px", whiteSpace: "pre-wrap", fontSize: 14, color: "var(--text-2)", lineHeight: 1.7, fontFamily: "monospace", borderLeft: "3px solid var(--accent)" }}>
                                                        {todayProgram.content}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                        return (
                                            <div className="tm-card fade-up" style={{ ...S.card, textAlign: "center", padding: "40px 20px" }}>
                                                <div style={{ fontSize: 48, marginBottom: 12 }}>😴</div>
                                                <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text)", marginBottom: 6 }}>Nenhum WOD postado hoje</div>
                                                <div style={{ fontSize: 13, color: "var(--text-2)" }}>O treino do dia será publicado em breve pelo coach.</div>
                                            </div>
                                        );
                                    })()}

                                    {/* Dias anteriores */}
                                    {boxPrograms.filter(p => p.date?.slice(0, 10) !== new Date().toISOString().slice(0, 10)).length > 0 && (
                                        <div style={{ marginTop: 8 }}>
                                            <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-2)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 12 }}>Últimos treinos</div>
                                            {boxPrograms.filter(p => p.date?.slice(0, 10) !== new Date().toISOString().slice(0, 10)).slice(0, 7).map(p => (
                                                <details key={p.id} className="tm-card fade-up" style={{ ...S.card, marginBottom: 8, cursor: "pointer" }}>
                                                    <summary style={{ display: "flex", alignItems: "center", justifyContent: "space-between", listStyle: "none" }}>
                                                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                                            <div style={{ width: 32, height: 32, borderRadius: 8, background: "rgba(161,161,170,0.12)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, color: "var(--text-2)" }}>
                                                                {new Date(p.date + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit" })}
                                                            </div>
                                                            <div>
                                                                <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text)" }}>{p.title}</div>
                                                                <div style={{ fontSize: 11, color: "var(--text-2)" }}>{new Date(p.date + "T12:00:00").toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "short" })}</div>
                                                            </div>
                                                        </div>
                                                        <span style={{ fontSize: 16, color: "var(--text-2)" }}>▸</span>
                                                    </summary>
                                                    <div style={{ background: "var(--bg-raised)", borderRadius: 8, padding: "12px 14px", marginTop: 10 }}>
                                                        {p.hasImage && (
                                                            <img src={`${API}/box/programs/${p.id}/image?token=${token}`} alt={p.title} style={{ width: "100%", borderRadius: 8, marginBottom: 10 }} onError={(e) => { e.target.style.display = "none"; }} />
                                                        )}
                                                        {p.content && p.content !== "WOD do Dia" && (
                                                            <div style={{ whiteSpace: "pre-wrap", fontSize: 13, color: "var(--text-2)", lineHeight: 1.6, fontFamily: "monospace", borderLeft: "3px solid var(--border)", paddingLeft: 12 }}>
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
                                    <div className="tm-card fade-up" style={{ ...S.card, padding: "16px 14px" }}>
                                        <h2 style={{ ...S.cardTitle, margin: "0 0 14px", fontSize: 18 }}><Calendar size={18} strokeWidth={2} color="var(--accent)" /> Horários das Aulas</h2>

                                        {/* Seletor de dia */}
                                        <div style={{ display: "flex", gap: 4, marginBottom: 18, overflowX: "auto" }}>
                                            {[1, 2, 3, 4, 5, 6, 0].map(d => (
                                                <button key={d} onClick={() => setScheduleDay(d)} style={{
                                                    flex: 1, minWidth: 42, padding: "10px 4px", borderRadius: "var(--r-md)", border: "1px solid",
                                                    background: scheduleDay === d ? "var(--accent-soft)" : "var(--bg-raised)",
                                                    borderColor: scheduleDay === d ? "var(--accent)" : "var(--border)",
                                                    color: scheduleDay === d ? "var(--accent)" : "var(--text-2)",
                                                    fontWeight: scheduleDay === d ? 800 : 500, fontSize: 11, cursor: "pointer",
                                                    display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
                                                }}>
                                                    <span style={{ fontSize: 10 }}>{["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"][d]}</span>
                                                    {d === new Date().getDay() && <span style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--accent)" }} />}
                                                </button>
                                            ))}
                                        </div>

                                        {/* Aulas do dia */}
                                        {(() => {
                                            const daySchedules = boxSchedules.filter(s => s.dayOfWeek === scheduleDay);
                                            if (boxDataLoading) return <div style={{ textAlign: "center", color: "var(--text-2)", padding: 30 }}>⏳ Carregando...</div>;
                                            if (daySchedules.length === 0) return (
                                                <div style={{ textAlign: "center", padding: "30px 20px" }}>
                                                    <div style={{ fontSize: 36, marginBottom: 8 }}>🚫</div>
                                                    <div style={{ fontSize: 14, color: "var(--text-2)" }}>Nenhuma aula neste dia</div>
                                                </div>
                                            );
                                            return (
                                                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                                                    {daySchedules.map(s => (
                                                        <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 14, background: "var(--bg-raised)", borderRadius: 12, padding: "14px 16px", border: "1px solid var(--border)" }}>
                                                            <div style={{ minWidth: 62, textAlign: "center" }}>
                                                                <div style={{ fontSize: 16, fontWeight: 800, color: "var(--accent)" }}>{s.startTime}</div>
                                                                <div style={{ fontSize: 10, color: "var(--text-2)" }}>{s.endTime}</div>
                                                            </div>
                                                            <div style={{ width: 1, height: 36, background: "var(--border)" }} />
                                                            <div style={{ flex: 1 }}>
                                                                <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text)" }}>{s.className}</div>
                                                                {s.coach && <div style={{ fontSize: 12, color: "var(--text-2)", marginTop: 2, display: "inline-flex", alignItems: "center", gap: 5 }}><Medal size={12} strokeWidth={2} color="var(--gold)" /> {s.coach}</div>}
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
                                        <h2 style={{ fontSize: 20, fontWeight: 800, letterSpacing: "-0.02em", color: "var(--text)", margin: "0 0 4px", display: "flex", alignItems: "center", gap: 8 }}><CreditCard size={20} strokeWidth={2} color="var(--accent)" /> Planos</h2>
                                        <p style={{ fontSize: 13, color: "var(--text-2)", margin: 0 }}>Escolha o plano ideal para você</p>
                                    </div>

                                    {boxDataLoading && <div style={{ textAlign: "center", color: "var(--text-2)", padding: 40 }}>⏳ Carregando...</div>}

                                    {!boxDataLoading && boxPlans.length === 0 && (
                                        <div className="tm-card fade-up" style={{ ...S.card, textAlign: "center", padding: "40px 20px" }}>
                                            <div style={{ fontSize: 48, marginBottom: 12 }}>💰</div>
                                            <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text)", marginBottom: 6 }}>Planos em breve</div>
                                            <div style={{ fontSize: 13, color: "var(--text-2)" }}>Os planos serão publicados aqui pelo seu box.</div>
                                        </div>
                                    )}

                                    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                                        {boxPlans.map(plan => (
                                            <div key={plan.id} style={{
                                                background: plan.highlighted ? "radial-gradient(ellipse at top left, rgba(59,130,246,0.14), transparent 65%) var(--card)" : "var(--card)",
                                                border: `2px solid ${plan.highlighted ? "var(--accent)" : "var(--border)"}`,
                                                borderRadius: 16, padding: "24px 20px", position: "relative", overflow: "hidden",
                                            }}>
                                                {plan.highlighted && (
                                                    <div style={{ position: "absolute", top: 12, right: -28, background: "var(--gold)", color: "#09090B", fontSize: 10, fontWeight: 800, padding: "3px 32px", transform: "rotate(45deg)", textTransform: "uppercase" }}>Popular</div>
                                                )}
                                                <div style={{ fontSize: 18, fontWeight: 800, color: "var(--text)", marginBottom: 4 }}>{plan.name}</div>
                                                {plan.description && <div style={{ fontSize: 13, color: "var(--text-2)", marginBottom: 12 }}>{plan.description}</div>}
                                                <div style={{ display: "flex", alignItems: "baseline", gap: 4, marginBottom: 16 }}>
                                                    <span style={{ fontSize: 12, color: "var(--text-2)" }}>R$</span>
                                                    <span style={{ fontSize: 36, fontWeight: 900, color: plan.highlighted ? "var(--accent)" : "var(--text)" }}>{plan.price.toFixed(0)}</span>
                                                    <span style={{ fontSize: 13, color: "var(--text-2)" }}>/{plan.period}</span>
                                                </div>
                                                {plan.features && (() => {
                                                    try {
                                                        const feats = JSON.parse(plan.features);
                                                        return (
                                                            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                                                                {feats.map((f, i) => (
                                                                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--text-2)" }}>
                                                                        <span style={{ color: "var(--accent)", fontSize: 14, flexShrink: 0 }}>✓</span> {f}
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

                        {/* ── Bottom Nav do ALUNO (barra fixa) ── */}
                        <nav className="tm-dock" style={{ position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 200 }}>
                            <div className="tm-dock-inner">
                                {[
                                    { key: "wod", Icon: Dumbbell, label: "WOD" },
                                    { key: "horarios", Icon: Calendar, label: "Horários" },
                                    { key: "planos", Icon: CreditCard, label: "Planos" },
                                ].map(({ key, Icon, label }) => (
                                    <button key={key} className="tm-nav-item" onClick={() => setAlunoTab(key)} style={{
                                        flex: 1, display: "flex", flexDirection: "column", alignItems: "center",
                                        gap: 3, padding: "8px 0 7px", border: "none", borderRadius: "var(--r-md)",
                                        cursor: "pointer",
                                        background: alunoTab === key ? "var(--accent-soft)" : "transparent",
                                        color: alunoTab === key ? "var(--accent)" : "var(--text-3)",
                                    }}>
                                        <Icon size={20} strokeWidth={2} />
                                        <span style={{ fontSize: 10, fontWeight: alunoTab === key ? 700 : 500, letterSpacing: "0.02em" }}>{label}</span>
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
                            <div className="fade-up" style={{ width: "100%", maxWidth: 400, background: "var(--card)", border: "1px solid var(--border)", borderRadius: "var(--r-lg)", padding: "32px 28px", textAlign: "center", boxShadow: "var(--shadow-2)" }}>
                                <div style={{ width: 64, height: 64, borderRadius: "50%", background: "var(--accent-soft)", border: "2px solid rgba(59,130,246,0.3)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px" }}><KeyRound size={28} strokeWidth={2} color="var(--accent)" /></div>
                                <div style={{ fontSize: 20, fontWeight: 800, color: "var(--text)", marginBottom: 6 }}>Código de Pareamento</div>
                                <div style={{ fontSize: 13, color: "var(--text-2)", marginBottom: 24 }}>Válido por alguns minutos</div>
                                <div style={{ background: "var(--bg-raised)", border: "2px solid var(--accent)", borderRadius: "var(--r-lg)", padding: "18px 32px", display: "inline-block", marginBottom: 24, boxShadow: "0 0 32px var(--accent-glow)" }}>
                                    <span style={{ fontSize: 40, fontWeight: 900, letterSpacing: 10, color: "var(--accent)", fontFamily: "monospace" }}>{pairingCode}</span>
                                </div>
                                <div style={{ background: "var(--bg-raised)", border: "1px solid var(--border)", borderRadius: 12, padding: "16px 18px", textAlign: "left", marginBottom: 20 }}>
                                    <div style={{ fontSize: 12, color: "var(--text-2)", fontWeight: 700, marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.05em" }}>Como digitar no WhatsApp</div>
                                    {[
                                        ["1", "Abra o WhatsApp no seu celular"],
                                        ["2", "Toque em ⋮ Menu → Aparelhos conectados"],
                                        ["3", "Toque em Conectar aparelho"],
                                        ["4", "Escolha Usar número de telefone"],
                                        ["5", "Digite o código acima"],
                                    ].map(([n, t]) => (
                                        <div key={n} style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 8 }}>
                                            <span style={{ width: 22, height: 22, borderRadius: "50%", background: "var(--accent-soft)", border: "1px solid rgba(59,130,246,0.25)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: "var(--accent)", flexShrink: 0 }}>{n}</span>
                                            <span style={{ fontSize: 13, color: "var(--text-2)", lineHeight: 1.5 }}>{t}</span>
                                        </div>
                                    ))}
                                </div>
                                <div style={{ background: "rgba(245,158,11,0.07)", border: "1px solid rgba(245,158,11,0.2)", borderRadius: "var(--r-md)", padding: "10px 14px", fontSize: 12, color: "var(--warning)", lineHeight: 1.5, marginBottom: 20 }}>
                                    ⚠️ Não feche nem atualize esta página até o pareamento concluir.
                                </div>
                                <button onClick={disconnect} className="tm-btn tm-btn-danger" style={{ width: "100%", padding: "11px", borderRadius: "var(--r-md)", border: "1px solid rgba(239,68,68,0.25)", background: "var(--danger-soft)", color: "var(--danger)", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>Cancelar</button>
                            </div>
                        )}

                        {/* ── QR CODE ── */}
                        {qr && !pairingCode && (
                            <div className="fade-up" style={{ width: "100%", maxWidth: 400, background: "var(--card)", border: "1px solid var(--border)", borderRadius: "var(--r-lg)", padding: "32px 28px", textAlign: "center", boxShadow: "var(--shadow-2)" }}>
                                <div style={{ fontSize: 20, fontWeight: 800, color: "var(--text)", marginBottom: 6 }}>Escanear QR Code</div>
                                <div style={{ fontSize: 13, color: "var(--text-2)", marginBottom: 20 }}>Abra o WhatsApp e escaneie o código abaixo</div>
                                <div style={{ background: "#fff", borderRadius: 16, padding: 16, display: "inline-block", marginBottom: 20, boxShadow: "0 4px 24px rgba(0,0,0,0.4)" }}>
                                    <img src={qr} alt="QR Code" style={{ width: 220, height: 220, display: "block" }} />
                                </div>
                                <div style={{ background: "var(--bg-raised)", border: "1px solid var(--border)", borderRadius: 12, padding: "12px 16px", textAlign: "left", marginBottom: 24, fontSize: 12, color: "var(--text-2)", lineHeight: 1.6 }}>
                                    No WhatsApp: <strong style={{ color: "var(--text)" }}>Menu ⋮</strong> → <strong style={{ color: "var(--text)" }}>Aparelhos conectados</strong> → <strong style={{ color: "var(--text)" }}>Conectar aparelho</strong>
                                </div>
                                <div style={{ borderTop: "1px solid var(--border)", paddingTop: 20 }}>
                                    <div style={{ fontSize: 13, color: "var(--text-2)", marginBottom: 12 }}>Prefere usar código de pareamento?</div>
                                    <div style={{ display: "flex", gap: 8 }}>
                                        <input
                                            type="tel"
                                            placeholder="+55 (11) 99999-0000"
                                            value={formatPhone(pairingPhone)}
                                            onChange={(e) => setPairingPhone(e.target.value.replace(/\D/g, ""))}
                                            style={{ flex: 1, padding: "10px 14px", borderRadius: "var(--r-md)", border: "1px solid var(--border)", background: "var(--bg-raised)", color: "var(--text)", fontSize: 14, outline: "none" }}
                                        />
                                        <button onClick={requestPairingCode} disabled={pairingLoading} className="tm-btn tm-btn-primary" style={{ padding: "10px 16px", borderRadius: "var(--r-md)", border: "none", background: "var(--accent)", color: "#fff", fontWeight: 700, fontSize: 13, cursor: pairingLoading ? "not-allowed" : "pointer", opacity: pairingLoading ? 0.7 : 1, whiteSpace: "nowrap" }}>
                                            {pairingLoading ? "..." : "Gerar código"}
                                        </button>
                                    </div>
                                    <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 8 }}>Ex: +55 (11) 98765-4321</div>
                                </div>
                            </div>
                        )}

                        {/* ── DESCONECTADO / TELA INICIAL ── */}
                        {!qr && !pairingCode && (
                            <div className="fade-up" style={{ width: "100%", maxWidth: 400, background: "var(--card)", border: "1px solid var(--border)", borderRadius: "var(--r-lg)", padding: "36px 28px", textAlign: "center", boxShadow: "var(--shadow-2)" }}>
                                <div style={{ width: 72, height: 72, borderRadius: "50%", background: "var(--accent-soft)", border: "2px solid rgba(59,130,246,0.25)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px" }}><Smartphone size={32} strokeWidth={2} color="var(--accent)" /></div>
                                <div style={{ fontSize: 22, fontWeight: 800, color: "var(--text)", marginBottom: 8 }}>Conectar WhatsApp</div>
                                <div style={{ fontSize: 14, color: "var(--text-2)", marginBottom: 28, lineHeight: 1.5 }}>Digite seu número para receber um código de pareamento</div>

                                <div style={{ textAlign: "left", marginBottom: 8 }}>
                                    <label style={{ fontSize: 12, color: "var(--text-2)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: 8 }}>Número do WhatsApp</label>
                                    <input
                                        type="tel"
                                        placeholder="+55 (11) 99999-0000"
                                        value={formatPhone(pairingPhone)}
                                        onChange={(e) => setPairingPhone(e.target.value.replace(/\D/g, ""))}
                                        style={{ width: "100%", padding: "13px 16px", borderRadius: 12, border: "1px solid var(--border)", background: "var(--bg-raised)", color: "var(--text)", fontSize: 16, outline: "none", boxSizing: "border-box", transition: "border-color 0.2s" }}
                                        onFocus={(e) => e.target.style.borderColor = "var(--accent)"}
                                        onBlur={(e) => e.target.style.borderColor = "var(--border)"}
                                    />
                                    <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 6 }}>Formato com DDD: +55 (11) 98765-4321</div>
                                </div>

                                <button
                                    onClick={requestPairingCode}
                                    disabled={pairingLoading || pairingPhone.replace(/\D/g, "").length < 12}
                                    style={{ width: "100%", padding: "14px", borderRadius: 12, border: "none", background: pairingPhone.replace(/\D/g, "").length >= 12 ? "var(--accent)" : "var(--bg-raised)", color: pairingPhone.replace(/\D/g, "").length >= 12 ? "#fff" : "var(--text-3)", fontWeight: 800, fontSize: 16, cursor: (pairingLoading || pairingPhone.replace(/\D/g, "").length < 12) ? "not-allowed" : "pointer", marginTop: 16, transition: "all 0.2s" }}
                                >
                                    {pairingLoading ? "Aguardando código..." : "Gerar código de pareamento"}
                                </button>

                                <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "20px 0" }}>
                                    <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
                                    <span style={{ fontSize: 12, color: "var(--text-3)" }}>ou</span>
                                    <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
                                </div>

                                <button onClick={resetSession} style={{ width: "100%", padding: "12px", borderRadius: 12, border: "1px solid var(--border)", background: "transparent", color: "var(--text-2)", fontWeight: 600, fontSize: 14, cursor: "pointer" }}>Usar QR Code</button>

                                <div style={{ marginTop: 24, background: "var(--bg-raised)", border: "1px solid var(--border)", borderRadius: 12, padding: "14px 16px", textAlign: "left" }}>
                                    <div style={{ fontSize: 11, color: "var(--text-2)", fontWeight: 700, marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.05em" }}>Como funciona</div>
                                    {[
                                        ["📱", "Digite seu número com DDD"],
                                        ["🔑", "Um código de 8 dígitos será gerado"],
                                        ["💬", "Digite-o no WhatsApp → Aparelhos conectados"],
                                        ["✅", "Pronto! Bot conectado e pronto para usar"],
                                    ].map(([icon, text]) => (
                                        <div key={text} style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 8 }}>
                                            <span style={{ fontSize: 16 }}>{icon}</span>
                                            <span style={{ fontSize: 12, color: "var(--text-2)" }}>{text}</span>
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
                                        <span style={{ ...S.statNum, color: "var(--gold)" }}>{photosReady}</span>
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
                                        <span style={{ ...S.statNum, fontSize: 15, color: sentToday[today] ? "var(--success)" : "var(--text-3)", wordBreak: "break-word", lineHeight: 1.2 }}>
                                            {sentToday[today]
                                                ? new Date(sentToday[today].sentAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
                                                : "Pendente"}
                                        </span>
                                        <span style={S.statLabel}>Hoje</span>
                                    </div>
                                </div>

                                {/* ── CONFIG ── */}
                                <div className="tm-card fade-up" style={S.card}>
                                    <h2 style={S.cardTitle}><Settings size={17} strokeWidth={2} color="var(--accent)" /> Configurações</h2>

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
                                            <button className="tm-btn tm-btn-ghost" style={{ ...S.btnIcon, flexShrink: 0 }} onClick={loadGroups} title="Atualizar grupos">
                                                <RefreshCw size={15} strokeWidth={2} />
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
                                        📅 Envio automático <strong>todos os dias às {config.scheduleTime || "05:00"}</strong>
                                        <br />
                                        Primeiro a mensagem de texto, depois a foto do dia.
                                    </div>

                                    <button className="tm-btn tm-btn-primary" style={S.btnPrimary} onClick={saveConfig}>
                                        <Save size={16} strokeWidth={2} /> Salvar Configurações
                                    </button>
                                </div>

                                {/* ── FOTOS POR DIA ── */}
                                <div className="tm-card fade-up" style={S.card}>
                                    <h2 style={S.cardTitle}><Camera size={17} strokeWidth={2} color="var(--accent)" /> Fotos por Dia da Semana</h2>
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
                                                        borderColor: !isEnabled ? "var(--border)" : sentInfo ? "var(--success)" : isToday ? "var(--accent)" : "var(--border)",
                                                        boxShadow: sentInfo
                                                            ? "0 0 14px rgba(34,197,94,0.25)"
                                                            : isToday && isEnabled
                                                                ? "0 0 12px rgba(59,130,246,0.2)"
                                                                : "none",
                                                        opacity: isEnabled ? 1 : 0.55,
                                                    }}
                                                >
                                                    {sentInfo && (
                                                        <span style={{ ...S.todayTag, background: "rgba(34,197,94,0.18)", color: "var(--success)" }}>✅ ENVIADO {sentTime}</span>
                                                    )}
                                                    {!sentInfo && isToday && isEnabled && <span style={S.todayTag}>HOJE</span>}
                                                    {!isEnabled && (
                                                        <span style={{ ...S.todayTag, background: "var(--border)", color: "var(--text-2)" }}>DESCANSO</span>
                                                    )}
                                                    <div style={S.dayHeader}>
                                                        <span style={{ fontSize: 20 }}>{DAY_ICONS[day]}</span>
                                                        <h3 style={S.dayName}>{name}</h3>
                                                    </div>

                                                    <div style={{ ...S.photoBox, position: "relative" }}>
                                                        {info?.hasPhoto && !sentInfo ? (
                                                            <>
                                                                <img
                                                                    src={info.dataUrl}
                                                                    alt={name}
                                                                    style={{ ...S.photoImg, cursor: "pointer" }}
                                                                    onClick={() => setPreviewDay(day)}
                                                                    title="Clique para preview"
                                                                    onError={(e) => { e.target.style.display = "none"; }}
                                                                />
                                                                {artDataByDay[day] && (
                                                                    <button
                                                                        onClick={() => openArtCreator(day)}
                                                                        title="Editar arte"
                                                                        style={{
                                                                            position: "absolute", top: 5, right: 5, width: 22, height: 22,
                                                                            borderRadius: "50%", background: "rgba(15,15,17,0.65)",
                                                                            border: "1px solid rgba(255,255,255,0.25)", color: "#fff",
                                                                            cursor: "pointer", display: "flex", alignItems: "center",
                                                                            justifyContent: "center", padding: 0,
                                                                        }}
                                                                    >
                                                                        <Pencil size={11} strokeWidth={2} />
                                                                    </button>
                                                                )}
                                                            </>
                                                        ) : (
                                                            <div style={S.photoEmpty}>
                                                                <span style={{ fontSize: 28, opacity: 0.4 }}>
                                                                    {sentInfo ? "✅" : "📷"}
                                                                </span>
                                                                <span style={{ fontSize: 11, color: sentInfo ? "var(--success)" : "var(--text-3)", marginTop: 4, textAlign: "center" }}>
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
                                                                    if (e.target.files[0]) {
                                                                        uploadPhoto(day, e.target.files[0]);
                                                                        setArtDataByDay((prev) => { if (!prev[day]) return prev; const next = { ...prev }; delete next[day]; return next; });
                                                                    }
                                                                    e.target.value = "";
                                                                }}
                                                            />
                                                            <button
                                                                className="tm-btn" style={S.btnUpload}
                                                                disabled={uploading === day || !!sentInfo}
                                                                onClick={() => fileRefs.current[day]?.click()}
                                                            >
                                                                {uploading === day ? "..." : <Upload size={13} strokeWidth={2} />}{" "}
                                                                {info?.hasPhoto ? "Trocar" : "Upload"}
                                                            </button>
                                                            {info?.hasPhoto && (
                                                                <button
                                                                    className="tm-btn tm-btn-danger" style={S.btnDel}
                                                                    disabled={!!sentInfo}
                                                                    onClick={() => deletePhoto(day)}
                                                                >
                                                                    <Trash2 size={13} strokeWidth={2} />
                                                                </button>
                                                            )}
                                                        </div>
                                                        <button
                                                            className="tm-btn"
                                                            style={{
                                                                marginTop: 6, width: "100%", padding: "5px 0",
                                                                background: "var(--accent-soft)", border: "1px solid rgba(59,130,246,0.25)",
                                                                borderRadius: "var(--r-sm)", color: "var(--accent)",
                                                                fontSize: 11, fontWeight: 600, cursor: "pointer",
                                                                display: "flex", alignItems: "center", justifyContent: "center", gap: 4,
                                                            }}
                                                            disabled={uploading === day || !!sentInfo}
                                                            onClick={() => openArtCreator(day)}
                                                        >
                                                            <Sparkles size={12} strokeWidth={2} /> Criar arte
                                                        </button>
                                                        <button
                                                            style={{
                                                                marginTop: 6,
                                                                width: "100%",
                                                                padding: "5px 0",
                                                                background: isEnabled ? "rgba(239,68,68,0.08)" : "rgba(34,197,94,0.1)",
                                                                border: isEnabled ? "1px solid rgba(239,68,68,0.25)" : "1px solid rgba(34,197,94,0.25)",
                                                                borderRadius: "var(--r-sm)",
                                                                color: isEnabled ? "var(--danger)" : "var(--success)",
                                                                fontSize: 11,
                                                                cursor: sentInfo ? "not-allowed" : "pointer",
                                                                display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 5,
                                                            }}
                                                            disabled={!!sentInfo}
                                                            onClick={() => toggleDay(day)}
                                                        >
                                                            {isEnabled ? <><Pause size={11} strokeWidth={2} /> Descanso</> : <><Play size={11} strokeWidth={2} /> Ativar</>}
                                                        </button>
                                                    </div>
                                                </div>
                                            );
                                        })}

                                        {/* ── Resumo da Semana card ── */}
                                        <div
                                            style={{
                                                ...S.dayCard,
                                                borderColor: photosReady === 7 ? "var(--success)" : "var(--border-hover)",
                                                background: "linear-gradient(135deg, var(--card) 0%, var(--card-hover) 100%)",
                                                display: "flex",
                                                flexDirection: "column",
                                                alignItems: "center",
                                                justifyContent: "center",
                                                gap: 6,
                                            }}
                                        >
                                            <span style={{ fontSize: 26 }}>📊</span>
                                            <h3 style={{ ...S.dayName, color: "var(--accent)", fontSize: 12 }}>Resumo</h3>
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
                                                    color: photosReady === 7 ? "var(--success)" : "var(--accent)",
                                                }}>
                                                    {photosReady}/7
                                                </span>
                                                <span style={{ fontSize: 10, color: "var(--text-3)", textTransform: "uppercase" }}>
                                                    fotos prontas
                                                </span>
                                            </div>
                                            <div style={{
                                                width: "80%",
                                                height: 4,
                                                background: "var(--border)",
                                                borderRadius: 2,
                                                overflow: "hidden",
                                                marginTop: 4,
                                            }}>
                                                <div style={{
                                                    width: `${(photosReady / 7) * 100}%`,
                                                    height: "100%",
                                                    background: photosReady === 7 ? "var(--success)" : "var(--accent)",
                                                    borderRadius: 2,
                                                    transition: "width 0.3s ease",
                                                }} />
                                            </div>
                                            <span style={{
                                                fontSize: 10,
                                                color: photosReady === 7 ? "var(--success)" : "var(--text-3)",
                                                marginTop: 2,
                                            }}>
                                                {photosReady === 7 ? "✅ Semana completa!" : `Faltam ${7 - photosReady} fotos`}
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                {/* ── TESTAR ENVIO ── */}
                                <div className="tm-card fade-up" style={S.card}>
                                    <h2 style={S.cardTitle}><Zap size={17} strokeWidth={2} color="var(--gold)" /> Testar Envio</h2>
                                    <p style={S.cardSub}>
                                        Envia agora a mensagem + foto do dia atual para o grupo configurado.
                                    </p>
                                    {sentToday[today] ? (
                                        <div style={{ background: "rgba(34,197,94,0.07)", border: "1px solid rgba(34,197,94,0.2)", borderRadius: "var(--r-md)", padding: "12px 16px", display: "flex", alignItems: "center", gap: 10 }}>
                                            <span style={{ fontSize: 22 }}>✅</span>
                                            <div>
                                                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--success)" }}>Já enviado hoje às {new Date(sentToday[today].sentAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</div>
                                                <div style={{ fontSize: 11, color: "var(--text-2)", marginTop: 2 }}>O envio de hoje ({DAYS[today]}) já foi realizado. Nenhum reenvio permitido.</div>
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
                                                ? "Enviando..."
                                                : <><Send size={16} strokeWidth={2} /> Enviar Agora ({DAYS[today]})</>}
                                        </button>
                                    )}
                                </div>

                                {/* ── SESSÃO ── */}
                                <div className="tm-card fade-up" style={S.card}>
                                    <h2 style={S.cardTitle}><Power size={17} strokeWidth={2} color="var(--accent)" /> Sessão</h2>
                                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                                        <button className="tm-btn tm-btn-danger" style={S.btnDanger} onClick={disconnect}>
                                            Desconectar
                                        </button>
                                        <button className="tm-btn" style={S.btnWarn} onClick={resetSession}>
                                            Resetar Sessão
                                        </button>
                                    </div>
                                </div>
                            </>
                        )}


                        {/* ══════════ ABA SOLICITAÇÕES DE ACESSO (admin) ══════════ */}
                        {tab === "requests" && currentUser?.role === "ADMIN" && (
                            <div className="tm-card fade-up" style={S.card}>
                                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
                                    <h2 style={{ ...S.cardTitle, marginBottom: 0 }}><Bell size={17} strokeWidth={2} color="var(--accent)" /> Solicitações de Acesso {pendingCount > 0 && <span style={{ background: "var(--danger)", color: "#fff", borderRadius: "var(--r-full)", fontSize: 11, padding: "2px 7px", marginLeft: 8, verticalAlign: "middle" }}>{pendingCount}</span>}</h2>
                                    <button className="tm-btn tm-btn-ghost" onClick={loadAccessRequests} style={S.btnIcon} disabled={reqsLoading}>{reqsLoading ? "..." : <><RefreshCw size={14} strokeWidth={2} /> Atualizar</>}</button>
                                </div>

                                {/* Modal credenciais geradas */}
                                {approvedCred && (
                                    <div style={{ background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.3)", borderRadius: "var(--r-md)", padding: 16, marginBottom: 16 }}>
                                        <div style={{ fontSize: 14, fontWeight: 700, color: "var(--success)", marginBottom: 8 }}>✅ Acesso criado! Envie estas credenciais ao usuário:</div>
                                        <div style={{ fontSize: 13, color: "var(--text)" }}>Email: <strong>{approvedCred.email}</strong></div>
                                        <div style={{ fontSize: 13, color: "var(--text)", marginTop: 4 }}>Senha: <strong>{approvedCred.password}</strong></div>
                                        <button onClick={() => setApprovedCred(null)} className="tm-btn" style={{ marginTop: 10, background: "none", border: "1px solid var(--success)", borderRadius: "var(--r-sm)", padding: "5px 14px", color: "var(--success)", fontSize: 12, cursor: "pointer" }}>Fechar</button>
                                    </div>
                                )}

                                {accessRequests.length === 0 && !reqsLoading ? (
                                    <p style={{ color: "var(--text-2)", textAlign: "center", padding: "24px 0" }}>Nenhuma solicitação encontrada.</p>
                                ) : (
                                    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                                        {accessRequests.map(req => (
                                            <div key={req.id} style={{ background: "var(--bg-raised)", border: `1px solid ${req.status === "pending" ? "rgba(59,130,246,0.3)" : req.status === "approved" ? "var(--success-soft)" : "rgba(239,68,68,0.15)"}`, borderRadius: 12, padding: "14px 16px" }}>
                                                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                                                    <div style={{ flex: 1 }}>
                                                        <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text)" }}>{req.name}</div>
                                                        <div style={{ fontSize: 12, color: "var(--text-2)", marginTop: 2 }}>{req.email}{req.phone ? ` · ${req.phone}` : ""}</div>
                                                        {req.message && <div style={{ fontSize: 12, color: "var(--text-2)", marginTop: 6, fontStyle: "italic" }}>"{req.message}"</div>}
                                                        <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 6 }}>{new Date(req.createdAt).toLocaleString("pt-BR")}</div>
                                                    </div>
                                                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                                                        {req.status === "pending" ? (
                                                            <>
                                                                <button onClick={() => handleApprove(req.id)} style={{ background: "var(--success-soft)", border: "1px solid rgba(34,197,94,0.3)", borderRadius: 8, padding: "6px 14px", color: "var(--success)", fontSize: 12, fontWeight: 700, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 5 }}><Check size={13} strokeWidth={2.5} /> Aprovar</button>
                                                                <button onClick={() => handleDeny(req.id)} style={{ background: "var(--danger-soft)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: 8, padding: "6px 14px", color: "var(--danger)", fontSize: 12, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 5 }}><X size={13} strokeWidth={2.5} /> Rejeitar</button>
                                                            </>
                                                        ) : (
                                                            <span style={{ fontSize: 12, fontWeight: 700, color: req.status === "approved" ? "var(--success)" : "var(--danger)", padding: "4px 10px", border: "1px solid", borderColor: req.status === "approved" ? "rgba(34,197,94,0.3)" : "rgba(239,68,68,0.3)", borderRadius: "var(--r-full)" }}>
                                                                {req.status === "approved" ? "Aprovado" : "Rejeitado"}
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
                                <div className="tm-card fade-up" style={S.card}>
                                    <h2 style={S.cardTitle}><User size={17} strokeWidth={2} color="var(--accent)" /> Novo Usuário</h2>
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
                                            <div style={{ background: "var(--danger-soft)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 8, padding: "8px 12px", color: "var(--danger)", fontSize: 13 }}>
                                                {newUserError}
                                            </div>
                                        )}
                                        <button
                                            type="submit"
                                            disabled={newUserLoading}
                                            className="tm-btn tm-btn-primary" style={{ ...S.btnPrimary, alignSelf: "flex-start", opacity: newUserLoading ? 0.7 : 1 }}
                                        >
                                            {newUserLoading ? "Criando..." : <><Plus size={16} strokeWidth={2} /> Criar Usuário</>}
                                        </button>
                                    </form>
                                </div>

                                {/* Lista de usuários */}
                                <div className="tm-card fade-up" style={S.card}>
                                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                                        <h2 style={{ ...S.cardTitle, margin: 0 }}><Users size={17} strokeWidth={2} color="var(--accent)" /> Usuários Cadastrados</h2>
                                        <button className="tm-btn tm-btn-ghost" style={S.btnIcon} onClick={loadUsers} title="Atualizar"><RefreshCw size={15} strokeWidth={2} /></button>
                                    </div>
                                    {usersLoading ? (
                                        <p style={{ color: "var(--text-2)", fontSize: 14 }}>Carregando...</p>
                                    ) : (
                                        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                                            {users.map((u) => (
                                                <div key={u.id} style={{
                                                    background: u.active ? "rgba(34,197,94,0.04)" : "rgba(239,68,68,0.04)",
                                                    border: `1px solid ${u.active ? "rgba(34,197,94,0.15)" : "rgba(239,68,68,0.15)"}`,
                                                    borderRadius: "var(--r-md)",
                                                    padding: "12px 16px",
                                                    display: "flex",
                                                    alignItems: "center",
                                                    gap: 12,
                                                    flexWrap: "wrap",
                                                }}>
                                                    <div style={{ flex: 1, minWidth: 160 }}>
                                                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                                                            <span style={{ fontWeight: 700, color: "var(--text)", fontSize: 14 }}>{u.name || u.email.split("@")[0]}</span>
                                                            <span style={{
                                                                fontSize: 10,
                                                                padding: "2px 8px",
                                                                borderRadius: "var(--r-full)",
                                                                fontWeight: 600,
                                                                background: u.role === "ADMIN" ? "rgba(245,158,11,0.15)" : u.role === "ALUNO" ? "var(--success-soft)" : "var(--accent-soft)",
                                                                color: u.role === "ADMIN" ? "var(--warning)" : u.role === "ALUNO" ? "var(--success)" : "var(--text-2)",
                                                                textTransform: "uppercase",
                                                            }}>{u.role}</span>
                                                            <span style={{
                                                                fontSize: 10,
                                                                padding: "2px 8px",
                                                                borderRadius: "var(--r-full)",
                                                                fontWeight: 600,
                                                                background: u.active ? "var(--success-soft)" : "var(--danger-soft)",
                                                                color: u.active ? "var(--success)" : "var(--danger)",
                                                            }}>{u.active ? "Ativo" : "Inativo"}</span>
                                                        </div>
                                                        <div style={{ fontSize: 12, color: "var(--text-2)", marginTop: 2 }}>{u.email}</div>
                                                        {u.lastLoginAt && (
                                                            <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 2 }}>
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
                                                                        background: "var(--card)",
                                                                        border: "1px solid var(--border)",
                                                                        borderRadius: "var(--r-sm)",
                                                                        color: "var(--text)",
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
                                                                        borderRadius: "var(--r-sm)",
                                                                        border: "none",
                                                                        fontSize: 12,
                                                                        fontWeight: 600,
                                                                        cursor: "pointer",
                                                                        background: u.active ? "var(--danger-soft)" : "var(--success-soft)",
                                                                        color: u.active ? "var(--danger)" : "var(--success)",
                                                                    }}
                                                                >
                                                                    {u.active ? "Desativar" : "Ativar"}
                                                                </button>
                                                                <button
                                                                    onClick={() => deleteUser(u.id, u.email)}
                                                                    style={{
                                                                        padding: "4px 10px",
                                                                        borderRadius: "var(--r-sm)",
                                                                        border: "none",
                                                                        fontSize: 12,
                                                                        cursor: "pointer",
                                                                        background: "rgba(239,68,68,0.08)",
                                                                        color: "var(--danger)",
                                                                    }}
                                                                    title="Deletar usuário"
                                                                >
                                                                    <Trash2 size={13} strokeWidth={2} />
                                                                </button>
                                                            </>
                                                        )}
                                                        {u.id === currentUser.id && (
                                                            <span style={{ fontSize: 12, color: "var(--text-2)" }}>Você</span>
                                                        )}
                                                    </div>
                                                </div>
                                            ))}
                                            {users.length === 0 && <p style={{ color: "var(--text-2)", fontSize: 14 }}>Nenhum usuário encontrado.</p>}
                                        </div>
                                    )}
                                </div>

                                {/* ── BOXES ── */}
                                <div className="tm-card fade-up" style={S.card}>
                                    <h2 style={S.cardTitle}><Building2 size={17} strokeWidth={2} color="var(--accent)" /> Boxes</h2>
                                    <form onSubmit={createBox} style={{ display: "flex", gap: 10, marginBottom: 16 }}>
                                        <input
                                            style={{ ...S.input, flex: 1 }}
                                            placeholder="Nome do box (ex: Box Rio)"
                                            value={newBoxName}
                                            onChange={(e) => setNewBoxName(e.target.value)}
                                        />
                                        <button type="submit" className="tm-btn tm-btn-primary" style={{ ...S.btnPrimary, whiteSpace: "nowrap" }}>
                                            {newBoxLoading ? "…" : <><Plus size={16} strokeWidth={2} /> Criar</>}
                                        </button>
                                    </form>
                                    {boxesLoading ? (
                                        <p style={{ color: "var(--text-2)", fontSize: 14 }}>Carregando…</p>
                                    ) : boxes.length === 0 ? (
                                        <p style={{ color: "var(--text-2)", fontSize: 14 }}>Nenhum box criado ainda.</p>
                                    ) : (
                                        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                                            {boxes.map((b) => (
                                                <div key={b.id} style={{
                                                    display: "flex", alignItems: "center", justifyContent: "space-between",
                                                    background: "var(--bg-raised)", border: "1px solid var(--border)",
                                                    borderRadius: 8, padding: "10px 14px",
                                                }}>
                                                    <div>
                                                        <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text)" }}>{b.name}</div>
                                                        <div style={{ fontSize: 12, color: "var(--text-2)" }}>{b._count?.users ?? 0} usuário(s)</div>
                                                    </div>
                                                    <button
                                                        onClick={() => deleteBox(b.id, b.name)}
                                                        className="tm-btn tm-btn-danger"
                                                        style={{ background: "var(--danger-soft)", border: "none", borderRadius: "var(--r-sm)", color: "var(--danger)", padding: "6px 10px", cursor: "pointer", display: "inline-flex", alignItems: "center" }}
                                                    ><Trash2 size={14} strokeWidth={2} /></button>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                {/* ── LOGS ── */}
                                <div className="tm-card fade-up" style={S.card}>
                                    <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <h2 style={{ ...S.cardTitle, margin: 0, marginBottom: 2, fontSize: "clamp(13px, 3.5vw, 16px)", whiteSpace: "normal" }}><FileText size={16} strokeWidth={2} color="var(--accent)" /> Logs do Sistema</h2>
                                            <p style={{ ...S.cardSub, marginBottom: 0, fontSize: "clamp(10px, 2.5vw, 12px)", whiteSpace: "normal" }}>Monitoramento de todas as ações realizadas</p>
                                        </div>
                                        <button
                                            className="tm-btn" style={{ ...S.btnUpload, fontSize: "clamp(11px, 2.8vw, 13px)", padding: "7px 14px", whiteSpace: "nowrap", flexShrink: 0 }}
                                            onClick={() => { setShowAudit(true); loadAuditLogs(1, ""); }}
                                        ><ClipboardList size={14} strokeWidth={2} /> Ver Logs</button>
                                    </div>
                                </div>

                                {/* ── Gestão do Box ── */}
                                <div className="tm-card fade-up" style={S.card}>
                                    <h2 style={{ ...S.cardTitle, marginBottom: 14 }}><ClipboardList size={17} strokeWidth={2} color="var(--accent)" /> Gestão do Box</h2>

                                    <div style={{ marginBottom: 14 }}>
                                        <label style={S.label}>Box</label>
                                        <select style={S.select} value={mgmtBoxId} onChange={e => { setMgmtBoxId(e.target.value); }}>
                                            <option value="">Selecione um box</option>
                                            {(boxes || []).map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                                        </select>
                                    </div>

                                    <div style={{ display: "flex", gap: 4, marginBottom: 16 }}>
                                        {[{ key: "programs", label: "WOD", Icon: Dumbbell }, { key: "schedules", label: "Horários", Icon: Calendar }, { key: "plans", label: "Planos", Icon: CreditCard }].map(t => (
                                            <button key={t.key} onClick={() => setMgmtSection(t.key)} style={{
                                                flex: 1, padding: "8px 4px", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer",
                                                background: mgmtSection === t.key ? "var(--accent-soft)" : "var(--bg-raised)",
                                                border: `1px solid ${mgmtSection === t.key ? "var(--accent)" : "var(--border)"}`,
                                                color: mgmtSection === t.key ? "var(--accent)" : "var(--text-2)",
                                                display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
                                            }}><t.Icon size={14} strokeWidth={2} />{t.label}</button>
                                        ))}
                                    </div>
                                </div>

                                {!mgmtBoxId && (
                                    <div className="tm-card fade-up" style={{ ...S.card, textAlign: "center", padding: 30, color: "var(--text-2)" }}>Selecione um box acima para gerenciar</div>
                                )}

                                {mgmtBoxId && mgmtSection === "programs" && (
                                    <>
                                        <div className="tm-card fade-up" style={{ ...S.card, background: "linear-gradient(135deg, var(--card) 0%, var(--card) 100%)", border: "1px solid var(--border)", padding: 16, marginBottom: 12 }}>
                                            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                                                <Bot size={18} strokeWidth={2} color="var(--accent)" />
                                                <span style={{ fontSize: 13, fontWeight: 700, color: "var(--accent)" }}>WOD Automático</span>
                                            </div>
                                            <div style={{ fontSize: 12, color: "var(--text-2)", lineHeight: 1.5 }}>
                                                O WOD é criado automaticamente a partir da mensagem diária enviada ao grupo do WhatsApp (envio automático, teste ou manual).
                                            </div>
                                        </div>
                                        <div className="tm-card fade-up" style={S.card}>
                                            <h3 style={{ fontSize: 14, color: "var(--text)", margin: "0 0 12px" }}>WODs publicados</h3>
                                            {boxPrograms.filter(p => p.boxId === parseInt(mgmtBoxId)).length === 0 && (
                                                <div style={{ textAlign: "center", color: "var(--text-2)", padding: 20, fontSize: 13 }}>Nenhum WOD publicado para este box</div>
                                            )}
                                            {boxPrograms.filter(p => p.boxId === parseInt(mgmtBoxId)).map(p => (
                                                <div key={p.id} style={{ background: "var(--bg-raised)", borderRadius: 8, padding: "10px 12px", marginBottom: 8, border: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
                                                    <div style={{ flex: 1, minWidth: 0 }}>
                                                        <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>{p.title}</div>
                                                        <div style={{ fontSize: 11, color: "var(--text-2)" }}>{new Date(p.date + "T12:00:00").toLocaleDateString("pt-BR")}</div>
                                                        <div style={{ fontSize: 11, color: "var(--text-2)", marginTop: 4, whiteSpace: "pre-wrap", maxHeight: 60, overflow: "hidden" }}>{p.content}</div>
                                                    </div>
                                                    <button onClick={async () => {
                                                        try { await authFetch(`${API}/box/programs/${p.id}`, { method: "DELETE" }); loadBoxData(); show("WOD removido", "info"); } catch { }
                                                    }} className="tm-btn tm-btn-danger" style={{ ...S.btnDel, flexShrink: 0 }}><Trash2 size={13} strokeWidth={2} /></button>
                                                </div>
                                            ))}
                                        </div>
                                    </>
                                )}

                                {mgmtBoxId && mgmtSection === "schedules" && (
                                    <>
                                        <div className="tm-card fade-up" style={S.card}>
                                            <h3 style={{ fontSize: 14, color: "var(--text)", margin: "0 0 12px" }}>Nova Aula</h3>
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
                                            }} className="tm-btn tm-btn-primary" style={{ ...S.btnPrimary, width: "100%" }}>Adicionar Horário</button>
                                        </div>
                                        <div className="tm-card fade-up" style={S.card}>
                                            <h3 style={{ fontSize: 14, color: "var(--text)", margin: "0 0 12px" }}>Horários cadastrados</h3>
                                            {boxSchedules.filter(s => s.boxId === parseInt(mgmtBoxId)).length === 0 && (
                                                <div style={{ textAlign: "center", color: "var(--text-2)", padding: 20, fontSize: 13 }}>Nenhum horário cadastrado para este box</div>
                                            )}
                                            {[1, 2, 3, 4, 5, 6, 0].map(d => {
                                                const dayItems = boxSchedules.filter(s => s.boxId === parseInt(mgmtBoxId) && s.dayOfWeek === d);
                                                if (dayItems.length === 0) return null;
                                                return (
                                                    <div key={d} style={{ marginBottom: 12 }}>
                                                        <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-2)", marginBottom: 6 }}>{["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"][d]}</div>
                                                        {dayItems.map(s => (
                                                            <div key={s.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "var(--bg-raised)", borderRadius: 8, padding: "8px 12px", marginBottom: 4, border: "1px solid var(--border)" }}>
                                                                <div>
                                                                    <span style={{ fontSize: 13, fontWeight: 700, color: "var(--accent)" }}>{s.startTime}–{s.endTime}</span>
                                                                    <span style={{ fontSize: 13, color: "var(--text)", marginLeft: 10 }}>{s.className}</span>
                                                                    {s.coach && <span style={{ fontSize: 11, color: "var(--text-2)", marginLeft: 8 }}>({s.coach})</span>}
                                                                </div>
                                                                <button onClick={async () => {
                                                                    try { await authFetch(`${API}/box/schedules/${s.id}`, { method: "DELETE" }); loadBoxData(); show("Horário removido", "info"); } catch { }
                                                                }} className="tm-btn tm-btn-danger" style={{ ...S.btnDel, padding: "4px 8px" }}><Trash2 size={13} strokeWidth={2} /></button>
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
                                        <div className="tm-card fade-up" style={S.card}>
                                            <h3 style={{ fontSize: 14, color: "var(--text)", margin: "0 0 12px" }}>Novo Plano</h3>
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
                                                    <input type="checkbox" checked={newPlan.highlighted} onChange={e => setNewPlan(p => ({ ...p, highlighted: e.target.checked }))} style={{ accentColor: "var(--accent)" }} />
                                                    <label style={{ fontSize: 13, color: "var(--text-2)" }}>Destacar</label>
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
                                            }} className="tm-btn tm-btn-primary" style={{ ...S.btnPrimary, width: "100%" }}>Criar Plano</button>
                                        </div>
                                        <div className="tm-card fade-up" style={S.card}>
                                            <h3 style={{ fontSize: 14, color: "var(--text)", margin: "0 0 12px" }}>Planos cadastrados</h3>
                                            {boxPlans.filter(p => p.boxId === parseInt(mgmtBoxId)).length === 0 && (
                                                <div style={{ textAlign: "center", color: "var(--text-2)", padding: 20, fontSize: 13 }}>Nenhum plano cadastrado para este box</div>
                                            )}
                                            {boxPlans.filter(p => p.boxId === parseInt(mgmtBoxId)).map(p => (
                                                <div key={p.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "var(--bg-raised)", borderRadius: 8, padding: "10px 12px", marginBottom: 6, border: `1px solid ${p.highlighted ? "rgba(59,130,246,0.35)" : "var(--border)"}` }}>
                                                    <div>
                                                        <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>{p.name} {p.highlighted && <span style={{ fontSize: 10, color: "var(--gold)" }}>⭐</span>}</div>
                                                        <div style={{ fontSize: 12, color: "var(--accent)", fontWeight: 700 }}>R$ {p.price.toFixed(2)} / {p.period}</div>
                                                    </div>
                                                    <button onClick={async () => {
                                                        try { await authFetch(`${API}/box/plans/${p.id}`, { method: "DELETE" }); loadBoxData(); show("Plano removido", "info"); } catch { }
                                                    }} className="tm-btn tm-btn-danger" style={{ ...S.btnDel, padding: "4px 8px" }}><Trash2 size={13} strokeWidth={2} /></button>
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
                                            { label: "Total Leads", value: flowStats.total, color: "var(--text-2)" },
                                            { label: "Convertidos", value: flowStats.converted, color: "var(--success)" },
                                            { label: "Taxa", value: `${flowStats.conversionRate}%`, color: "var(--gold)" },
                                        ].map(({ label, value, color }) => (
                                            <div key={label} style={{ background: "var(--bg-raised)", border: "1px solid var(--border)", borderRadius: "var(--r-md)", padding: "12px 10px", textAlign: "center" }}>
                                                <div style={{ fontSize: 20, fontWeight: 800, color }}>{value}</div>
                                                <div style={{ fontSize: 10, color: "var(--text-2)", marginTop: 2 }}>{label}</div>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {/* Sub-abas */}
                                <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
                                    {[{ key: "config", label: "Config", Icon: Settings }, { key: "menu", label: "Fluxo", Icon: ListTree }, { key: "leads", label: "Leads", Icon: Users }].map(t => (
                                        <button key={t.key} onClick={() => setFlowSection(t.key)} style={{
                                            flex: 1, padding: "8px 4px", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer",
                                            background: flowSection === t.key ? "var(--accent-soft)" : "var(--bg-raised)",
                                            border: `1px solid ${flowSection === t.key ? "var(--accent)" : "var(--border)"}`,
                                            color: flowSection === t.key ? "var(--accent)" : "var(--text-2)",
                                            display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
                                        }}><t.Icon size={14} strokeWidth={2} />{t.label}</button>
                                    ))}
                                </div>

                                {/* ── CONFIG ── */}
                                {flowSection === "config" && flowConfig && (
                                    <div className="tm-card fade-up" style={S.card}>
                                        <h2 style={S.cardTitle}><Settings size={17} strokeWidth={2} color="var(--accent)" /> Configurações do Bot</h2>

                                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: flowConfig.enabled ? "rgba(34,197,94,0.08)" : "rgba(239,68,68,0.06)", border: `1px solid ${flowConfig.enabled ? "rgba(34,197,94,0.25)" : "rgba(239,68,68,0.2)"}`, borderRadius: "var(--r-md)", padding: "12px 16px", marginBottom: 16 }}>
                                            <div>
                                                <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text)" }}>Bot de Vendas</div>
                                                <div style={{ fontSize: 12, color: "var(--text-2)" }}>{flowConfig.enabled ? "Respondendo mensagens" : "Desativado"}</div>
                                            </div>
                                            <button onClick={() => { const updated = { ...flowConfig, enabled: !flowConfig.enabled }; setFlowConfig(updated); saveFlowConfig(updated); }} style={{ padding: "8px 18px", borderRadius: 8, border: "none", fontWeight: 700, fontSize: 13, cursor: "pointer", background: flowConfig.enabled ? "rgba(239,68,68,0.15)" : "var(--success-soft)", color: flowConfig.enabled ? "var(--danger)" : "var(--success)" }}>
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

                                        <button onClick={saveFlowConfig} disabled={flowSaving} className="tm-btn tm-btn-primary" style={{ ...S.btnPrimary, width: "100%", opacity: flowSaving ? 0.7 : 1 }}>
                                            {flowSaving ? "Salvando..." : <><Save size={16} strokeWidth={2} /> Salvar Configurações</>}
                                        </button>
                                    </div>
                                )}

                                {/* ── FLUXO (árvore de menus) ── */}
                                {flowSection === "menu" && flowConfig && (() => {
                                    const allItems = flowConfig.menuItems || [];
                                    const getChildren = (parentId) => allItems.filter(i => (i.parentId ?? null) === (parentId ?? null)).sort((a, b) => a.sortOrder - b.sortOrder);
                                    const typeLabel = (item) => {
                                        const hasChildren = allItems.some(i => (i.parentId ?? null) === item.id);
                                        if (hasChildren) return { txt: "📂 Sub-menu", color: "var(--accent)" };
                                        if (item.isHuman) return { txt: "👤 Transfere humano", color: "var(--success)" };
                                        return { txt: "ℹ️ Informativo", color: "var(--warning)" };
                                    };
                                    const renderNode = (item, depth) => {
                                        const children = getChildren(item.id);
                                        const tp = typeLabel(item);
                                        return (
                                            <div key={item.id}>
                                                <div style={{ display: "flex", alignItems: "flex-start", gap: 8, marginLeft: depth * 20, marginBottom: 6 }}>
                                                    {depth > 0 && <div style={{ width: 2, minHeight: 36, background: "var(--border)", borderRadius: 2, flexShrink: 0, marginTop: 4 }} />}
                                                    <div style={{ flex: 1, background: "var(--bg-raised)", border: "1px solid var(--border)", borderRadius: "var(--r-md)", padding: "10px 12px" }}>
                                                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                                <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>{item.label}</div>
                                                                {item.description && <div style={{ fontSize: 11, color: "var(--text-2)", marginTop: 3, whiteSpace: "pre-wrap" }}>{item.description}</div>}
                                                                {item.price && <div style={{ fontSize: 11, color: "var(--warning)", marginTop: 3 }}>💰 {item.price}</div>}
                                                                <div style={{ fontSize: 10, color: tp.color, marginTop: 4, fontWeight: 600 }}>{tp.txt}</div>
                                                            </div>
                                                            <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                                                                <button className="tm-btn tm-btn-ghost" title="Adicionar sub-opção" onClick={() => openAddModal(item.id)} style={{ ...S.btnIcon, padding: "4px 7px" }}><Plus size={13} strokeWidth={2} /></button>
                                                                <button className="tm-btn tm-btn-ghost" title="Editar" onClick={() => openEditModal(item)} style={{ ...S.btnIcon, padding: "4px 7px" }}><Pencil size={13} strokeWidth={2} /></button>
                                                                <button className="tm-btn tm-btn-danger" title="Excluir" onClick={() => deleteMenuItem(item.id)} style={{ ...S.btnDel, padding: "4px 7px" }}><Trash2 size={13} strokeWidth={2} /></button>
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
                                        <div className="tm-card fade-up" style={S.card}>
                                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                                                <h2 style={{ ...S.cardTitle, margin: 0 }}><ListTree size={17} strokeWidth={2} color="var(--accent)" /> Fluxo de Atendimento</h2>
                                                <button className="tm-btn tm-btn-primary" onClick={() => openAddModal(null)} style={{ ...S.btnPrimary, padding: "7px 14px", fontSize: 12 }}><Plus size={14} strokeWidth={2} /> Adicionar opção</button>
                                            </div>
                                            {rootItems.length === 0 && (
                                                <p style={{ color: "var(--text-2)", fontSize: 13, textAlign: "center", padding: "20px 0" }}>Nenhuma opção cadastrada. Clique em "＋ Adicionar opção" para começar.</p>
                                            )}
                                            {rootItems.map(item => renderNode(item, 0))}
                                            <div style={{ marginTop: 14, padding: "10px 12px", background: "var(--bg-raised)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 11, color: "var(--text-2)" }}>
                                                <b style={{ color: "var(--accent)" }}>📂 Sub-menu</b> — abre outro nível de opções &nbsp;|&nbsp;
                                                <b style={{ color: "var(--success)" }}>👤 Transfere humano</b> — encerra e chama o atendente &nbsp;|&nbsp;
                                                <b style={{ color: "var(--warning)" }}>ℹ️ Informativo</b> — exibe detalhes e oferece falar com especialista
                                            </div>
                                        </div>
                                    );
                                })()}

                                {/* ── LEADS ── */}
                                {flowSection === "leads" && (
                                    <div className="tm-card fade-up" style={S.card}>
                                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                                            <h2 style={{ ...S.cardTitle, margin: 0 }}><Users size={17} strokeWidth={2} color="var(--accent)" /> Leads</h2>
                                            <button className="tm-btn tm-btn-ghost" style={S.btnIcon} onClick={() => { loadFlowLeads(1, flowLeadsFilter); loadFlowStats(); }}><RefreshCw size={15} strokeWidth={2} /></button>
                                        </div>
                                        <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
                                            {[{ v: "all", l: "Todos" }, { v: "pending", l: "Pendentes" }, { v: "converted", l: "Convertidos" }].map(({ v, l }) => (
                                                <button key={v} onClick={() => { setFlowLeadsFilter(v); loadFlowLeads(1, v); }} style={{ flex: 1, padding: "6px", borderRadius: "var(--r-sm)", fontSize: 11, fontWeight: 600, cursor: "pointer", background: flowLeadsFilter === v ? "var(--accent-soft)" : "var(--bg-raised)", border: `1px solid ${flowLeadsFilter === v ? "var(--accent)" : "var(--border)"}`, color: flowLeadsFilter === v ? "var(--accent)" : "var(--text-2)" }}>{l}</button>
                                            ))}
                                        </div>
                                        {flowLeadsLoading ? (
                                            <p style={{ color: "var(--text-2)", fontSize: 13, textAlign: "center" }}>Carregando...</p>
                                        ) : flowLeads.length === 0 ? (
                                            <p style={{ color: "var(--text-2)", fontSize: 13, textAlign: "center", padding: "20px 0" }}>Nenhum lead encontrado.</p>
                                        ) : (
                                            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                                                {flowLeads.map(lead => (
                                                    <div key={lead.id} style={{ background: "var(--bg-raised)", border: `1px solid ${lead.converted ? "rgba(34,197,94,0.25)" : "var(--border)"}`, borderRadius: "var(--r-md)", padding: "10px 12px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                                                        <div style={{ flex: 1, minWidth: 0 }}>
                                                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                                                <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>{lead.name || lead.phone.replace("@s.whatsapp.net", "")}</span>
                                                                <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: "var(--r-full)", fontWeight: 600, background: lead.converted ? "var(--success-soft)" : "var(--warning-soft)", color: lead.converted ? "var(--success)" : "var(--warning)" }}>{lead.converted ? "Convertido" : "Pendente"}</span>
                                                            </div>
                                                            <div style={{ fontSize: 11, color: "var(--text-2)", marginTop: 2 }}>Etapa: {lead.step} · Último contato: {new Date(lead.lastContact).toLocaleString("pt-BR")}</div>
                                                        </div>
                                                        <button className="tm-btn tm-btn-danger" onClick={() => deleteLead(lead.id)} style={{ ...S.btnDel, padding: "5px 8px", flexShrink: 0 }}><Trash2 size={13} strokeWidth={2} /></button>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                        {flowLeadsTotal > 20 && (
                                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 12 }}>
                                                <button className="tm-btn tm-btn-ghost" style={{ ...S.btnIcon, opacity: flowLeadsPage <= 1 ? 0.4 : 1 }} disabled={flowLeadsPage <= 1} onClick={() => loadFlowLeads(flowLeadsPage - 1, flowLeadsFilter)}>← Ant</button>
                                                <span style={{ fontSize: 12, color: "var(--text-2)" }}>{flowLeadsPage}/{Math.ceil(flowLeadsTotal / 20)} · {flowLeadsTotal} leads</span>
                                                <button className="tm-btn tm-btn-ghost" style={{ ...S.btnIcon, opacity: flowLeadsPage >= Math.ceil(flowLeadsTotal / 20) ? 0.4 : 1 }} disabled={flowLeadsPage >= Math.ceil(flowLeadsTotal / 20)} onClick={() => loadFlowLeads(flowLeadsPage + 1, flowLeadsFilter)}>Próx →</button>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </>
                        )}

                        {/* ══════════ MODAL ADD/EDIT ITEM DE FLUXO ══════════ */}
                        {flowItemModal && (
                            <div className="tm-modal-overlay" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
                                onClick={(e) => e.target === e.currentTarget && setFlowItemModal(null)}>
                                <div className="tm-modal" style={{ width: "100%", maxWidth: 440, background: "var(--card)", border: "1px solid var(--border)", borderRadius: "var(--r-lg)", padding: 22, boxShadow: "var(--shadow-2)", maxHeight: "90vh", overflowY: "auto" }}>
                                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                                        <h2 style={{ ...S.cardTitle, margin: 0 }}>{flowItemModal.mode === "add" ? (flowItemModal.parentId ? <><Plus size={16} strokeWidth={2} color="var(--accent)" /> Adicionar sub-opção</> : <><Plus size={16} strokeWidth={2} color="var(--accent)" /> Adicionar opção</>) : <><Pencil size={15} strokeWidth={2} color="var(--accent)" /> Editar opção</>}</h2>
                                        <button onClick={() => setFlowItemModal(null)} style={{ background: "none", border: "none", color: "var(--text-2)", cursor: "pointer", lineHeight: 1, padding: 4, display: "inline-flex" }}><X size={18} strokeWidth={2} /></button>
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
                                            <label key={String(opt.v) + opt.label} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4, cursor: "pointer", padding: "8px 6px", borderRadius: 8, border: `1px solid ${flowItemForm.isHuman === opt.v && !(opt.label.includes("sub") && !flowItemForm.isHuman) ? "var(--accent)" : "var(--border)"}`, background: "var(--bg-raised)" }}>
                                                <input type="radio" name="itemType" style={{ display: "none" }} checked={opt.label.includes("Humano") ? flowItemForm.isHuman : !flowItemForm.isHuman} onChange={() => setFlowItemForm(f => ({ ...f, isHuman: opt.v }))} />
                                                <span style={{ fontSize: 13 }}>{opt.label}</span>
                                                <span style={{ fontSize: 10, color: "var(--text-2)" }}>{opt.desc}</span>
                                            </label>
                                        ))}
                                    </div>
                                    <div style={{ display: "flex", gap: 8 }}>
                                        <button className="tm-btn tm-btn-primary" onClick={saveFlowItem} style={{ ...S.btnPrimary, flex: 1 }}><Save size={15} strokeWidth={2} /> Salvar</button>
                                        <button className="tm-btn tm-btn-ghost" onClick={() => setFlowItemModal(null)} style={{ ...S.btnIcon, flex: 1 }}>Cancelar</button>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* ══════════ MODAL LOGS ══════════ */}
                        {showAudit && currentUser?.role === "ADMIN" && (
                            <div
                                className="tm-modal-overlay" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 1000, display: "flex", flexDirection: "column", overflowY: "auto" }}
                                onClick={(e) => e.target === e.currentTarget && setShowAudit(false)}
                            >
                                <div className="tm-modal" style={{ margin: "auto", width: "100%", maxWidth: 700, background: "var(--card)", border: "1px solid var(--border)", borderRadius: "var(--r-lg)", padding: 24, maxHeight: "90vh", display: "flex", flexDirection: "column", boxShadow: "var(--shadow-2)" }}>
                                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                                        <h2 style={{ ...S.cardTitle, margin: 0 }}><FileText size={16} strokeWidth={2} color="var(--accent)" /> Logs do Sistema</h2>
                                        <button onClick={() => setShowAudit(false)} style={{ background: "none", border: "none", color: "var(--text-2)", cursor: "pointer", lineHeight: 1, padding: 4, display: "inline-flex" }}><X size={18} strokeWidth={2} /></button>
                                    </div>
                                    <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
                                        <input
                                            style={{ ...S.input, flex: 1 }}
                                            placeholder="Filtrar por ação (ex: LOGIN, PHOTO...)"
                                            value={auditFilter}
                                            onChange={(e) => setAuditFilter(e.target.value)}
                                            onKeyDown={(e) => e.key === "Enter" && loadAuditLogs(1, auditFilter)}
                                        />
                                        <button className="tm-btn tm-btn-ghost" style={S.btnIcon} onClick={() => loadAuditLogs(1, auditFilter)}><Search size={15} strokeWidth={2} /></button>
                                        <button className="tm-btn tm-btn-ghost" style={S.btnIcon} onClick={() => { setAuditFilter(""); loadAuditLogs(1, ""); }}><X size={15} strokeWidth={2} /></button>
                                    </div>
                                    <div style={{ overflowY: "auto", flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
                                        {auditLoading && <p style={{ color: "var(--text-2)", textAlign: "center" }}>Carregando…</p>}
                                        {!auditLoading && auditLogs.length === 0 && <p style={{ color: "var(--text-2)", textAlign: "center" }}>Nenhum log encontrado.</p>}
                                        {auditLogs.map((l) => {
                                            const actionColor =
                                                l.action.includes("ERROR") || l.action.includes("FAIL") ? "var(--danger)" :
                                                    l.action.includes("OK") || l.action.includes("LOGIN_OK") ? "var(--success)" :
                                                        l.action.startsWith("AUTO_SEND") ? "#a78bfa" :
                                                            l.action.startsWith("MANUAL_SEND") ? "#38bdf8" :
                                                                l.action.startsWith("SCHEDULE") ? "var(--warning)" :
                                                                    l.action.startsWith("PHOTO") ? "#fb923c" :
                                                                        l.action.startsWith("DAY_") ? "var(--success)" :
                                                                            l.action.startsWith("CONFIG") ? "#94a3b8" :
                                                                                l.action.startsWith("USER") ? "#e879f9" :
                                                                                    "var(--text-2)";
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
                                                <div key={l.id} style={{ background: "var(--bg-raised)", border: `1px solid ${actionColor}22`, borderRadius: 8, padding: "8px 14px" }}>
                                                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, flexWrap: "wrap" }}>
                                                        <span style={{ fontWeight: 700, fontSize: 12, color: actionColor, fontFamily: "monospace" }}>
                                                            {actionIcon} {l.action}
                                                        </span>
                                                        <span style={{ fontSize: 11, color: "var(--text-3)", flexShrink: 0 }}>{new Date(l.createdAt).toLocaleString("pt-BR")}</span>
                                                    </div>
                                                    <div style={{ fontSize: 12, color: "var(--text-2)", marginTop: 4 }}>
                                                        {l.user ? `👤 ${l.user.name || l.user.email}` : "🤖 sistema"}
                                                        {l.ip && <span style={{ color: "var(--text-3)", marginLeft: 8 }}>{l.ip}</span>}
                                                    </div>
                                                    {l.detail && <div style={{ fontSize: 11, color: "var(--text-2)", marginTop: 2, wordBreak: "break-all" }}>{l.detail}</div>}
                                                </div>
                                            );
                                        })}
                                    </div>
                                    {auditTotal > 50 && (
                                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 14, gap: 8 }}>
                                            <button className="tm-btn tm-btn-ghost" style={{ ...S.btnIcon, opacity: auditPage <= 1 ? 0.4 : 1 }} disabled={auditPage <= 1} onClick={() => loadAuditLogs(auditPage - 1, auditFilter)}>← Anterior</button>
                                            <span style={{ fontSize: 12, color: "var(--text-2)" }}>{auditPage}/{Math.ceil(auditTotal / 50)} · {auditTotal} registros</span>
                                            <button className="tm-btn tm-btn-ghost" style={{ ...S.btnIcon, opacity: auditPage >= Math.ceil(auditTotal / 50) ? 0.4 : 1 }} disabled={auditPage >= Math.ceil(auditTotal / 50)} onClick={() => loadAuditLogs(auditPage + 1, auditFilter)}>Próximo →</button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}


                        {/* ══════════ ABA AUTOMAÇÕES DE GRUPO ══════════ */}
                        {tab === "manual" && (
                            <div className="tm-card fade-up" style={S.card}>
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                                    <h2 style={{ ...S.cardTitle, margin: 0 }}><Settings size={17} strokeWidth={2} color="var(--accent)" /> Automações de Grupo</h2>
                                    <div style={{ display: "flex", gap: 8 }}>
                                        <button className="tm-btn tm-btn-ghost" style={S.btnIcon} onClick={() => { loadGroupAutomations(); loadGroups(); }} title="Atualizar"><RefreshCw size={15} strokeWidth={2} /></button>
                                        <button className="tm-btn tm-btn-primary" style={{ ...S.btnPrimary, padding: "8px 14px", fontSize: 13 }} onClick={openAddAutoModal}><Plus size={15} strokeWidth={2} /> Nova</button>
                                    </div>
                                </div>
                                <p style={{ ...S.cardSub, marginBottom: 16 }}>
                                    Cada grupo pode ter um horário e mensagem diferentes. A foto do dia é a mesma para todos.
                                </p>

                                {groupAutomations.length === 0 ? (
                                    <div style={{ textAlign: "center", padding: "32px 0", color: "var(--text-2)" }}>
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
                                                    background: a.active ? "rgba(34,197,94,0.04)" : "var(--bg-raised)",
                                                    border: `1px solid ${a.active ? "rgba(34,197,94,0.18)" : "var(--border)"}`,
                                                    borderRadius: "var(--r-lg)", overflow: "hidden",
                                                }}>
                                                    {/* Header do card */}
                                                    <div style={{ padding: "14px 16px", display: "flex", alignItems: "flex-start", gap: 10 }}>
                                                        <div style={{ flex: 1, minWidth: 0 }}>
                                                            <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text)", marginBottom: 4, wordBreak: "break-word" }}>
                                                                {a.groupName || a.groupJid.replace(/@g\.us$/, "")}
                                                            </div>
                                                            <div style={{ fontSize: 12, color: "var(--text-2)", display: "inline-flex", alignItems: "center", gap: 5 }}>
                                                                <Clock size={12} strokeWidth={2} /> {a.scheduleTime} · {a.timezone}
                                                            </div>
                                                            <div style={{ fontSize: 11, color: configuredDays.length === 7 ? "var(--success)" : configuredDays.length > 0 ? "var(--warning)" : "var(--danger)", marginTop: 4 }}>
                                                                {configuredDays.length === 0
                                                                    ? "⚠️ Nenhuma mensagem configurada"
                                                                    : configuredDays.length === 7
                                                                        ? "✅ Semana completa"
                                                                        : `📝 ${configuredDays.length}/7 dias com mensagem`}
                                                            </div>
                                                        </div>
                                                        <div style={{ display: "flex", flexDirection: "column", gap: 6, flexShrink: 0 }}>
                                                            <button onClick={() => toggleGroupAutomation(a)} style={{ padding: "5px 10px", borderRadius: 8, border: "none", fontSize: 11, fontWeight: 700, cursor: "pointer", background: a.active ? "var(--success-soft)" : "rgba(161,161,170,0.12)", color: a.active ? "var(--success)" : "var(--text-2)" }}>
                                                                {a.active ? <><Check size={12} strokeWidth={2.5} /> Ativo</> : <><Pause size={12} strokeWidth={2} /> Parado</>}
                                                            </button>
                                                            <button className="tm-btn tm-btn-ghost" onClick={() => openEditAutoModal(a)} style={{ padding: "5px 10px", borderRadius: "var(--r-sm)", border: "1px solid var(--border)", fontSize: 11, cursor: "pointer", background: "transparent", color: "var(--text-2)", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 5 }}>
                                                                <Pencil size={11} strokeWidth={2} /> Config
                                                            </button>
                                                            <button className="tm-btn tm-btn-danger" onClick={() => deleteGroupAutomation(a.id)} style={{ padding: "5px 10px", borderRadius: "var(--r-sm)", border: "none", cursor: "pointer", background: "var(--danger-soft)", color: "var(--danger)", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                                                                <Trash2 size={12} strokeWidth={2} />
                                                            </button>
                                                        </div>
                                                    </div>

                                                    {/* Preview dos dias da semana */}
                                                    <div style={{ borderTop: "1px solid var(--border)", padding: "10px 16px", display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                                                        {DAYS_LABELS.map((label, idx) => {
                                                            const d = (a.days || []).find(x => x.day === idx);
                                                            const ok = d?.enabled && d?.message?.trim();
                                                            return (
                                                                <span key={idx} style={{ fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: "var(--r-sm)", background: ok ? "var(--success-soft)" : "var(--bg-raised)", color: ok ? "var(--success)" : "var(--text-2)", border: `1px solid ${ok ? "rgba(34,197,94,0.25)" : "var(--border)"}` }}>
                                                                    {label}
                                                                </span>
                                                            );
                                                        })}
                                                        <button onClick={() => openDaysModal(a)} className="tm-btn" style={{ marginLeft: "auto", padding: "4px 12px", borderRadius: "var(--r-sm)", border: "1px solid var(--accent)", fontSize: 11, fontWeight: 700, cursor: "pointer", background: "transparent", color: "var(--accent)", display: "inline-flex", alignItems: "center", gap: 5 }}>
                                                            <Pencil size={11} strokeWidth={2} /> Mensagens
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
                    <div onClick={() => setAutoModal(null)} className="tm-modal-overlay" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 2000 }}>
                        <div className="tm-modal" onClick={e => e.stopPropagation()} style={{ width: "100%", maxWidth: 480, background: "var(--card)", border: "1px solid var(--border)", borderRadius: "var(--r-lg) var(--r-lg) 0 0", padding: "24px 20px 32px", boxShadow: "var(--shadow-2)" }}>
                            <h2 style={{ ...S.cardTitle, marginTop: 0, marginBottom: 20 }}>{autoModal.mode === "add" ? <><Plus size={16} strokeWidth={2} color="var(--accent)" /> Nova Automação</> : <><Pencil size={15} strokeWidth={2} color="var(--accent)" /> Configurar Grupo</>}</h2>

                            <div style={S.formGroup}>
                                <label style={S.label}>Grupo do WhatsApp</label>
                                <div style={{ display: "flex", gap: 8 }}>
                                    <select style={{ ...S.select, flex: 1 }} value={autoForm.groupJid} onChange={e => setAutoForm(f => ({ ...f, groupJid: e.target.value }))} disabled={autoModal.mode === "edit"}>
                                        <option value="">-- Selecione --</option>
                                        {groups.map(g => <option key={g.jid} value={g.jid}>{g.name}</option>)}
                                    </select>
                                    <button className="tm-btn tm-btn-ghost" style={S.btnIcon} onClick={loadGroups} title="Atualizar"><RefreshCw size={15} strokeWidth={2} /></button>
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
                                <input type="checkbox" checked={autoForm.active} onChange={e => setAutoForm(f => ({ ...f, active: e.target.checked }))} style={{ width: 16, height: 16, accentColor: "var(--accent)" }} />
                                <span style={{ fontSize: 13, color: "var(--text)" }}>Automação ativa</span>
                            </label>

                            {autoModal.mode === "add" && (
                                <p style={{ fontSize: 12, color: "var(--text-2)", marginBottom: 16, background: "rgba(59,130,246,0.06)", border: "1px solid rgba(59,130,246,0.15)", borderRadius: 8, padding: "10px 12px" }}>
                                    💡 Após criar, você configurará as mensagens para cada dia da semana.
                                </p>
                            )}

                            <div style={{ display: "flex", gap: 10 }}>
                                <button className="tm-btn tm-btn-primary" style={{ ...S.btnPrimary, flex: 1, ...(autoSaving ? { opacity: 0.5 } : {}) }} onClick={saveAutoModal} disabled={autoSaving}>
                                    {autoSaving ? "Salvando..." : autoModal.mode === "add" ? <>Próximo <ChevronRight size={15} strokeWidth={2} /></> : <><Save size={15} strokeWidth={2} /> Salvar</>}
                                </button>
                                <button className="tm-btn tm-btn-ghost" style={{ ...S.btnIcon, flex: 0, padding: "12px 18px" }} onClick={() => setAutoModal(null)}>Cancelar</button>
                            </div>
                        </div>
                    </div>
                )}

                {/* ══════════ MODAL MENSAGENS POR DIA DA SEMANA ══════════ */}
                {autoModal && autoModal.mode === "days" && (
                    <div className="tm-modal-overlay" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 2000 }}>
                        <div className="tm-modal" style={{ width: "100%", maxWidth: 480, background: "var(--card)", border: "1px solid var(--border)", borderRadius: "var(--r-lg) var(--r-lg) 0 0", maxHeight: "90vh", display: "flex", flexDirection: "column", boxShadow: "var(--shadow-2)" }}>
                            <div style={{ padding: "20px 20px 12px", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
                                <h2 style={{ ...S.cardTitle, marginTop: 0, marginBottom: 4 }}><Pencil size={15} strokeWidth={2} color="var(--accent)" /> Mensagens da Semana</h2>
                                <p style={{ fontSize: 12, color: "var(--text-2)", margin: 0 }}>
                                    {autoModal.item.groupName || autoModal.item.groupJid?.replace(/@g\.us$/, "")} · {autoModal.item.scheduleTime}
                                </p>
                            </div>

                            <div style={{ overflowY: "auto", flex: 1, padding: "12px 16px 8px" }}>
                                {autoDays.map((d, idx) => (
                                    <div key={d.day} style={{ marginBottom: 14, background: "var(--bg-raised)", border: `1px solid ${d.enabled && d.message?.trim() ? "rgba(34,197,94,0.25)" : "var(--border)"}`, borderRadius: 12, padding: "12px 14px" }}>
                                        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                                            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", flex: 1 }}>
                                                <input
                                                    type="checkbox"
                                                    checked={d.enabled}
                                                    onChange={e => setAutoDays(days => days.map((x, i) => i === idx ? { ...x, enabled: e.target.checked } : x))}
                                                    style={{ width: 15, height: 15, accentColor: "var(--accent)" }}
                                                />
                                                <span style={{ fontSize: 13, fontWeight: 700, color: d.enabled ? "var(--text)" : "var(--text-2)" }}>{DAYS_LABELS[d.day]}</span>
                                            </label>
                                            {d.enabled && d.message?.trim() && <span style={{ fontSize: 10, color: "var(--success)" }}>✓</span>}
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

                            <div style={{ padding: "12px 16px 28px", borderTop: "1px solid var(--border)", display: "flex", gap: 10, flexShrink: 0 }}>
                                <button className="tm-btn tm-btn-primary" style={{ ...S.btnPrimary, flex: 1, ...(autoSaving ? { opacity: 0.5 } : {}) }} onClick={saveDaysModal} disabled={autoSaving}>
                                    {autoSaving ? "Salvando..." : <><Save size={15} strokeWidth={2} /> Salvar Mensagens</>}
                                </button>
                                <button className="tm-btn tm-btn-ghost" style={{ ...S.btnIcon, flex: 0, padding: "12px 18px" }} onClick={() => setAutoModal(null)}>Fechar</button>
                            </div>
                        </div>
                    </div>
                )}

                {/* ══════════ PREVIEW MODAL ══════════ */}
                {previewDay !== null && (
                    <div
                        className="tm-modal-overlay"
                        onClick={() => setPreviewDay(null)}
                        style={{
                            position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            zIndex: 2000, padding: 16,
                        }}
                    >
                        <div
                            className="tm-modal"
                            onClick={(e) => e.stopPropagation()}
                            style={{
                                background: "var(--card)", border: "1px solid var(--border)", borderRadius: "var(--r-lg)",
                                padding: 24, maxWidth: 360, width: "100%", boxShadow: "var(--shadow-2)",
                            }}
                        >
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                                <h3 style={{ margin: 0, fontSize: 16, color: "var(--text)" }}>
                                    {DAY_ICONS[previewDay]} Preview — {DAYS[previewDay]}
                                </h3>
                                <button onClick={() => setPreviewDay(null)} style={{ background: "none", border: "none", color: "var(--text-2)", cursor: "pointer", padding: 4, display: "inline-flex" }}><X size={18} strokeWidth={2} /></button>
                            </div>
                            {/* Balão de mensagem estilo WhatsApp */}
                            <div style={{ background: "#128C7E", borderRadius: 12, padding: "10px 14px", marginBottom: 10, fontSize: 14, color: "#fff", lineHeight: 1.5 }}>
                                {(photos[previewDay]?.message?.trim()) || config.message || "(sem mensagem)"}
                            </div>
                            {photos[previewDay]?.dataUrl && (
                                <img
                                    src={photos[previewDay].dataUrl}
                                    alt="Preview"
                                    style={{ width: "100%", borderRadius: "var(--r-md)", border: "1px solid var(--border)" }}
                                />
                            )}
                            <p style={{ fontSize: 11, color: "var(--text-2)", marginTop: 10, textAlign: "center" }}>
                                Será enviado às {config.scheduleTime || "05:00"} no grupo configurado
                            </p>
                        </div>
                    </div>
                )}

                {/* ── Criar arte (WOD em texto -> PNG) ── */}
                {artDay !== null && (
                    <div
                        className="tm-modal-overlay"
                        onClick={() => !artGenerating && setArtDay(null)}
                        style={{
                            position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            zIndex: 2000, padding: 16,
                        }}
                    >
                        <div
                            className="tm-modal"
                            onClick={(e) => e.stopPropagation()}
                            style={{
                                background: "var(--card)", border: "1px solid var(--border)", borderRadius: "var(--r-lg)",
                                padding: 24, maxWidth: 420, width: "100%", boxShadow: "var(--shadow-2)",
                                maxHeight: "90vh", overflowY: "auto",
                            }}
                        >
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                                <h3 style={{ margin: 0, fontSize: 16, color: "var(--text)", display: "flex", alignItems: "center", gap: 8 }}>
                                    {artDataByDay[artDay] ? <Pencil size={17} strokeWidth={2} color="var(--accent)" /> : <Sparkles size={17} strokeWidth={2} color="var(--accent)" />}
                                    {" "}{artDataByDay[artDay] ? "Editar arte" : "Criar arte"} — {DAYS[artDay]}
                                </h3>
                                <button onClick={() => !artGenerating && setArtDay(null)} style={{ background: "none", border: "none", color: "var(--text-2)", cursor: "pointer", padding: 4, display: "inline-flex" }}><X size={18} strokeWidth={2} /></button>
                            </div>

                            <div style={S.formGroup}>
                                <label style={S.label}>Treino de hoje — use # antes do título de cada bloco</label>
                                <textarea
                                    style={{ ...S.input, minHeight: 260, resize: "vertical", fontFamily: "monospace", fontSize: 13, whiteSpace: "pre" }}
                                    value={artText}
                                    onChange={(e) => setArtText(e.target.value)}
                                    placeholder={ART_PLACEHOLDER}
                                    rows={14}
                                />
                                <p style={{ fontSize: 11, color: "var(--text-3)", margin: "6px 0 0" }}>
                                    Linhas com <b>#</b> viram título grande (ex: <b># WOD</b>). As demais viram o texto do bloco.
                                </p>
                            </div>

                            <div
                                ref={artPreviewWrapRef}
                                onPointerDown={() => setSelectedOverlayId(null)}
                                style={{ marginBottom: 10, position: "relative" }}
                            >
                                <canvas
                                    ref={artCanvasRef}
                                    style={{ width: "100%", height: "auto", borderRadius: "var(--r-md)", border: "1px solid var(--border)", display: "block" }}
                                />
                                {artOverlays.map((ov) => {
                                    const scale = artPreviewWrapRef.current ? artPreviewWrapRef.current.clientWidth / 1080 : 1;
                                    const selected = selectedOverlayId === ov.id;
                                    return (
                                        <div
                                            key={ov.id}
                                            onPointerDown={(e) => overlayPointerDown(e, ov.id, "drag")}
                                            style={{
                                                position: "absolute", left: ov.x * scale, top: ov.y * scale,
                                                width: ov.w * scale, height: ov.h * scale,
                                                border: selected ? "2px dashed var(--accent)" : "2px dashed transparent",
                                                cursor: "move", touchAction: "none", boxSizing: "border-box",
                                            }}
                                        >
                                            <img
                                                src={ov.img.src}
                                                alt=""
                                                draggable={false}
                                                style={{ width: "100%", height: "100%", objectFit: "contain", pointerEvents: "none", userSelect: "none" }}
                                            />
                                            {selected && (
                                                <>
                                                    <button
                                                        onPointerDown={(e) => e.stopPropagation()}
                                                        onClick={(e) => { e.stopPropagation(); removeArtOverlay(ov.id); }}
                                                        title="Remover imagem"
                                                        style={{
                                                            position: "absolute", top: -10, right: -10, width: 20, height: 20,
                                                            borderRadius: "50%", background: "var(--danger)", color: "#fff",
                                                            border: "none", cursor: "pointer", display: "flex", alignItems: "center",
                                                            justifyContent: "center", padding: 0,
                                                        }}
                                                    >
                                                        <X size={12} strokeWidth={2.5} />
                                                    </button>
                                                    <div
                                                        onPointerDown={(e) => overlayPointerDown(e, ov.id, "resize")}
                                                        title="Arraste para redimensionar"
                                                        style={{
                                                            position: "absolute", bottom: -8, right: -8, width: 18, height: 18,
                                                            borderRadius: "50%", background: "var(--accent)", border: "2px solid var(--card)",
                                                            cursor: "nwse-resize", touchAction: "none",
                                                        }}
                                                    />
                                                </>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>

                            <button
                                type="button"
                                className="tm-btn"
                                style={{
                                    width: "100%", padding: "9px 0", marginBottom: 16,
                                    background: "var(--accent-soft)", border: "1px solid rgba(59,130,246,0.25)",
                                    borderRadius: "var(--r-sm)", color: "var(--accent)", fontSize: 12, fontWeight: 600,
                                    cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                                }}
                                onClick={openLogoPicker}
                            >
                                <ImagePlus size={14} strokeWidth={2} /> Adicionar imagem/logo
                            </button>
                            {artOverlays.length > 0 && (
                                <p style={{ fontSize: 11, color: "var(--text-3)", margin: "-10px 0 16px", textAlign: "center" }}>
                                    Arraste a imagem para posicionar e use a bolinha no canto para redimensionar
                                </p>
                            )}

                            <button
                                className="tm-btn tm-btn-primary"
                                style={{ width: "100%", padding: "12px 0", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
                                disabled={artGenerating || !artText.trim()}
                                onClick={generateAndUseArt}
                            >
                                {artGenerating ? "Gerando..." : <><Sparkles size={16} strokeWidth={2} /> {artDataByDay[artDay] ? "Salvar alterações" : "Gerar e usar como foto do dia"}</>}
                            </button>
                        </div>
                    </div>
                )}

                {/* ── Galeria de logos (apenas imagens de public/logo, estilo sticker do Stories) ── */}
                {showLogoPicker && (
                    <div
                        className="tm-modal-overlay"
                        onClick={() => setShowLogoPicker(false)}
                        style={{
                            position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            zIndex: 2100, padding: 16,
                        }}
                    >
                        <div
                            className="tm-modal"
                            onClick={(e) => e.stopPropagation()}
                            style={{
                                background: "var(--card)", border: "1px solid var(--border)", borderRadius: "var(--r-lg)",
                                padding: 24, maxWidth: 380, width: "100%", boxShadow: "var(--shadow-2)",
                                maxHeight: "80vh", overflowY: "auto",
                            }}
                        >
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                                <h3 style={{ margin: 0, fontSize: 16, color: "var(--text)", display: "flex", alignItems: "center", gap: 8 }}>
                                    <ImagePlus size={17} strokeWidth={2} color="var(--accent)" /> Escolha um logo
                                </h3>
                                <button onClick={() => setShowLogoPicker(false)} style={{ background: "none", border: "none", color: "var(--text-2)", cursor: "pointer", padding: 4, display: "inline-flex" }}><X size={18} strokeWidth={2} /></button>
                            </div>
                            {loadingLogos ? (
                                <p style={{ fontSize: 13, color: "var(--text-2)", textAlign: "center", padding: "20px 0" }}>Carregando...</p>
                            ) : availableLogos.length === 0 ? (
                                <p style={{ fontSize: 13, color: "var(--text-2)", textAlign: "center", padding: "20px 0" }}>Nenhuma imagem encontrada em public/logo.</p>
                            ) : (
                                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
                                    {availableLogos.map((filename) => (
                                        <button
                                            key={filename}
                                            type="button"
                                            onClick={() => { addArtOverlayImage(`/logo/${filename}`); setShowLogoPicker(false); }}
                                            title={filename}
                                            style={{
                                                aspectRatio: "1 / 1", padding: 8, borderRadius: "var(--r-md)",
                                                border: "1px solid var(--border)", background: "var(--bg-2, rgba(255,255,255,0.03))",
                                                cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                                            }}
                                        >
                                            <img
                                                src={`/logo/${filename}`}
                                                alt={filename}
                                                style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }}
                                            />
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* ── BOTTOM NAV — apenas quando conectado (barra fixa) ── */}
                {currentUser?.role !== "ALUNO" && status === "open" && (
                    <nav className="tm-dock" style={{ position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 200 }}>
                        <div className="tm-dock-inner">
                            {[
                                { key: "auto", Icon: AlarmClock, label: "Automação" },
                                { key: "manual", Icon: Settings, label: "Grupos" },
                                { key: "flow", Icon: Bot, label: "Bot Vendas" },
                                ...(currentUser?.role === "ADMIN" ? [{ key: "users", Icon: Users, label: "Admin" }, { key: "requests", Icon: Bell, label: "Acesso", badge: pendingCount }] : []),
                            ].map(({ key, Icon, label, badge }) => (
                                <button
                                    key={key}
                                    className="tm-nav-item"
                                    onClick={() => {
                                        setTab(key);
                                        if (key === "users") { loadUsers(); loadBoxes(); loadBoxData(); }
                                        if (key === "flow") { loadFlowConfig(); loadFlowStats(); loadFlowLeads(1, "all"); }
                                        if (key === "requests") { loadAccessRequests(); }
                                        if (key === "manual") { loadGroupAutomations(); loadGroups(); }
                                    }}
                                    style={{
                                        flex: 1, display: "flex", flexDirection: "column", alignItems: "center",
                                        gap: 3, padding: "8px 0 7px", border: "none", borderRadius: "var(--r-md)",
                                        cursor: "pointer", minWidth: 0,
                                        background: tab === key ? "var(--accent-soft)" : "transparent",
                                        color: tab === key ? "var(--accent)" : "var(--text-3)",
                                        position: "relative",
                                    }}
                                >
                                    <span style={{ position: "relative", display: "inline-flex" }}>
                                        <Icon size={20} strokeWidth={2} />
                                        {badge > 0 && <span style={{ position: "absolute", top: -5, right: -8, background: "var(--danger)", color: "#fff", fontSize: 9, fontWeight: 700, borderRadius: "var(--r-full)", padding: "1px 4px", lineHeight: 1.4 }}>{badge}</span>}
                                    </span>
                                    <span style={{ fontSize: 10, fontWeight: tab === key ? 700 : 500, letterSpacing: "0.02em", maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
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
                                    ? "var(--success)"
                                    : toast.type === "error"
                                        ? "var(--danger)"
                                        : "#333338",
                        }}
                    >
                        {toast.text}
                    </div>
                )}

                {/* ── MODAL INSTALAR PWA ── */}
                {showInstallModal && (
                    <div className="tm-modal-overlay" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 900, display: "flex", alignItems: "flex-end", justifyContent: "center", padding: "0 0 24px" }}
                        onClick={() => setShowInstallModal(false)}>
                        <div className="tm-modal" style={{ width: "100%", maxWidth: 440, background: "var(--card)", border: "1px solid var(--border)", borderRadius: "var(--r-lg)", padding: "28px 24px", boxShadow: "var(--shadow-2)" }}
                            onClick={e => e.stopPropagation()}>
                            <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: "-0.02em", color: "var(--text)", marginBottom: 6, textAlign: "center", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}><Smartphone size={20} strokeWidth={2} color="var(--accent)" /> Instalar Team Muniz</div>
                            <div style={{ fontSize: 13, color: "var(--text-2)", textAlign: "center", marginBottom: 24 }}>Adicione à tela inicial para usar como app</div>
                            <div style={{ background: "var(--bg-raised)", borderRadius: 12, padding: "16px", marginBottom: 16 }}>
                                <div style={{ fontSize: 13, fontWeight: 700, color: "var(--accent)", marginBottom: 10 }}>🍎 iPhone / iPad (Safari)</div>
                                <div style={{ fontSize: 13, color: "var(--text-2)", lineHeight: 1.7 }}>
                                    1. Toque em <strong style={{ color: "var(--text)" }}>compartilhar</strong> (ícone da caixa com seta ↑)<br />
                                    2. Role e toque em <strong style={{ color: "var(--text)" }}>&quot;Adicionar à Tela Inicial&quot;</strong><br />
                                    3. Confirme tocando em <strong style={{ color: "var(--text)" }}>Adicionar</strong>
                                </div>
                            </div>
                            <div style={{ background: "var(--bg-raised)", borderRadius: 12, padding: "16px", marginBottom: 20 }}>
                                <div style={{ fontSize: 13, fontWeight: 700, color: "var(--accent)", marginBottom: 10 }}>🤖 Android (Chrome)</div>
                                <div style={{ fontSize: 13, color: "var(--text-2)", lineHeight: 1.7 }}>
                                    1. Toque nos <strong style={{ color: "var(--text)" }}>3 pontos ⋮</strong> no canto superior direito<br />
                                    2. Toque em <strong style={{ color: "var(--text)" }}>&quot;Adicionar à tela inicial&quot;</strong><br />
                                    3. Confirme tocando em <strong style={{ color: "var(--text)" }}>Adicionar</strong>
                                </div>
                            </div>
                            <button onClick={() => setShowInstallModal(false)} className="tm-btn tm-btn-primary" style={{ width: "100%", padding: "14px", background: "var(--accent)", border: "none", borderRadius: "var(--r-md)", color: "#fff", fontWeight: 700, fontSize: 15, cursor: "pointer" }}>Entendido</button>
                        </div>
                    </div>
                )}

                {/* ── MODAL PERFIL ── */}
                {showProfileModal && (
                    <div className="tm-modal-overlay" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 900, display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }}
                        onClick={() => setShowProfileModal(false)}>
                        <div className="tm-modal" style={{ width: "100%", maxWidth: 420, background: "var(--card)", border: "1px solid var(--border)", borderRadius: "var(--r-lg)", padding: "28px 24px", boxShadow: "var(--shadow-2)", maxHeight: "90vh", overflowY: "auto" }}
                            onClick={e => e.stopPropagation()}>
                            <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: "-0.02em", color: "var(--text)", marginBottom: 20, textAlign: "center", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}><User size={18} strokeWidth={2} color="var(--accent)" /> Meu Perfil</div>
                            {/* Avatar */}
                            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: 24 }}>
                                <div style={{ position: "relative", width: 80, height: 80, marginBottom: 10 }}>
                                    <div style={{ width: 80, height: 80, borderRadius: "50%", overflow: "hidden", background: "var(--bg-raised)", border: "2px solid var(--accent)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 32, color: "var(--accent)", fontWeight: 700 }}>
                                        {profileAvatarFile
                                            ? <img src={URL.createObjectURL(profileAvatarFile)} style={{ width: "100%", height: "100%", objectFit: "cover" }} alt="preview" />
                                            : currentUser?.avatar
                                                ? <img src={`data:image/jpeg;base64,${currentUser.avatar}`} style={{ width: "100%", height: "100%", objectFit: "cover" }} alt="avatar" />
                                                : (currentUser?.name?.[0]?.toUpperCase() || "U")
                                        }
                                    </div>
                                    <button onClick={() => profileAvatarRef.current?.click()} style={{ position: "absolute", bottom: -2, right: -2, width: 26, height: 26, borderRadius: "50%", background: "var(--accent)", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff" }}><Camera size={13} strokeWidth={2} /></button>
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
                            <hr style={{ border: "none", borderTop: "1px solid var(--border)", margin: "18px 0" }} />
                            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-2)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 14 }}>Alterar Senha</div>
                            <div style={{ marginBottom: 12 }}>
                                <label style={S.label}>Senha atual</label>
                                <div style={{ position: "relative" }}>
                                    <input style={{ ...S.input, paddingRight: 40 }} type={showPwd.current ? "text" : "password"} value={profileCurrentPwd} onChange={e => setProfileCurrentPwd(e.target.value)} placeholder="••••••••" />
                                    <button type="button" onClick={() => setShowPwd(p => ({ ...p, current: !p.current }))} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "var(--text-2)", fontSize: 16, padding: 0, lineHeight: 1 }}>{showPwd.current ? <EyeOff size={16} strokeWidth={2} /> : <Eye size={16} strokeWidth={2} />}</button>
                                </div>
                            </div>
                            <div style={{ marginBottom: 12 }}>
                                <label style={S.label}>Nova senha</label>
                                <div style={{ position: "relative" }}>
                                    <input style={{ ...S.input, paddingRight: 40 }} type={showPwd.newp ? "text" : "password"} value={profileNewPwd} onChange={e => setProfileNewPwd(e.target.value)} placeholder="Mínimo 8 caracteres" />
                                    <button type="button" onClick={() => setShowPwd(p => ({ ...p, newp: !p.newp }))} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "var(--text-2)", fontSize: 16, padding: 0, lineHeight: 1 }}>{showPwd.newp ? <EyeOff size={16} strokeWidth={2} /> : <Eye size={16} strokeWidth={2} />}</button>
                                </div>
                            </div>
                            <div style={{ marginBottom: 20 }}>
                                <label style={S.label}>Confirmar nova senha</label>
                                <div style={{ position: "relative" }}>
                                    <input style={{ ...S.input, paddingRight: 40 }} type={showPwd.confirm ? "text" : "password"} value={profileConfirmPwd} onChange={e => setProfileConfirmPwd(e.target.value)} placeholder="Repita a nova senha" />
                                    <button type="button" onClick={() => setShowPwd(p => ({ ...p, confirm: !p.confirm }))} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "var(--text-2)", fontSize: 16, padding: 0, lineHeight: 1 }}>{showPwd.confirm ? <EyeOff size={16} strokeWidth={2} /> : <Eye size={16} strokeWidth={2} />}</button>
                                </div>
                            </div>
                            <div style={{ display: "flex", gap: 10 }}>
                                <button onClick={() => setShowProfileModal(false)} className="tm-btn tm-btn-ghost" style={{ flex: 1, padding: "12px", background: "var(--bg-raised)", border: "1px solid var(--border)", borderRadius: "var(--r-md)", color: "var(--text-2)", fontSize: 14, cursor: "pointer" }}>Cancelar</button>
                                <button onClick={saveProfile} disabled={profileSaving} className="tm-btn tm-btn-primary" style={{ flex: 2, padding: "12px", background: profileSaving ? "rgba(59,130,246,0.5)" : "var(--accent)", border: "none", borderRadius: "var(--r-md)", color: "#fff", fontWeight: 700, fontSize: 14, cursor: profileSaving ? "not-allowed" : "pointer" }}>{profileSaving ? "Salvando..." : "Salvar"}</button>
                            </div>
                        </div>
                    </div>
                )}

            </div>
        </>
    );
}

// ── Estilos (design system Team Muniz57) ─────────────────────────────────────
const S = {
    page: {
        maxWidth: 720,
        margin: "0 auto",
        padding: "20px 16px 72px",
        color: "var(--text)",
    },
    header: {
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: 20,
        paddingBottom: 16,
        borderBottom: "1px solid var(--border)",
    },
    statsRow: {
        display: "grid",
        gap: 10,
        marginBottom: 16,
    },
    stat: {
        background: "var(--card)",
        border: "1px solid var(--border)",
        borderRadius: "var(--r-lg)",
        padding: "16px 12px",
        textAlign: "center",
        display: "flex",
        flexDirection: "column-reverse",
        justifyContent: "center",
        gap: 6,
        boxShadow: "var(--shadow-1)",
    },
    statNum: {
        fontSize: 26,
        fontWeight: 800,
        color: "var(--text)",
        letterSpacing: "-0.02em",
        fontVariantNumeric: "tabular-nums",
        lineHeight: 1.1,
    },
    statLabel: {
        fontSize: 11,
        color: "var(--text-3)",
        textTransform: "uppercase",
        letterSpacing: "0.08em",
        fontWeight: 600,
    },

    card: {
        background: "var(--card)",
        border: "1px solid var(--border)",
        borderRadius: "var(--r-lg)",
        padding: 20,
        marginBottom: 16,
        boxShadow: "var(--shadow-1)",
    },
    cardTitle: {
        fontSize: 16,
        margin: "0 0 4px",
        color: "var(--text)",
        fontWeight: 700,
        letterSpacing: "-0.02em",
        display: "flex",
        alignItems: "center",
        gap: 8,
    },
    cardSub: { fontSize: 13, color: "var(--text-2)", margin: "0 0 16px", lineHeight: 1.5 },

    formGroup: { marginBottom: 14 },
    label: {
        display: "block",
        fontSize: 11,
        color: "var(--text-3)",
        marginBottom: 6,
        fontWeight: 600,
        textTransform: "uppercase",
        letterSpacing: "0.08em",
    },
    input: {
        width: "100%",
        padding: "12px 14px",
        background: "var(--bg-raised)",
        border: "1px solid var(--border)",
        borderRadius: "var(--r-md)",
        color: "var(--text)",
        fontSize: 14,
        boxSizing: "border-box",
        outline: "none",
    },
    select: {
        padding: "12px 14px",
        background: "var(--bg-raised)",
        border: "1px solid var(--border)",
        borderRadius: "var(--r-md)",
        color: "var(--text)",
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
        padding: "12px 14px",
        background: "var(--bg-raised)",
        border: "1px solid var(--border)",
        borderRadius: "var(--r-md)",
        color: "var(--text)",
        fontSize: 14,
        resize: "vertical",
        boxSizing: "border-box",
        outline: "none",
        fontFamily: "inherit",
    },
    infoBox: {
        background: "var(--accent-soft)",
        border: "1px solid rgba(59,130,246,0.2)",
        borderRadius: "var(--r-md)",
        padding: "10px 14px",
        fontSize: 13,
        color: "var(--text-2)",
        marginBottom: 14,
        lineHeight: 1.5,
    },
    btnIcon: {
        padding: "10px 14px",
        background: "var(--bg-raised)",
        border: "1px solid var(--border)",
        borderRadius: "var(--r-md)",
        color: "var(--text-2)",
        fontSize: 14,
        cursor: "pointer",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
        transition: "all .15s ease",
    },

    grid: {
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(135px, 1fr))",
        gap: 12,
    },
    dayCard: {
        background: "var(--bg-raised)",
        border: "2px solid var(--border)",
        borderRadius: "var(--r-md)",
        padding: 10,
        textAlign: "center",
        position: "relative",
        transition: "border-color 0.2s, box-shadow 0.2s",
    },
    todayTag: {
        position: "absolute",
        top: -9,
        right: -6,
        background: "var(--accent)",
        color: "#fff",
        fontSize: 10,
        fontWeight: 700,
        padding: "2px 8px",
        borderRadius: "var(--r-full)",
        letterSpacing: "0.04em",
    },
    dayHeader: {
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
        marginBottom: 8,
    },
    dayName: { fontSize: 13, margin: 0, color: "var(--text-2)", fontWeight: 600 },
    photoBox: { marginBottom: 8 },
    photoImg: {
        width: "100%",
        height: 95,
        objectFit: "cover",
        borderRadius: "var(--r-sm)",
        border: "1px solid var(--border)",
    },
    photoEmpty: {
        width: "100%",
        height: 95,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--bg)",
        borderRadius: "var(--r-sm)",
        border: "1px dashed var(--border)",
    },
    dayBtns: { display: "flex", gap: 6, justifyContent: "center" },
    btnUpload: {
        flex: 1,
        padding: "6px 0",
        background: "var(--accent-soft)",
        border: "1px solid rgba(59,130,246,0.25)",
        borderRadius: "var(--r-sm)",
        color: "var(--accent)",
        fontSize: 12,
        fontWeight: 600,
        cursor: "pointer",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
        transition: "all .15s ease",
    },
    btnDel: {
        padding: "6px 8px",
        background: "var(--danger-soft)",
        border: "1px solid rgba(239,68,68,0.25)",
        borderRadius: "var(--r-sm)",
        color: "var(--danger)",
        fontSize: 12,
        cursor: "pointer",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
        transition: "all .15s ease",
    },

    btnPrimary: {
        padding: "11px 22px",
        background: "var(--accent)",
        color: "#fff",
        border: "none",
        borderRadius: "var(--r-md)",
        fontSize: 14,
        fontWeight: 600,
        cursor: "pointer",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        transition: "all .15s ease",
    },
    btnDanger: {
        padding: "10px 18px",
        background: "var(--danger-soft)",
        color: "var(--danger)",
        border: "1px solid rgba(239,68,68,0.25)",
        borderRadius: "var(--r-md)",
        fontSize: 14,
        fontWeight: 600,
        cursor: "pointer",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        transition: "all .15s ease",
    },
    btnWarn: {
        padding: "10px 18px",
        background: "var(--warning-soft)",
        color: "var(--warning)",
        border: "1px solid rgba(245,158,11,0.25)",
        borderRadius: "var(--r-md)",
        fontSize: 14,
        fontWeight: 600,
        cursor: "pointer",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        transition: "all .15s ease",
    },
    toast: {
        position: "fixed",
        bottom: 96,
        left: "50%",
        transform: "translateX(-50%)",
        padding: "12px 24px",
        borderRadius: "var(--r-md)",
        fontSize: 14,
        fontWeight: 500,
        color: "#fff",
        zIndex: 1000,
        boxShadow: "var(--shadow-2)",
        animation: "fadeInUp .2s ease-out",
        maxWidth: "calc(100vw - 32px)",
    },
};
