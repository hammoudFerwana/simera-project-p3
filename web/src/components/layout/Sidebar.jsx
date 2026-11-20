
import {
  Drawer,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Typography,
  Box,
  Divider,
  CircularProgress
} from '@mui/material';

import PsychologyAltRoundedIcon from "@mui/icons-material/PsychologyAltRounded";
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import DashboardRoundedIcon from '@mui/icons-material/DashboardRounded';
import FolderRoundedIcon from '@mui/icons-material/FolderRounded';
import PeopleAltRoundedIcon from '@mui/icons-material/PeopleAltRounded';
import RateReviewRoundedIcon from '@mui/icons-material/RateReviewRounded';
import LogoutRoundedIcon from '@mui/icons-material/LogoutRounded';

import { NavLink } from 'react-router-dom';
import { navigationLinks } from '../../constants/navigation';
import useLogout from '../../hooks/useLogout';

const DRAWER_WIDTH = 250;

const navigationIcons = {
  Dashboard: DashboardRoundedIcon,
  'My Files': FolderRoundedIcon,
  Candidate: PeopleAltRoundedIcon,
  'Review Queue': RateReviewRoundedIcon,
  "Unknown Skills": PsychologyAltRoundedIcon,
};

export default function Sidebar({
  role,
  mobileOpen,
  onClose
}) {
  const links = navigationLinks[role] ?? [];

  const { mutate: logout, isPending } = useLogout();

  const handleLogout = () => {
    logout();
  };

  const drawerContent = (
    <>
      {/* Brand */}
      <Box sx={{ px: 2, pt: 3, pb: 2.5 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Box
            sx={{
              width: 42,
              height: 42,
              borderRadius: 2.5,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'linear-gradient(135deg, #3B82F6, #1D4ED8)',
              boxShadow: '0 4px 12px rgba(37,99,235,0.3)'
            }}
          >
            <AutoAwesomeIcon sx={{ color: '#fff', fontSize: 24 }} />
          </Box>

          <Box>
            <Typography
              variant="h6"
              fontWeight={800}
              sx={{ color: '#fff', lineHeight: 1.2 }}
            >
              Talent
              <Box component="span" sx={{ color: '#60A5FA' }}>
                Vault
              </Box>
            </Typography>

            <Typography
              variant="caption"
              sx={{ color: '#94A3B8', letterSpacing: 0.5 }}
            >
              Find · Manage · Grow
            </Typography>
          </Box>
        </Box>
      </Box>

      <Divider
        sx={{
          borderColor: 'rgba(255,255,255,0.12)',
          mx: 1,
          mb: 2
        }}
      />

      {/* Navigation */}
      <List sx={{ px: 1 }}>
        {links.map(({ label, path }) => {
          const Icon = navigationIcons[label];

          return (
            <ListItemButton
              key={path}
              component={NavLink}
              to={path}
              end
              onClick={onClose}
              sx={{
                borderRadius: 2,
                mb: 1,
                py: 1.3,
                px: 2,
                color: '#CBD5E1',
                transition: 'all 0.2s ease',

                '&.active': {
                  backgroundColor: 'rgba(59,130,246,0.18)',
                  color: '#60A5FA',

                  '& .MuiListItemText-primary': {
                    fontWeight: 700
                  }
                },

                '&:hover': {
                  backgroundColor: 'rgba(255,255,255,0.08)'
                }
              }}
            >
              {Icon && (
                <ListItemIcon
                  sx={{
                    minWidth: 38,
                    color: 'inherit'
                  }}
                >
                  <Icon fontSize="small" />
                </ListItemIcon>
              )}

              <ListItemText
                primary={label}
                primaryTypographyProps={{
                  fontSize: 14,
                  fontWeight: 500
                }}
              />
            </ListItemButton>
          );
        })}
      </List>

      <Box sx={{ mt: 'auto' }}>
        <Divider
          sx={{
            borderColor: 'rgba(255,255,255,0.12)',
            mx: 1,
            mb: 2
          }}
        />

        <List sx={{ px: 1 }}>
          <ListItemButton
            onClick={handleLogout}
            disabled={isPending}
            sx={{
              borderRadius: 2,
              py: 1.3,
              px: 2,
              color: '#CBD5E1',
              '&:hover': {
                backgroundColor: 'rgba(255,255,255,0.08)'
              }
            }}
          >
            <ListItemIcon sx={{ minWidth: 38, color: 'inherit' }}>
              {isPending ? (
                <CircularProgress size={18} color="inherit" />
              ) : (
                <LogoutRoundedIcon fontSize="small" />
              )}
            </ListItemIcon>

            <ListItemText
              primary="Logout"
              primaryTypographyProps={{
                fontSize: 14,
                fontWeight: 500
              }}
            />
          </ListItemButton>
        </List>
      </Box>
    </>
  );

  return (
    <>
      {/* Desktop Sidebar */}
      <Drawer
        variant="permanent"
        sx={{
          display: { xs: 'none', md: 'block' },
          width: DRAWER_WIDTH,
          flexShrink: 0,
          '& .MuiDrawer-paper': {
            width: DRAWER_WIDTH,
            boxSizing: 'border-box',
            backgroundColor: (theme) => theme.palette.sidebar.main,
            color: (theme) => theme.palette.sidebar.contrastText,
            border: 'none',
            padding: 2
          }
        }}
      >
        {drawerContent}
      </Drawer>

      {/* Mobile Sidebar */}
      <Drawer
        variant="temporary"
        open={mobileOpen}
        onClose={onClose}
        ModalProps={{
          keepMounted: true
        }}
        sx={{
          display: { xs: 'block', md: 'none' },
          '& .MuiDrawer-paper': {
            width: DRAWER_WIDTH,
            boxSizing: 'border-box',
            backgroundColor: (theme) => theme.palette.sidebar.main,
            color: (theme) => theme.palette.sidebar.contrastText,
            border: 'none',
            padding: 2
          }
        }}
      >
        {drawerContent}
      </Drawer>
    </>
  );
}

export { DRAWER_WIDTH };
