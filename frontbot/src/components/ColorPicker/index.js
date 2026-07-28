import { Dialog, DialogActions, Button } from "@material-ui/core";
import React, { useState } from "react";

import { SketchPicker } from "react-color";

const ColorPicker = ({ onChange, currentColor, handleClose, open }) => {
	const [selectedColor, setSelectedColor] = useState(currentColor || "#3f51b5");

	const handleChange = color => {
		setSelectedColor(color.hex);
		onChange(color.hex);
	};

	const handleConfirm = () => {
		onChange(selectedColor);
		handleClose();
	};

	return (
		<Dialog
			onClose={handleClose}
			aria-labelledby="simple-dialog-title"
			open={open}
		>
			<div style={{ padding: 20 }}>
				<SketchPicker
					width={"100%"}
					color={selectedColor}
					onChange={handleChange}
					disableAlpha={true}
				/>
			</div>
			<DialogActions>
				<Button onClick={handleClose} color="secondary">
					Cancelar
				</Button>
				<Button onClick={handleConfirm} color="primary" variant="contained">
					Confirmar
				</Button>
			</DialogActions>
		</Dialog>
	);
};

export default ColorPicker;
