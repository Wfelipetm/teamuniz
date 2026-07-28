import React, { useState, useEffect, useContext } from "react";

import * as Yup from "yup";
import { Formik, Form, Field } from "formik";
import { toast } from "react-toastify";

import { makeStyles } from "@material-ui/core/styles";
import { green } from "@material-ui/core/colors";
import Button from "@material-ui/core/Button";
import TextField from "@material-ui/core/TextField";
import Dialog from "@material-ui/core/Dialog";
import DialogActions from "@material-ui/core/DialogActions";
import DialogContent from "@material-ui/core/DialogContent";
import DialogTitle from "@material-ui/core/DialogTitle";
import CircularProgress from "@material-ui/core/CircularProgress";
import Switch from "@material-ui/core/Switch";
import FormControlLabel from "@material-ui/core/FormControlLabel";
import Tabs from "@material-ui/core/Tabs";
import Tab from "@material-ui/core/Tab";
import Box from "@material-ui/core/Box";

import { i18n } from "../../translate/i18n";

import api from "../../services/api";
import toastError from "../../errors/toastError";
import QueueSelect from "../QueueSelect";
import { AuthContext } from "../../context/Auth/AuthContext";

const useStyles = makeStyles((theme) => ({
	root: {
		display: "flex",
		flexWrap: "wrap",
	},
	multFieldLine: {
		display: "flex",
		"& > *:not(:last-child)": {
			marginRight: theme.spacing(1),
		},
	},
	btnWrapper: {
		position: "relative",
	},
	buttonProgress: {
		color: green[500],
		position: "absolute",
		top: "50%",
		left: "50%",
		marginTop: -12,
		marginLeft: -12,
	},
}));

const TabPanel = ({ children, value, name }) => {
	if (value !== name) return null;
	return <Box style={{ paddingTop: 8 }}>{children}</Box>;
};

const SessionSchema = Yup.object().shape({
	name: Yup.string()
		.min(2, i18n.t("whatsappModal.formErrors.name.short"))
		.max(50, i18n.t("whatsappModal.formErrors.name.long"))
		.required(i18n.t("whatsappModal.formErrors.name.required")),
});

const WhatsAppModal = ({ open, onClose, whatsAppId }) => {
	const classes = useStyles();
	const isMounted = React.useRef(true);
	const { user } = useContext(AuthContext);

	const initialState = {
		name: "",
		greetingMessage: "",
		complationMessage: "",
		outOfHoursMessage: "",
		isDefault: false,
		expiresTicket: 0,
		expiresInactiveMessage: "",
	};

	const [whatsApp, setWhatsApp] = useState(initialState);
	const [selectedQueueIds, setSelectedQueueIds] = useState([]);
	const [tab, setTab] = useState("general");

	useEffect(() => {
		isMounted.current = true;
		return () => {
			isMounted.current = false;
		};
	}, []);

	useEffect(() => {
		const fetchSession = async () => {
			if (!whatsAppId) return;
			try {
				const { data } = await api.get(`/whatsapp/${whatsAppId}`);
				if (isMounted.current) {
					setWhatsApp((prevState) => ({ ...prevState, ...data }));
					const whatsQueueIds = data.queues?.map((queue) => queue.id) || [];
					setSelectedQueueIds(whatsQueueIds);
				}
			} catch (err) {
				toastError(err);
			}
		};

		if (open) {
			fetchSession();
		}
	}, [whatsAppId, open]);

	const handleClose = () => {
		onClose();
		setWhatsApp(initialState);
		setSelectedQueueIds([]);
		setTab("general");
	};

	const handleSaveWhatsApp = async (values) => {
		const whatsappData = { ...values, queueIds: selectedQueueIds };
		try {
			if (whatsAppId) {
				await api.put(`/whatsapp/${whatsAppId}`, whatsappData);
			} else {
				await api.post("/whatsapp", whatsappData);
			}
			toast.success(i18n.t("whatsappModal.success"));
		} catch (err) {
			toastError(err);
		}
		handleClose();
	};

	return (
		<div className={classes.root}>
			<Dialog
				open={open}
				onClose={handleClose}
				maxWidth="sm"
				fullWidth
				scroll="paper"
			>
				<DialogTitle>
					{whatsAppId
						? i18n.t("whatsappModal.title.edit")
						: i18n.t("whatsappModal.title.add")}
				</DialogTitle>
				<Formik
					initialValues={whatsApp}
					enableReinitialize={true}
					validationSchema={SessionSchema}
					onSubmit={(values, actions) => {
						setTimeout(() => {
							handleSaveWhatsApp(values);
							actions.setSubmitting(false);
						}, 400);
					}}
				>
					{({ values, touched, errors, isSubmitting, setFieldValue }) => (
						<Form>
							<DialogContent dividers>
								<Tabs
									value={tab}
									indicatorColor="primary"
									textColor="primary"
									onChange={(e, v) => setTab(v)}
								>
									<Tab
										label={i18n.t("whatsappModal.tabs.general")}
										value="general"
									/>
									<Tab
										label={i18n.t("whatsappModal.tabs.messages")}
										value="messages"
									/>
								</Tabs>
								<TabPanel value={tab} name="general">
									<div className={classes.multFieldLine}>
										<Field
											as={TextField}
											label={i18n.t("whatsappModal.form.name")}
											autoFocus
											name="name"
											error={touched.name && Boolean(errors.name)}
											helperText={touched.name && errors.name}
											variant="outlined"
											margin="dense"
											fullWidth
										/>
										<FormControlLabel
											control={
												<Switch
													checked={values.isDefault}
													onChange={() =>
														setFieldValue("isDefault", !values.isDefault)
													}
													color="primary"
												/>
											}
											label={i18n.t("whatsappModal.form.default")}
										/>
									</div>
									<QueueSelect
										selectedQueueIds={selectedQueueIds}
										onChange={(values) => setSelectedQueueIds(values)}
									/>
									<Field
										as={TextField}
										label={i18n.t("whatsappModal.form.expiresTicket")}
										name="expiresTicket"
										type="number"
										variant="outlined"
										margin="dense"
										fullWidth
									/>
								</TabPanel>
								<TabPanel value={tab} name="messages">
									<Field
										as={TextField}
										label={i18n.t("whatsappModal.form.greetingMessage")}
										name="greetingMessage"
										multiline
										minRows={3}
										variant="outlined"
										margin="dense"
										fullWidth
									/>
									<Field
										as={TextField}
										label={i18n.t("whatsappModal.form.complationMessage")}
										name="complationMessage"
										multiline
										minRows={3}
										variant="outlined"
										margin="dense"
										fullWidth
									/>
									<Field
										as={TextField}
										label={i18n.t("whatsappModal.form.outOfHoursMessage")}
										name="outOfHoursMessage"
										multiline
										minRows={3}
										variant="outlined"
										margin="dense"
										fullWidth
									/>
									<Field
										as={TextField}
										label={i18n.t("whatsappModal.form.expiresInactiveMessage")}
										name="expiresInactiveMessage"
										multiline
										minRows={2}
										variant="outlined"
										margin="dense"
										fullWidth
									/>
								</TabPanel>
							</DialogContent>
							<DialogActions>
								<Button
									onClick={handleClose}
									color="secondary"
									disabled={isSubmitting}
									variant="outlined"
								>
									{i18n.t("whatsappModal.buttons.cancel")}
								</Button>
								<Button
									type="submit"
									color="primary"
									disabled={isSubmitting}
									variant="contained"
									className={classes.btnWrapper}
								>
									{whatsAppId
										? i18n.t("whatsappModal.buttons.okEdit")
										: i18n.t("whatsappModal.buttons.okAdd")}
									{isSubmitting && (
										<CircularProgress
											size={24}
											className={classes.buttonProgress}
										/>
									)}
								</Button>
							</DialogActions>
						</Form>
					)}
				</Formik>
			</Dialog>
		</div>
	);
};

export default WhatsAppModal;
