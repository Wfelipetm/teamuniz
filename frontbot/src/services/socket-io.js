import openSocket from "socket.io-client";

/**
 * Cria (ou reaproveita) uma conexão de socket.io autenticada com o token
 * armazenado no localStorage. Mantido por compatibilidade com componentes
 * legados que ainda importam este módulo diretamente ao invés de usar o
 * SocketContext.
 */
export default function socketConnection() {
	const token = localStorage.getItem("token");

	return openSocket(process.env.REACT_APP_BACKEND_URL, {
		transports: ["websocket", "polling"],
		auth: token ? { token: JSON.parse(token) } : undefined,
	});
}
