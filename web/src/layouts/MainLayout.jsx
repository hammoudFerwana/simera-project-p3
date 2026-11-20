
import { useState } from "react";

import {
  Box,
  IconButton,
  Toolbar,
  Typography
} from "@mui/material";

import MenuRoundedIcon from "@mui/icons-material/MenuRounded";

import { Outlet, useOutletContext } from "react-router-dom";

import Sidebar from "../components/layout/Sidebar";

export default function MainLayout() {
  const { user } = useOutletContext();

  const [mobileOpen, setMobileOpen] = useState(false);

  const handleOpenSidebar = () => {
    setMobileOpen(true);
  };

  const handleCloseSidebar = () => {
    setMobileOpen(false);
  };

  return (
    <Box sx={{ display: "flex", minHeight: "100vh" }}>
      <Sidebar
        role={user.role}
        mobileOpen={mobileOpen}
        onClose={handleCloseSidebar}
      />

      <Box
        component="main"
        sx={{
          flexGrow: 1,
          minWidth: 0,
          backgroundColor: "background.default",
          p: { xs: 2, sm: 3 },
        }}
      >
        {/* Mobile Header */}
        <Toolbar
          disableGutters
          sx={{
            display: { xs: "flex", md: "none" },
            mb: 2,
            minHeight: "48px !important",
            gap: 1,
          }}
        >
          <IconButton
            onClick={handleOpenSidebar}
            aria-label="Open navigation menu"
            color="primary"
          >
            <MenuRoundedIcon />
          </IconButton>

          <Typography variant="h6" fontWeight={800}>
            Talent
            <Box component="span" sx={{ color: "primary.main" }}>
              Vault
            </Box>
          </Typography>
        </Toolbar>

        <Outlet />
      </Box>
    </Box>
  );
}
