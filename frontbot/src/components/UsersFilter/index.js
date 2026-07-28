import { Box, Chip, TextField } from "@material-ui/core";
import Autocomplete from "@material-ui/lab/Autocomplete";
import React, { useEffect, useState } from "react";
import toastError from "../../errors/toastError";
import api from "../../services/api";
import { i18n } from "../../translate/i18n";

export function UsersFilter({ onFiltered }) {
  const [users, setUsers] = useState([]);
  const [selecteds, setSelecteds] = useState([]);

  useEffect(() => {
    async function fetchData() {
      await loadUsers();
    }
    fetchData();
  }, []);

  const loadUsers = async () => {
    try {
      const { data } = await api.get(`/users/`, {
        params: { pageNumber: 1 },
      });
      setUsers(data.users);
    } catch (err) {
      toastError(err);
    }
  };

  const onChange = async (value) => {
    setSelecteds(value);
    onFiltered(value);
  };

  return (
    <Box style={{ padding: 10 }}>
      <Autocomplete
        multiple
        size="small"
        options={users}
        value={selecteds}
        onChange={(e, v, r) => onChange(v)}
        getOptionLabel={(option) => option.name}
        renderTags={(value, getTagProps) =>
          value.map((option, index) => (
            <Chip
              variant="outlined"
              label={option.name}
              {...getTagProps({ index })}
              size="small"
            />
          ))
        }
        renderInput={(params) => (
          <TextField
            {...params}
            variant="outlined"
            placeholder={i18n.t("tickets.filters.users") || "Usuários"}
          />
        )}
      />
    </Box>
  );
}
