import { useState, useEffect, useContext } from "react";
import { useHistory } from "react-router-dom";

import { toast } from "react-toastify";

import { i18n } from "../../translate/i18n";
import api from "../../services/api";
import toastError from "../../errors/toastError";
import { SocketContext } from "../../context/Socket/SocketContext";

const useAuth = () => {
  const history = useHistory();
  const [isAuth, setIsAuth] = useState(false);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState({});

  api.interceptors.request.use(
    (config) => {
      const token = localStorage.getItem("token");
      if (token) {
        config.headers["Authorization"] = `Bearer ${JSON.parse(token)}`;
        setIsAuth(true);
      }
      return config;
    },
    (error) => {
      Promise.reject(error);
    }
  );

  api.interceptors.response.use(
    (response) => {
      return response;
    },
    async (error) => {
      const originalRequest = error.config;

      if (error?.response?.status === 403 && !originalRequest._retry) {
        if (!localStorage.getItem("token")) {
          return Promise.reject(error);
        }

        // Token inválido/expirado — tenta refresh via cookie
        originalRequest._retry = true;

        try {
          const { data } = await api.post("/auth/refresh_token");
          if (data) {
            localStorage.setItem("token", JSON.stringify(data.token));
            api.defaults.headers.Authorization = `Bearer ${data.token}`;
            originalRequest.headers.Authorization = `Bearer ${data.token}`;
          }
          return api(originalRequest);
        } catch (refreshError) {
          localStorage.removeItem("token");
          localStorage.removeItem("userId");
          api.defaults.headers.Authorization = undefined;
          setIsAuth(false);
          setUser({});
          return Promise.reject(refreshError);
        }
      }

      if (
        error?.response?.status === 401 ||
        (error?.response?.status === 403 && originalRequest._retry)
      ) {
        localStorage.removeItem("token");
        localStorage.removeItem("userId");
        api.defaults.headers.Authorization = undefined;
        setIsAuth(false);
        setUser({});
      }

      return Promise.reject(error);
    }
  );

  const socketManager = useContext(SocketContext);

  // Verifica autenticação ao carregar
  useEffect(() => {
    const token = localStorage.getItem("token");
    (async () => {
      if (token) {
        try {
          // Tenta refresh para pegar dados do usuário e renovar token
          const { data } = await api.post("/auth/refresh_token");
          if (data && data.token) {
            localStorage.setItem("token", JSON.stringify(data.token));
            api.defaults.headers.Authorization = `Bearer ${data.token}`;
            setIsAuth(true);
            setUser(data.user);
          }
        } catch (err) {
          // Refresh falhou — tenta /auth/me como fallback
          try {
            const { data } = await api.get("/auth/me");
            if (data && (data.user || data.id)) {
              setIsAuth(true);
              setUser(data.user || data);
            }
          } catch {
            localStorage.removeItem("token");
            localStorage.removeItem("userId");
            setIsAuth(false);
            setUser({});
          }
        }
      }
      setLoading(false);
    })();
  }, []);

  // Socket: atualiza user em tempo real
  useEffect(() => {
    const userId = localStorage.getItem("userId");
    const companyId = localStorage.getItem("companyId");
    if (companyId && user.id) {
      const socket = socketManager.getSocket(companyId);

      socket.on(`company-${companyId}-user`, (data) => {
        if (data.action === "update" && data.user.id === user.id) {
          setUser(data.user);
        }
      });

      return () => {
        socket.disconnect();
      };
    }
  }, [socketManager, user]);

  const handleLogin = async (userData) => {
    setLoading(true);

    try {
      const { data } = await api.post("/auth/login", userData);

      if (!data || !data.token || !data.user) {
        throw new Error("Resposta inválida do servidor");
      }

      localStorage.setItem("token", JSON.stringify(data.token));
      localStorage.setItem("userId", data.user.id);

      // Dados opcionais do sistema de empresas
      if (data.user.companyId) {
        localStorage.setItem("companyId", data.user.companyId);
      }

      api.defaults.headers.Authorization = `Bearer ${data.token}`;
      setUser(data.user);
      setIsAuth(true);
      toast.success(i18n.t("auth.toasts.success"));
      history.push("/");
      setLoading(false);
    } catch (err) {
      toastError(err);
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    setLoading(true);

    try {
      await api.delete("/auth/logout");
    } catch {
      // Ignora erro no logout — limpa local de qualquer forma
    }

    localStorage.removeItem("token");
    localStorage.removeItem("companyId");
    localStorage.removeItem("userId");
    localStorage.removeItem("cshow");
    api.defaults.headers.Authorization = undefined;
    setIsAuth(false);
    setUser({});
    setLoading(false);
    history.push("/login");
  };

  const getCurrentUserInfo = async () => {
    try {
      const { data } = await api.get("/auth/me");
      return data;
    } catch (err) {
      toastError(err);
    }
  };

  return {
    isAuth,
    user,
    loading,
    handleLogin,
    handleLogout,
    getCurrentUserInfo,
  };
};

export default useAuth;
