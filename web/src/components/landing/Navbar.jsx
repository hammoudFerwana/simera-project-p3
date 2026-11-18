import {
  AppBar,
  Box,
  Button,
  Container,
  Stack,
  Toolbar,
  Typography
} from '@mui/material';

import AutoAwesomeRoundedIcon from '@mui/icons-material/AutoAwesomeRounded';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';

export default function Navbar() {
  return (
    <AppBar
      position="absolute"
      elevation={0}
      color="transparent"
      sx={{
        top: 0,
        left: 0,
        right: 0,
        bgcolor: 'background.paper',
        backgroundImage: 'none',
        borderBottom: '1px solid',
        borderColor: 'divider',
        zIndex: (theme) => theme.zIndex.appBar
      }}
    >
      <Container maxWidth="lg">
        <Toolbar
          disableGutters
          sx={{
            minHeight: { xs: 68, md: 82 },
            justifyContent: 'space-between',
            gap: 2
          }}
        >
          {/* Brand */}
          <Stack
            direction="row"
            alignItems="center"
            spacing={1.2}
            sx={{ flexShrink: 0 }}
          >
            <Box
              sx={{
                width: { xs: 36, md: 40 },
                height: { xs: 36, md: 40 },
                borderRadius: 2.5,
                bgcolor: 'primary.main',
                color: 'primary.contrastText',
                display: 'grid',
                placeItems: 'center',
                boxShadow: (theme) =>
                  `0 6px 16px ${theme.palette.primary.main}35`
              }}
            >
              <AutoAwesomeRoundedIcon />
            </Box>

            <Typography
              sx={{
                fontWeight: 800,
                fontSize: { xs: 19, md: 23 },
                letterSpacing: '-0.8px',
                color: 'text.primary'
              }}
            >
              TalentVault
            </Typography>
          </Stack>

          {/* Authentication actions */}
          <Stack
            direction="row"
            spacing={{ xs: 0.5, sm: 1.5 }}
            alignItems="center"
          >
            <Button
              component="a"
              href="/auth/login"
              color="inherit"
              sx={{
                color: 'text.primary',
                fontWeight: 700,
                fontSize: { xs: 12, sm: 14 },
                minWidth: 'auto',
                px: { xs: 1, sm: 2 }
              }}
            >
              Log in
            </Button>

            <Button
              component="a"
              href="/auth/register"
              variant="contained"
              endIcon={
                <ArrowForwardRoundedIcon
                  sx={{ fontSize: { xs: 15, sm: 18 } }}
                />
              }
              sx={{
                borderRadius: 2.5,
                px: { xs: 1.5, sm: 2.5 },
                py: { xs: 1, sm: 1.2 },
                fontWeight: 700,
                fontSize: { xs: 11, sm: 14 },
                minWidth: 'auto',
                boxShadow: 'none',
                whiteSpace: 'nowrap'
              }}
            >
              Get started
            </Button>
          </Stack>
        </Toolbar>
      </Container>
    </AppBar>
  );
}
