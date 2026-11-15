
import { Box } from "@mui/material";
import { Outlet, useOutletContext } from "react-router-dom";

import Sidebar from "../components/layout/Sidebar";

export default function MainLayout() {
  const { user } = useOutletContext();

  return (
    <Box sx={{ display: "flex", minHeight: "100vh" }}>
      <Sidebar role={user.role} />

      <Box
        component="main"
        sx={{
          flexGrow: 1,
          minWidth: 0,
          backgroundColor: "background.default",
          p: 3,
        }}
      >
        <Outlet />
      </Box>
    </Box>
  );
}
