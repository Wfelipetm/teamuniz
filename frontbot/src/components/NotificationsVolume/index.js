import React, { useState, useRef } from "react";

import Popover from "@material-ui/core/Popover";
import IconButton from "@material-ui/core/IconButton";
import List from "@material-ui/core/List";
import { makeStyles, withStyles } from "@material-ui/core/styles";
import VolumeUpIcon from "@material-ui/icons/VolumeUp";
import VolumeDownIcon from "@material-ui/icons/VolumeDown";
import VolumeMuteIcon from "@material-ui/icons/VolumeMute";
import Typography from "@material-ui/core/Typography";

import { Grid, Slider, Box } from "@material-ui/core";

const ThemedSlider = withStyles((theme) => ({
    root: { color: theme.palette.primary.main, height: 4 },
    thumb: {
        height: 16,
        width: 16,
        backgroundColor: "#fff",
        border: `2px solid ${theme.palette.primary.main}`,
        marginTop: -6,
        marginLeft: -8,
        "&:hover": { boxShadow: "0 0 0 6px rgba(37,99,235,0.16)" },
    },
    track: { height: 4, borderRadius: 4 },
    rail: { height: 4, borderRadius: 4, opacity: 0.3 },
}))(Slider);

const useStyles = makeStyles((theme) => ({
    tabContainer: {
        padding: "16px 20px",
    },
    popoverPaper: {
        width: 260,
        borderRadius: 12,
        boxShadow: theme.mode === 'dark' ? "0 8px 32px rgba(0,0,0,0.5)" : "0 8px 32px rgba(0,0,0,0.15)",
        overflow: "hidden",
    },
    icons: {
        color: "inherit",
    },
    iconPrimary: {
        color: theme.palette.primary.main,
    },
    title: {
        fontWeight: 600,
        fontSize: 13,
        padding: "12px 16px 4px",
        opacity: 0.6,
        textTransform: "uppercase",
        letterSpacing: 1,
    },
    percent: {
        fontSize: 12,
        fontWeight: 600,
        marginTop: 4,
        color: theme.palette.primary.main,
    },
}));

const NotificationsVolume = ({ volume, setVolume, iconColor }) => {
    const classes = useStyles();
    const iconStyle = iconColor ? { color: iconColor } : {};

    const anchorEl = useRef();
    const [isOpen, setIsOpen] = useState(false);

    const handleClick = () => {
        setIsOpen((prevState) => !prevState);
    };

    const handleClickAway = () => {
        setIsOpen(false);
    };

    const handleVolumeChange = (value) => {
        setVolume(value);
        localStorage.setItem("volume", value);
    };

    const volumePercent = Math.round(volume * 100);

    return (
        <>
            <IconButton
                style={iconColor ? { color: iconColor } : {}}
                className={iconColor ? undefined : classes.icons}
                onClick={handleClick}
                ref={anchorEl}
                aria-label="Open Notifications"
            >
                {volume === 0 ? <VolumeMuteIcon color="inherit" /> : <VolumeUpIcon color="inherit" />}
            </IconButton>
            <Popover
                disableScrollLock
                open={isOpen}
                anchorEl={anchorEl.current}
                anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
                transformOrigin={{ vertical: "top", horizontal: "right" }}
                classes={{ paper: classes.popoverPaper }}
                onClose={handleClickAway}
            >
                <Typography className={classes.title}>Volume de Notificações</Typography>

                <Box style={{ padding: "8px 20px 16px" }}>
                    <Grid container spacing={2} alignItems="center">
                        <Grid item>
                            <VolumeMuteIcon className={classes.iconPrimary} style={{ fontSize: 20 }} />
                        </Grid>
                        <Grid item xs>
                            <ThemedSlider
                                value={volume}
                                aria-labelledby="volume-slider"
                                step={0.1}
                                min={0}
                                max={1}
                                onChange={(e, value) => handleVolumeChange(value)}
                            />
                        </Grid>
                        <Grid item>
                            <VolumeUpIcon className={classes.iconPrimary} style={{ fontSize: 20 }} />
                        </Grid>
                    </Grid>
                    <Typography align="center" className={classes.percent}>
                        {volumePercent}%
                    </Typography>
                </Box>
            </Popover>
        </>
    );
};

export default NotificationsVolume;
