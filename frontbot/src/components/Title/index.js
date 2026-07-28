import React from "react";
import Typography from "@material-ui/core/Typography";

const Title = ({ children }) => {
  return (
    <Typography component="h1" variant="h5" style={{ fontWeight: 600 }} noWrap>
      {children}
    </Typography>
  );
};

export default Title;
