import React, { useState, useContext, useEffect } from "react";
import clsx from "clsx";
import moment from "moment";
import {
  makeStyles,
  Drawer,
  AppBar,
  Toolbar,
  List,
  Typography,
  Divider,
  MenuItem,
  IconButton,
  Menu,
  ListItemIcon,
  ListItemText,
  Box,
  Avatar,
  useTheme,
  useMediaQuery,
} from "@material-ui/core";

import MenuIcon from "@material-ui/icons/Menu";
import ChevronLeftIcon from "@material-ui/icons/ChevronLeft";
import AccountCircle from "@material-ui/icons/AccountCircle";
import CachedIcon from "@material-ui/icons/Cached";
import ExitToAppIcon from "@material-ui/icons/ExitToApp";
import PersonIcon from "@material-ui/icons/Person";
import PhoneAndroidIcon from "@material-ui/icons/PhoneAndroid";

import MainListItems from "./MainListItems";
import NotificationsPopOver from "../components/NotificationsPopOver";
import NotificationsVolume from "../components/NotificationsVolume";
import UserModal from "../components/UserModal";
import { AuthContext } from "../context/Auth/AuthContext";
import BackdropLoading from "../components/BackdropLoading";
import DarkMode from "../components/DarkMode";
import { i18n } from "../translate/i18n";
import toastError from "../errors/toastError";
import AnnouncementsPopover from "../components/AnnouncementsPopover";
import api from "../services/api";
import { changeLanguage } from "../translate/i18n";

import logo from "../assets/logo smctic branco.png";
import { SocketContext } from "../context/Socket/SocketContext";
import ChatPopover from "../pages/Chat/ChatPopover";

import { useDate } from "../hooks/useDate";

import ColorModeContext from "../layout/themeContext";
import Brightness4Icon from '@material-ui/icons/Brightness4';
import Brightness7Icon from '@material-ui/icons/Brightness7';
import LanguageControl from "../components/LanguageControl";
import { LanguageOutlined } from "@material-ui/icons";

const drawerWidth = 240;

const useStyles = makeStyles((theme) => ({
  root: {
    display: "flex",
    height: "100vh",
    [theme.breakpoints.down("sm")]: {
      height: "calc(100vh - 56px)",
    },
    backgroundColor: theme.palette.fancyBackground,
    '& .MuiButton-outlinedPrimary': {
      color: theme.mode === 'light' ? '#FFF' : '#FFF',
      //backgroundColor: theme.mode === 'light' ? '#682ee2' : '#682ee2',
      backgroundColor: theme.mode === 'light' ? theme.palette.primary.main : '#1c1c1c',
      //border: theme.mode === 'light' ? '1px solid rgba(0 124 102)' : '1px solid rgba(255, 255, 255, 0.5)',
    },
    '& .MuiTab-textColorPrimary.Mui-selected': {
      color: theme.mode === 'light' ? 'Primary' : '#FFF',
    }
  },
  avatar: {
    width: "100%",
  },
  toolbar: {
    paddingRight: 24, // keep right padding when drawer closed
    color: theme.palette.dark.main,
    background: theme.palette.barraSuperior,
    minHeight: "80px",
  },
  toolbarIcon: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "0 8px",
    minHeight: "80px",
    [theme.breakpoints.down("sm")]: {
      height: "48px"
    }
  },
  appBar: {
    zIndex: theme.zIndex.drawer + 1,
    transition: theme.transitions.create(["width", "margin"], {
      easing: theme.transitions.easing.sharp,
      duration: theme.transitions.duration.leavingScreen,
    }),
  },
  appBarShift: {
    marginLeft: drawerWidth,
    width: `calc(100% - ${drawerWidth}px)`,
    transition: theme.transitions.create(["width", "margin"], {
      easing: theme.transitions.easing.sharp,
      duration: theme.transitions.duration.enteringScreen,
    }),
    [theme.breakpoints.down("sm")]: {
      display: "none"
    }
  },
  menuButton: {
    marginRight: 36,
  },
  menuButtonHidden: {
    display: "none",
  },
  title: {
    flexGrow: 1,
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
  },
  headerLogo: {
    height: 80,
    maxWidth: "100%",
    objectFit: "contain",
    filter: "brightness(0) invert(1)",
    marginLeft: 40,  // ← ajuste aqui para mover para direita
  },
  drawerPaper: {
    position: "relative",
    whiteSpace: "nowrap",
    width: drawerWidth,
    transition: theme.transitions.create("width", {
      easing: theme.transitions.easing.sharp,
      duration: theme.transitions.duration.enteringScreen,
    }),
    [theme.breakpoints.down("sm")]: {
      width: "100%"
    },
    ...theme.scrollbarStylesSoft
  },
  drawerPaperClose: {
    overflowX: "hidden",
    transition: theme.transitions.create("width", {
      easing: theme.transitions.easing.sharp,
      duration: theme.transitions.duration.leavingScreen,
    }),
    width: theme.spacing(7),
    [theme.breakpoints.up("sm")]: {
      width: theme.spacing(9),
    },
    [theme.breakpoints.down("sm")]: {
      width: "100%"
    }
  },
  appBarSpacer: {
    minHeight: "80px",
  },
  content: {
    flex: 1,
    overflow: "auto",

  },
  container: {
    paddingTop: theme.spacing(4),
    paddingBottom: theme.spacing(4),
  },
  paper: {
    padding: theme.spacing(2),
    display: "flex",
    overflow: "auto",
    flexDirection: "column"
  },
  containerWithScroll: {
    flex: 1,
    padding: theme.spacing(1),
    overflowY: "scroll",
    ...theme.scrollbarStyles,
  },
  NotificationsPopOver: {
    // color: theme.barraSuperior.secondary.main,
  },
  logo: {
    width: "80%",
    height: "auto",
    maxWidth: 180,
    filter: theme.mode === 'dark' ? 'brightness(0) invert(1)' : 'none',
    transition: 'filter 0.3s ease',
    [theme.breakpoints.down("sm")]: {
      width: "auto",
      height: "80%",
      maxWidth: 180,
    },
    logo: theme.logo
  },
}));

const LoggedInLayout = ({ children, themeToggle }) => {
  const classes = useStyles();
  const [userModalOpen, setUserModalOpen] = useState(false);
  const [anchorEl, setAnchorEl] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const { handleLogout, loading } = useContext(AuthContext);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerVariant, setDrawerVariant] = useState("permanent");
  // const [dueDate, setDueDate] = useState("");
  const { user } = useContext(AuthContext);

  const theme = useTheme();
  const { colorMode } = useContext(ColorModeContext);
  const greaterThenSm = useMediaQuery(theme.breakpoints.up("sm"));

  const [volume, setVolume] = useState(localStorage.getItem("volume") || 1);

  const { dateToClient } = useDate();

  // Languages
  const [anchorElLanguage, setAnchorElLanguage] = useState(null);
  const [menuLanguageOpen, setMenuLanguageOpen] = useState(false);
  const [langAnchor, setLangAnchor] = useState(null);
  const [currentLang, setCurrentLang] = useState(localStorage.getItem('i18nextLng') || 'pt');

  const handleLangChange = async (lang) => {
    setCurrentLang(lang);
    changeLanguage(lang);
    setLangAnchor(null);
    try { await api.post(`/users/set-language/${lang}`); } catch (e) { }
  };


  //################### CODIGOS DE TESTE #########################################
  // useEffect(() => {
  //   navigator.getBattery().then((battery) => {
  //     console.log(`Battery Charging: ${battery.charging}`);
  //     console.log(`Battery Level: ${battery.level * 100}%`);
  //     console.log(`Charging Time: ${battery.chargingTime}`);
  //     console.log(`Discharging Time: ${battery.dischargingTime}`);
  //   })
  // }, []);

  // useEffect(() => {
  //   const geoLocation = navigator.geolocation

  //   geoLocation.getCurrentPosition((position) => {
  //     let lat = position.coords.latitude;
  //     let long = position.coords.longitude;

  //     console.log('latitude: ', lat)
  //     console.log('longitude: ', long)
  //   })
  // }, []);

  // useEffect(() => {
  //   const nucleos = window.navigator.hardwareConcurrency;

  //   console.log('Nucleos: ', nucleos)
  // }, []);

  // useEffect(() => {
  //   console.log('userAgent', navigator.userAgent)
  //   if (
  //     navigator.userAgent.match(/Android/i)
  //     || navigator.userAgent.match(/webOS/i)
  //     || navigator.userAgent.match(/iPhone/i)
  //     || navigator.userAgent.match(/iPad/i)
  //     || navigator.userAgent.match(/iPod/i)
  //     || navigator.userAgent.match(/BlackBerry/i)
  //     || navigator.userAgent.match(/Windows Phone/i)
  //   ) {
  //     console.log('é mobile ', true) //celular
  //   }
  //   else {
  //     console.log('não é mobile: ', false) //nao é celular
  //   }
  // }, []);
  //##############################################################################

  const socketManager = useContext(SocketContext);

  useEffect(() => {
    if (document.body.offsetWidth > 1200) {
      setDrawerOpen(true);
    }
  }, []);

  useEffect(() => {
    if (document.body.offsetWidth < 600) {
      setDrawerVariant("temporary");
    } else {
      setDrawerVariant("permanent");
    }
  }, [drawerOpen]);

  useEffect(() => {
    const companyId = localStorage.getItem("companyId");
    const userId = localStorage.getItem("userId");

    const socket = socketManager.getSocket(companyId);

    socket.on(`company-${companyId}-auth`, (data) => {
      if (data.user.id === +userId) {
        toastError("Sua conta foi acessada em outro computador.");
        setTimeout(() => {
          localStorage.clear();
          window.location.reload();
        }, 1000);
      }
    });

    socket.emit("userStatus");
    const interval = setInterval(() => {
      socket.emit("userStatus");
    }, 1000 * 60 * 5);

    return () => {
      socket.disconnect();
      clearInterval(interval);
    };
  }, [socketManager]);

  const handleMenu = (event) => {
    setAnchorEl(event.currentTarget);
    setMenuOpen(true);
  };

  const handlemenuLanguage = (event) => {
    setAnchorElLanguage(event.currentTarget);
    setMenuLanguageOpen(true);
  }

  const handleCloseMenu = () => {
    setAnchorEl(null);
    setMenuOpen(false);
  };

  const handleCloseMenuLanguage = () => {
    setAnchorElLanguage(null);
    setMenuLanguageOpen(false);
  }

  const handleOpenUserModal = () => {
    setUserModalOpen(true);
    handleCloseMenu();
  };

  const handleClickLogout = () => {
    handleCloseMenu();
    handleLogout();
  };

  const drawerClose = () => {
    if (document.body.offsetWidth < 600) {
      setDrawerOpen(false);
    }
  };

  const handleRefreshPage = () => {
    window.location.reload(false);
  }

  const handleMenuItemClick = () => {
    const { innerWidth: width } = window;
    if (width <= 600) {
      setDrawerOpen(false);
    }
  };

  const toggleColorMode = () => {
    colorMode.toggleColorMode();
  }

  if (loading) {
    return <BackdropLoading />;
  }

  return (
    <div className={classes.root}>
      <Drawer
        variant={drawerVariant}
        className={drawerOpen ? classes.drawerPaper : classes.drawerPaperClose}
        classes={{
          paper: clsx(
            classes.drawerPaper,
            !drawerOpen && classes.drawerPaperClose
          ),
        }}
        open={drawerOpen}
      >
        <div className={classes.toolbarIcon}>
          <Box style={{ display: "flex", alignItems: "center", gap: 10, paddingLeft: 8 }}>
            <Box style={{
              backgroundColor: theme.mode === 'dark' ? "#fff" : "#2563EB",
              borderRadius: 10,
              width: 40,
              height: 40,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}>
              <PhoneAndroidIcon style={{ color: theme.mode === 'dark' ? "#9e9e9e" : "#fff", fontSize: 22 }} />
            </Box>
            <Box>
              <Typography style={{ fontWeight: 700, fontSize: 13, lineHeight: 1.2, color: theme.palette.text.primary }}>Sistema de Chat</Typography>
              <Typography style={{ fontSize: 11, color: theme.palette.text.secondary, lineHeight: 1.2 }}>Pref. de Itaguaí</Typography>
            </Box>
          </Box>
          <IconButton onClick={() => setDrawerOpen(!drawerOpen)}>
            <ChevronLeftIcon />
          </IconButton>
        </div>
        <Divider />
        <List className={classes.containerWithScroll}>
          <MainListItems drawerClose={drawerClose} collapsed={!drawerOpen} />
        </List>
        <Divider />
      </Drawer>
      <UserModal
        open={userModalOpen}
        onClose={() => setUserModalOpen(false)}
        userId={user?.id}
      />
      <AppBar
        position="absolute"
        className={clsx(classes.appBar, drawerOpen && classes.appBarShift)}
        color="primary"
      >
        <Toolbar variant="dense" className={classes.toolbar}>
          <IconButton
            edge="start"
            style={{ color: "white" }}
            variant="contained"
            aria-label="open drawer"
            onClick={() => setDrawerOpen(!drawerOpen)}
            className={clsx(
              classes.menuButton,
              drawerOpen && classes.menuButtonHidden
            )}
          >
            <MenuIcon />
          </IconButton>

          <div className={classes.title}>
            <img src={logo} alt="logo" className={classes.headerLogo} />
          </div>

          {/* Ícones funcionais de volta ao header */}
          <IconButton onClick={handleRefreshPage} style={{ color: "white" }}>
            <CachedIcon />
          </IconButton>
          {user.id && <NotificationsPopOver volume={volume} />}
          <AnnouncementsPopover />
          <ChatPopover />

          {/* Botão do usuário */}
          <div>
            <IconButton
              aria-label="account of current user"
              aria-controls="menu-appbar"
              aria-haspopup="true"
              onClick={handleMenu}
              style={{ color: "white", padding: 6 }}
            >
              <Avatar style={{ width: 32, height: 32, backgroundColor: "rgba(255,255,255,0.25)", fontSize: 14, fontWeight: 700 }}>
                {(() => { const parts = user?.name?.trim().split(/[\s._-]+/) || []; return (parts[0]?.[0] || '').toUpperCase() + (parts.length > 1 ? (parts[parts.length - 1]?.[0] || '').toUpperCase() : ''); })()}
              </Avatar>
            </IconButton>

            {/* Dropdown principal */}
            <Menu
              id="menu-appbar"
              anchorEl={anchorEl}
              getContentAnchorEl={null}
              anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
              transformOrigin={{ vertical: "top", horizontal: "right" }}
              open={menuOpen}
              onClose={handleCloseMenu}
              PaperProps={{
                style: {
                  minWidth: 260,
                  borderRadius: 12,
                  boxShadow: theme.mode === 'dark' ? "0 8px 32px rgba(0,0,0,0.5)" : "0 8px 32px rgba(0,0,0,0.15)",
                  padding: 0,
                  overflow: "hidden",
                }
              }}
            >
              {/* Cabeçalho */}
              <Box style={{
                padding: "16px",
                display: "flex",
                alignItems: "center",
                gap: 12,
                borderBottom: `1px solid ${theme.mode === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)'}`,
              }}>
                <Avatar style={{
                  width: 44, height: 44,
                  backgroundColor: theme.palette.primary.main,
                  fontSize: 20, fontWeight: 700,
                }}>
                  {(() => { const parts = user?.name?.trim().split(/[\s._-]+/) || []; return (parts[0]?.[0] || '').toUpperCase() + (parts.length > 1 ? (parts[parts.length - 1]?.[0] || '').toUpperCase() : ''); })()}
                </Avatar>
                <Box>
                  <Typography style={{ fontWeight: 700, fontSize: 14, lineHeight: 1.3 }}>{user?.name}</Typography>
                  <Typography style={{ fontSize: 11, opacity: 0.6, lineHeight: 1.4 }}>{user?.email}</Typography>
                  {user?.company?.name && (
                    <Typography style={{ fontSize: 11, opacity: 0.6, lineHeight: 1.4 }}>
                      <span style={{ fontWeight: 600 }}>{i18n.t("mainDrawer.appBar.user.company")}: </span>{user?.company?.name}
                    </Typography>
                  )}
                </Box>
              </Box>

              {/* Volume */}
              <Box style={{ padding: "4px 8px", borderBottom: `1px solid ${theme.mode === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}` }}>
                <Box style={{ display: "flex", alignItems: "center", paddingLeft: 4 }}>
                  <NotificationsVolume setVolume={setVolume} volume={volume} iconColor={theme.palette.primary.main} />
                  <Typography style={{ fontSize: 13, fontWeight: 500, marginLeft: 4 }}>Volume</Typography>
                </Box>
              </Box>

              {/* Idioma */}
              <MenuItem
                onClick={(e) => setLangAnchor(e.currentTarget)}
                style={{ padding: "10px 16px" }}
              >
                <ListItemIcon style={{ minWidth: 36 }}>
                  <LanguageOutlined fontSize="small" style={{ color: theme.palette.primary.main }} />
                </ListItemIcon>
                <ListItemText
                  primary="Idioma"
                  secondary={currentLang === 'pt' ? '🇧🇷 Português' : currentLang === 'en' ? '🇺🇸 English' : '🇪🇸 Español'}
                  primaryTypographyProps={{ style: { fontSize: 13, fontWeight: 500 } }}
                  secondaryTypographyProps={{ style: { fontSize: 12 } }}
                />
                <Typography style={{ fontSize: 12, opacity: 0.5 }}>›</Typography>
              </MenuItem>

              {/* Submenu de idioma */}
              <Menu
                anchorEl={langAnchor}
                open={Boolean(langAnchor)}
                onClose={() => setLangAnchor(null)}
                getContentAnchorEl={null}
                anchorOrigin={{ vertical: "top", horizontal: "left" }}
                transformOrigin={{ vertical: "top", horizontal: "right" }}
                PaperProps={{ style: { borderRadius: 10, boxShadow: theme.mode === 'dark' ? "0 4px 20px rgba(0,0,0,0.5)" : "0 4px 20px rgba(0,0,0,0.15)", minWidth: 180 } }}
              >
                {[{ code: 'pt', flag: '🇧🇷', label: 'Português (BR)' },
                { code: 'en', flag: '🇺🇸', label: 'English' },
                { code: 'es', flag: '🇪🇸', label: 'Español' }].map(l => (
                  <MenuItem
                    key={l.code}
                    selected={currentLang === l.code}
                    onClick={() => handleLangChange(l.code)}
                    style={{ padding: "10px 16px", gap: 10, backgroundColor: currentLang === l.code ? (theme.mode === 'dark' ? 'rgba(96,165,250,0.15)' : 'rgba(37,99,235,0.08)') : 'transparent' }}
                  >
                    <span style={{ fontSize: 20 }}>{l.flag}</span>
                    <Typography style={{ fontSize: 13, fontWeight: currentLang === l.code ? 600 : 400 }}>{l.label}</Typography>
                  </MenuItem>
                ))}
              </Menu>

              {/* Tema */}
              <MenuItem onClick={toggleColorMode} style={{ padding: "10px 16px" }}>
                <ListItemIcon style={{ minWidth: 36 }}>
                  {theme.mode === 'dark'
                    ? <Brightness7Icon fontSize="small" style={{ color: "#F59E0B" }} />
                    : <Brightness4Icon fontSize="small" style={{ color: "#6366f1" }} />}
                </ListItemIcon>
                <ListItemText
                  primary={theme.mode === 'dark' ? 'Modo Claro' : 'Modo Escuro'}
                  primaryTypographyProps={{ style: { fontSize: 13, fontWeight: 500 } }}
                />
              </MenuItem>

              <Divider style={{ margin: "4px 0" }} />

              {/* Perfil */}
              <MenuItem onClick={handleOpenUserModal} style={{ padding: "10px 16px" }}>
                <ListItemIcon style={{ minWidth: 36 }}>
                  <PersonIcon fontSize="small" style={{ color: theme.palette.primary.main }} />
                </ListItemIcon>
                <ListItemText
                  primary={i18n.t("mainDrawer.appBar.user.profile")}
                  primaryTypographyProps={{ style: { fontSize: 13, fontWeight: 500 } }}
                />
              </MenuItem>

              {/* Sair */}
              <MenuItem onClick={handleClickLogout} style={{ padding: "10px 16px" }}>
                <ListItemIcon style={{ minWidth: 36 }}>
                  <ExitToAppIcon fontSize="small" style={{ color: "#ef4444" }} />
                </ListItemIcon>
                <ListItemText
                  primary={i18n.t("mainDrawer.appBar.user.logout")}
                  primaryTypographyProps={{ style: { fontSize: 13, fontWeight: 500, color: "#ef4444" } }}
                />
              </MenuItem>
            </Menu>
          </div>
        </Toolbar>
      </AppBar>
      <main className={classes.content}>
        <div className={classes.appBarSpacer} />

        {children ? children : null}
      </main>
    </div>
  );
};

export default LoggedInLayout;
