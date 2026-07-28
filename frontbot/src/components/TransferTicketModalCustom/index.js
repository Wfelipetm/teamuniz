import React, { useEffect, useState } from "react";
import { toast } from "react-toastify";
import { useHistory } from "react-router-dom";

import { makeStyles } from "@material-ui/core/styles";
import Button from "@material-ui/core/Button";
import Dialog from "@material-ui/core/Dialog";
import DialogActions from "@material-ui/core/DialogActions";
import DialogContent from "@material-ui/core/DialogContent";
import DialogTitle from "@material-ui/core/DialogTitle";
import CircularProgress from "@material-ui/core/CircularProgress";
import Autocomplete from "@material-ui/lab/Autocomplete";
import TextField from "@material-ui/core/TextField";
import { green } from "@material-ui/core/colors";

import api from "../../services/api";
import toastError from "../../errors/toastError";
import { i18n } from "../../translate/i18n";
import QueueSelect from "../QueueSelect";

const useStyles = makeStyles((theme) => ({
	maxWidth: {
		width: "100%",
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

const TransferTicketModalCustom = ({ modalOpen, onClose, ticketid }) => {
	const classes = useStyles();
	const history = useHistory();

	const [loading, setLoading] = useState(false);
	const [options, setOptions] = useState([]);
	const [searchParam, setSearchParam] = useState("");
	const [selectedUser, setSelectedUser] = useState(null);
	const [selectedQueue, setSelectedQueue] = useState("");

	useEffect(() => {
		if (!modalOpen) return;
		setLoading(true);
		const delayDebounceFn = setTimeout(() => {
			const fetchUsers = async () => {
				try {
					const { data } = await api.get("/users/", {
						params: { searchParam },
					});
					setOptions(data.users);
				} catch (err) {
					toastError(err);
				} finally {
					setLoading(false);
				}
			};
			fetchUsers();
		}, 500);
		return () => clearTimeout(delayDebounceFn);
	}, [searchParam, modalOpen]);

	const handleClose = () => {
		onClose();
		setSelectedUser(null);
		setSelectedQueue("");
		setSearchParam("");
	};

	const handleSaveTicket = async (e) => {
		e.preventDefault();
		if (!ticketid) return;
		setLoading(true);
		try {
			await api.put(`/tickets/${ticketid}`, {
				status: "open",
				userId: selectedUser?.id || null,
				queueId: selectedQueue || null,
			});
			toast.success(i18n.t("transferTicketModal.success") || "Ticket transferido com sucesso!");
			history.push(`/tickets/`);
		} catch (err) {
			toastError(err);
		}
		setLoading(false);
		handleClose();
	};

	return (
		<Dialog open={modalOpen} onClose={handleClose} maxWidth="xs" fullWidth>
			<form onSubmit={handleSaveTicket}>
				<DialogTitle id="form-dialog-title">
					{i18n.t("transferTicketModal.title") || "Transferir Ticket"}
				</DialogTitle>
				<DialogContent dividers>
					<Autocomplete
						className={classes.maxWidth}
						options={options}
						loading={loading}
						clearOnBlur
						autoHighlight
						getOptionLabel={(option) => option.name}
						value={selectedUser}
						onChange={(e, newValue) => setSelectedUser(newValue)}
						onInputChange={(e, value) => setSearchParam(value)}
						renderInput={(params) => (
							<TextField
								{...params}
								label={i18n.t("transferTicketModal.fieldLabel") || "Selecione um usuário"}
								variant="outlined"
								autoFocus
								margin="dense"
							/>
						)}
					/>
					<QueueSelect
						multiple={false}
						selectedQueueIds={selectedQueue}
						onChange={(value) => setSelectedQueue(value)}
					/>
				</DialogContent>
				<DialogActions>
					<Button
						onClick={handleClose}
						color="secondary"
						disabled={loading}
						variant="outlined"
					>
						{i18n.t("transferTicketModal.buttons.cancel") || "Cancelar"}
					</Button>
					<Button
						type="submit"
						color="primary"
						disabled={loading}
						variant="contained"
						className={classes.btnWrapper}
					>
						{i18n.t("transferTicketModal.buttons.ok") || "Transferir"}
						{loading && (
							<CircularProgress size={24} className={classes.buttonProgress} />
						)}
					</Button>
				</DialogActions>
			</form>
		</Dialog>
	);
};

export default TransferTicketModalCustom;
