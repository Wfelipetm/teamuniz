import React, { useState, useContext } from "react";
import { makeStyles, createTheme, ThemeProvider } from "@material-ui/core/styles";
import PhoneAndroidIcon from "@material-ui/icons/PhoneAndroid";
import PersonOutlineIcon from "@material-ui/icons/PersonOutline";
import LockOutlinedIcon from "@material-ui/icons/LockOutlined";
import LockIcon from "@material-ui/icons/Lock";
import SecurityIcon from "@material-ui/icons/Security";
import VisibilityIcon from "@material-ui/icons/Visibility";
import VisibilityOffIcon from "@material-ui/icons/VisibilityOff";
import { AuthContext } from "../../context/Auth/AuthContext";

const lightTheme = createTheme({
	palette: {
		type: "light",
		primary: { main: "#2563EB" },
		background: { default: "#ffffff", paper: "#ffffff" },
		text: { primary: "#1e293b", secondary: "#64748b" },
	},
});

const useStyles = makeStyles(() => ({
	root: {
		width: "100vw",
		height: "100vh",
		background: "linear-gradient(135deg, #f5f7fc 0%, #eef2f9 50%, #f3f6fd 100%)",
		display: "flex",
		alignItems: "center",
		justifyContent: "center",
		fontFamily: "'Inter', 'Roboto', sans-serif",
	},
	card: {
		background: "#ffffff",
		borderRadius: 20,
		boxShadow: "0 8px 40px rgba(30, 58, 138, 0.13)",
		padding: "40px 36px 32px",
		width: "100%",
		maxWidth: 420,
		display: "flex",
		flexDirection: "column",
		alignItems: "center",
		boxSizing: "border-box",
	},
	iconWrapper: {
		position: "relative",
		marginBottom: 18,
	},
	iconBox: {
		width: 68,
		height: 68,
		borderRadius: 18,
		background: "#2563EB",
		display: "flex",
		alignItems: "center",
		justifyContent: "center",
		boxShadow: "0 4px 18px rgba(37, 99, 235, 0.4)",
	},
	greenDot: {
		position: "absolute",
		top: -4,
		right: -4,
		width: 18,
		height: 18,
		borderRadius: "50%",
		background: "#22c55e",
		border: "2.5px solid #fff",
		zIndex: 1,
	},
	title: {
		fontWeight: 700,
		fontSize: 23,
		color: "#1e293b",
		marginBottom: 4,
		letterSpacing: "-0.3px",
	},
	orgName: {
		fontWeight: 600,
		fontSize: 14,
		color: "#2563EB",
		marginBottom: 4,
	},
	hint: {
		fontSize: 13,
		color: "#2563EB",
		marginBottom: 28,
		textAlign: "center",
	},
	fieldGroup: {
		width: "100%",
		marginBottom: 18,
	},
	fieldLabel: {
		fontSize: 14,
		fontWeight: 500,
		color: "#2563EB",
		marginBottom: 6,
		display: "block",
	},
	inputWrap: {
		display: "flex",
		alignItems: "center",
		background: "#ffffff",
		border: "1.5px solid #d1d9ef",
		borderRadius: 12,
		overflow: "hidden",
		"&:focus-within": {
			borderColor: "#2563EB",
			boxShadow: "0 0 0 3px rgba(37,99,235,0.08)",
		},
	},
	inputIcon: {
		display: "flex",
		alignItems: "center",
		justifyContent: "center",
		padding: "0 14px",
		color: "#94a3b8",
		flexShrink: 0,
	},
	divider: {
		width: 1,
		height: 24,
		background: "#e2e8f0",
		flexShrink: 0,
	},
	inputNative: {
		flex: 1,
		border: "none",
		outline: "none",
		padding: "13px 14px",
		fontSize: 14,
		color: "#1e293b",
		background: "#ffffff",
		fontFamily: "inherit",
		"&::placeholder": {
			color: "#b0bec5",
		},
		"&:-webkit-autofill": {
			WebkitBoxShadow: "0 0 0px 1000px #ffffff inset",
			WebkitTextFillColor: "#1e293b",
			transition: "background-color 5000s ease-in-out 0s",
		},
		"&:-webkit-autofill:hover": {
			WebkitBoxShadow: "0 0 0px 1000px #ffffff inset",
		},
		"&:-webkit-autofill:focus": {
			WebkitBoxShadow: "0 0 0px 1000px #ffffff inset",
		},
	},
	eyeBtn: {
		background: "none",
		border: "none",
		cursor: "pointer",
		display: "flex",
		alignItems: "center",
		padding: "0 12px",
		color: "#94a3b8",
		"&:hover": { color: "#2563EB" },
	},
	submitBtn: {
		width: "100%",
		marginTop: 4,
		marginBottom: 14,
		padding: "13px 0",
		borderRadius: 12,
		fontSize: 15,
		fontWeight: 600,
		background: "#2563EB",
		color: "#fff",
		border: "none",
		cursor: "pointer",
		display: "flex",
		alignItems: "center",
		justifyContent: "center",
		gap: 8,
		boxShadow: "0 4px 14px rgba(37,99,235,0.35)",
		fontFamily: "inherit",
		letterSpacing: "0.2px",
		"&:hover": {
			background: "#1d4ed8",
		},
	},
	secureText: {
		fontSize: 12,
		color: "#22c55e",
		fontWeight: 600,
		display: "flex",
		alignItems: "center",
		gap: 5,
		marginBottom: 20,
	},
	footer: {
		fontSize: 12,
		color: "#2563EB",
		textAlign: "center",
		lineHeight: 1.7,
	},
}));

const Login = () => {
	const classes = useStyles();
	const [user, setUser] = useState({ email: "", password: "" });
	const [showPassword, setShowPassword] = useState(false);
	const { handleLogin } = useContext(AuthContext);

	const handleChangeInput = e => {
		setUser({ ...user, [e.target.name]: e.target.value });
	};

	const handlSubmit = e => {
		e.preventDefault();
		handleLogin(user);
	};

	return (
		<ThemeProvider theme={lightTheme}>
			<div className={classes.root}>
				<div className={classes.card}>

					{/* Icon */}
					<div className={classes.iconWrapper}>
						<div className={classes.iconBox}>
							<PhoneAndroidIcon style={{ color: "#fff", fontSize: 34 }} />
						</div>
						<div className={classes.greenDot} />
					</div>

					{/* Titles */}
					<div className={classes.title}>Sistema de Chat</div>
					<div className={classes.orgName}>Prefeitura de Itaguaí</div>
					<div className={classes.hint}>Insira suas credenciais para acessar o sistema</div>

					{/* Form */}
					<form style={{ width: "100%" }} noValidate onSubmit={handlSubmit}>

						{/* Usuário */}
						<div className={classes.fieldGroup}>
							<label className={classes.fieldLabel}>Usuário</label>
							<div className={classes.inputWrap}>
								<span className={classes.inputIcon}>
									<PersonOutlineIcon style={{ fontSize: 20 }} />
								</span>
								<div className={classes.divider} />
								<input
									className={classes.inputNative}
									type="text"
									name="email"
									placeholder="Digite seu usuário"
									value={user.email}
									onChange={handleChangeInput}
									autoComplete="email"
									autoFocus
								/>
							</div>
						</div>

						{/* Senha */}
						<div className={classes.fieldGroup}>
							<label className={classes.fieldLabel}>Senha</label>
							<div className={classes.inputWrap}>
								<span className={classes.inputIcon}>
									<LockOutlinedIcon style={{ fontSize: 20 }} />
								</span>
								<div className={classes.divider} />
								<input
									className={classes.inputNative}
									type={showPassword ? "text" : "password"}
									name="password"
									placeholder="••••••••"
									value={user.password}
									onChange={handleChangeInput}
									autoComplete="current-password"
								/>
								<button type="button" className={classes.eyeBtn} onClick={() => setShowPassword(!showPassword)}>
									{showPassword ? <VisibilityOffIcon style={{ fontSize: 18 }} /> : <VisibilityIcon style={{ fontSize: 18 }} />}
								</button>
							</div>
						</div>

						<button type="submit" className={classes.submitBtn}>
							<SecurityIcon style={{ fontSize: 17 }} />
							Entrar no Sistema
						</button>
					</form>

					{/* Secure */}
					<div className={classes.secureText}>
						<LockIcon style={{ fontSize: 13 }} />
						Conexão segura e criptografada
					</div>

					{/* Footer */}
					<div className={classes.footer}>
						<div>© {new Date().getFullYear()} Prefeitura Municipal de Itaguaí</div>
						<div>Desenvolvido pela Secretaria Municipal de Ciência, Tecnologia e Inovação</div>
					</div>

				</div>
			</div>
		</ThemeProvider>
	);
};

export default Login;

