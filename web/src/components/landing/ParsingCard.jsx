import { Avatar, Box, Chip, Paper, Stack, Typography } from '@mui/material';

import PictureAsPdfRoundedIcon from '@mui/icons-material/PictureAsPdfRounded';
import LinkedInIcon from '@mui/icons-material/LinkedIn';
import DataObjectRoundedIcon from '@mui/icons-material/DataObjectRounded';
import AutoAwesomeRoundedIcon from '@mui/icons-material/AutoAwesomeRounded';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import PersonRoundedIcon from '@mui/icons-material/PersonRounded';

const floatAnimation = {
  animation: 'float 5s ease-in-out infinite',
  '@keyframes float': {
    '0%, 100%': { transform: 'translateY(0px)' },
    '50%': { transform: 'translateY(-12px)' }
  }
};

const pulseAnimation = {
  animation: 'pulse 2.5s ease-in-out infinite',
  '@keyframes pulse': {
    '0%, 100%': { opacity: 0.55, transform: 'scale(0.96)' },
    '50%': { opacity: 1, transform: 'scale(1.04)' }
  }
};

export default function ParsingCard() {
  return (
    <Box
      sx={{
        position: 'relative',
        width: '100%',
        maxWidth: 570,
        minHeight: { xs: 420, sm: 490 },
        mx: 'auto',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        isolation: 'isolate'
      }}
    >
      {/* Background glow */}
      <Box
        sx={{
          position: 'absolute',
          width: 330,
          height: 330,
          borderRadius: '50%',
          background: (theme) =>
            `radial-gradient(circle, ${theme.palette.primary.main}22 0%, transparent 70%)`,
          filter: 'blur(12px)',
          zIndex: -1,
          ...pulseAnimation
        }}
      />

      {/* Decorative orbit */}
      <Box
        sx={{
          position: 'absolute',
          width: { xs: 290, sm: 390 },
          height: { xs: 290, sm: 390 },
          border: '1px dashed',
          borderColor: 'divider',
          borderRadius: '50%',
          opacity: 0.65
        }}
      />

      {/* CV source */}
      <Paper
        elevation={0}
        sx={{
          position: 'absolute',
          top: { xs: 35, sm: 42 },
          left: { xs: 0, sm: 12 },
          p: 1.5,
          width: 150,
          border: '1px solid',
          borderColor: 'divider',
          borderRadius: 3,
          bgcolor: 'background.paper',
          boxShadow: '0 14px 35px rgba(15, 23, 42, 0.08)',
          zIndex: 2,
          ...floatAnimation
        }}
      >
        <Stack direction="row" spacing={1} alignItems="center">
          <Avatar
            sx={{
              bgcolor: '#FEE2E2',
              color: '#DC2626',
              width: 35,
              height: 35,
              borderRadius: 2
            }}
          >
            <PictureAsPdfRoundedIcon fontSize="small" />
          </Avatar>
          <Box>
            <Typography fontWeight={700} fontSize={12}>
              Resume.pdf
            </Typography>
            <Typography color="text.secondary" fontSize={10}>
              CV document
            </Typography>
          </Box>
        </Stack>
        <Stack spacing={0.7} sx={{ mt: 1.5 }}>
          {[85, 65, 75].map((width) => (
            <Box
              key={width}
              sx={{
                height: 4,
                width: `${width}%`,
                borderRadius: 5,
                bgcolor: 'action.hover'
              }}
            />
          ))}
        </Stack>
      </Paper>

      {/* LinkedIn source */}
      <Paper
        elevation={0}
        sx={{
          position: 'absolute',
          top: { xs: 125, sm: 125 },
          right: { xs: 0, sm: 0 },
          p: 1.5,
          width: 155,
          border: '1px solid',
          borderColor: 'divider',
          borderRadius: 3,
          bgcolor: 'background.paper',
          boxShadow: '0 14px 35px rgba(15, 23, 42, 0.08)',
          zIndex: 2,
          animation: 'float 5s ease-in-out 1.2s infinite',
          '@keyframes float': {
            '0%, 100%': { transform: 'translateY(0px)' },
            '50%': { transform: 'translateY(-12px)' }
          }
        }}
      >
        <Stack direction="row" spacing={1} alignItems="center">
          <Avatar
            sx={{
              bgcolor: '#DBEAFE',
              color: '#0A66C2',
              width: 35,
              height: 35,
              borderRadius: 2
            }}
          >
            <LinkedInIcon fontSize="small" />
          </Avatar>
          <Box>
            <Typography fontWeight={700} fontSize={12}>
              LinkedIn
            </Typography>
            <Typography color="text.secondary" fontSize={10}>
              Profile data
            </Typography>
          </Box>
        </Stack>
        <Typography
          fontSize={10}
          color="text.secondary"
          sx={{ mt: 1.3, lineHeight: 1.6 }}
        >
          Experience · Education · Skills
        </Typography>
      </Paper>

      {/* Simera data source */}
      <Paper
        elevation={0}
        sx={{
          position: 'absolute',
          bottom: { xs: 60, sm: 65 },
          left: { xs: 0, sm: 12 },
          p: 1.4,
          width: 155,
          border: '1px solid',
          borderColor: 'divider',
          borderRadius: 3,
          bgcolor: 'background.paper',
          boxShadow: '0 14px 35px rgba(15, 23, 42, 0.08)',
          zIndex: 2,
          animation: 'float 5.5s ease-in-out 0.7s infinite',
          '@keyframes float': {
            '0%, 100%': { transform: 'translateY(0px)' },
            '50%': { transform: 'translateY(-10px)' }
          }
        }}
      >
        <Stack direction="row" spacing={1} alignItems="center">
          <Avatar
            sx={{
              bgcolor: 'action.selected',
              color: 'primary.main',
              width: 35,
              height: 35,
              borderRadius: 2
            }}
          >
            <DataObjectRoundedIcon fontSize="small" />
          </Avatar>
          <Box>
            <Typography fontWeight={700} fontSize={12}>
              Simera Data
            </Typography>
            <Typography color="text.secondary" fontSize={10}>
              Existing profile
            </Typography>
          </Box>
        </Stack>
      </Paper>

      {/* Main profile preview */}
      <Paper
        elevation={0}
        sx={{
          position: 'relative',
          width: { xs: 235, sm: 270 },
          p: { xs: 2, sm: 2.5 },
          borderRadius: 4,
          bgcolor: 'background.paper',
          border: '1px solid',
          borderColor: 'divider',
          boxShadow: (theme) => `0 25px 70px ${theme.palette.primary.main}20`,
          zIndex: 3,
          transform: 'translateY(12px)'
        }}
      >
        <Stack
          direction="row"
          alignItems="center"
          justifyContent="space-between"
          sx={{ mb: 2 }}
        >
          <Typography fontSize={11} fontWeight={700} color="text.secondary">
            CANDIDATE PROFILE
          </Typography>
          <Chip
            size="small"
            icon={<CheckCircleRoundedIcon />}
            label="Structured"
            color="success"
            variant="outlined"
            sx={{
              height: 23,
              fontSize: 10,
              '& .MuiChip-icon': { fontSize: 14 }
            }}
          />
        </Stack>

        <Stack direction="row" spacing={1.5} alignItems="center">
          <Avatar
            sx={{
              width: 48,
              height: 48,
              bgcolor: 'primary.main',
              color: 'primary.contrastText'
            }}
          >
            <PersonRoundedIcon />
          </Avatar>
          <Box>
            <Typography fontWeight={800} fontSize={14}>
              Candidate Profile
            </Typography>
            <Typography color="text.secondary" fontSize={11}>
              Unified candidate data
            </Typography>
          </Box>
        </Stack>

        <Box
          sx={{
            height: 1,
            bgcolor: 'divider',
            my: 2
          }}
        />

        <Stack spacing={1.5}>
          {[
            ['Experience', 'Frontend Developer'],
            ['Education', 'Computer Engineering'],
            ['Skills', 'React · JavaScript · CSS']
          ].map(([label, value]) => (
            <Box key={label}>
              <Typography
                color="text.secondary"
                fontSize={10}
                sx={{ mb: 0.35 }}
              >
                {label}
              </Typography>
              <Typography fontWeight={600} fontSize={11.5}>
                {value}
              </Typography>
            </Box>
          ))}
        </Stack>

        <Box
          sx={{
            mt: 2,
            p: 1.2,
            borderRadius: 2,
            bgcolor: 'action.hover'
          }}
        >
          <Stack direction="row" spacing={0.8} alignItems="center">
            <AutoAwesomeRoundedIcon
              sx={{ color: 'primary.main', fontSize: 16 }}
            />
            <Typography fontSize={10} fontWeight={700}>
              Multiple sources. One profile.
            </Typography>
          </Stack>
        </Box>
      </Paper>

      {/* Floating processing indicator */}
      <Paper
        elevation={0}
        sx={{
          position: 'absolute',
          bottom: { xs: 15, sm: 25 },
          right: { xs: 0, sm: 5 },
          px: 1.5,
          py: 1,
          borderRadius: 3,
          border: '1px solid',
          borderColor: 'divider',
          bgcolor: 'background.paper',
          boxShadow: '0 12px 30px rgba(15, 23, 42, 0.08)',
          zIndex: 4,
          ...floatAnimation
        }}
      >
        <Stack direction="row" spacing={1} alignItems="center">
          <Box
            sx={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              bgcolor: 'success.main',
              boxShadow: (theme) => `0 0 0 4px ${theme.palette.success.main}20`
            }}
          />
          <Typography fontSize={10} fontWeight={700}>
            Data unified
          </Typography>
        </Stack>
      </Paper>
    </Box>
  );
}
