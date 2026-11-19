import { keyframes } from '@mui/system';
import { Avatar, Box, Chip, Paper, Stack, Typography } from '@mui/material';

import PictureAsPdfRoundedIcon from '@mui/icons-material/PictureAsPdfRounded';
import LinkedInIcon from '@mui/icons-material/LinkedIn';
import DataObjectRoundedIcon from '@mui/icons-material/DataObjectRounded';
import AutoAwesomeRoundedIcon from '@mui/icons-material/AutoAwesomeRounded';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import PersonRoundedIcon from '@mui/icons-material/PersonRounded';
import SchoolRoundedIcon from '@mui/icons-material/SchoolRounded';
import WorkOutlineRoundedIcon from '@mui/icons-material/WorkOutlineRounded';
import CodeRoundedIcon from '@mui/icons-material/CodeRounded';

const float = keyframes`
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-10px); }
`;

const floatReverse = keyframes`
  0%, 100% { transform: translateY(-5px); }
  50% { transform: translateY(7px); }
`;

const pulse = keyframes`
  0%, 100% {
    transform: scale(.96);
    opacity: .45;
  }
  50% {
    transform: scale(1.08);
    opacity: .9;
  }
`;

const orbit = keyframes`
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
`;

const scan = keyframes`
  0% { transform: translateY(-120%); opacity: 0; }
  20% { opacity: .7; }
  80% { opacity: .7; }
  100% { transform: translateY(220%); opacity: 0; }
`;

const flow = keyframes`
  0% { transform: translateX(-130%); opacity: 0; }
  25% { opacity: 1; }
  75% { opacity: 1; }
  100% { transform: translateX(230%); opacity: 0; }
`;

const sources = [
  {
    title: 'Resume.pdf',
    subtitle: 'PDF document',
    icon: <PictureAsPdfRoundedIcon />,
    delay: '0s'
  },
  {
    title: 'LinkedIn',
    subtitle: 'Profile export',
    icon: <LinkedInIcon />,
    delay: '0.7s'
  },
  {
    title: 'Existing profile',
    subtitle: 'Profile data',
    icon: <DataObjectRoundedIcon />,
    delay: '1.3s'
  }
];

function SourceItem({ source, index }) {
  return (
    <Paper
      elevation={0}
      sx={{
        width: { xs: 175, sm: 205 },
        p: 1.5,
        borderRadius: 3,
        border: '1px solid',
        borderColor: 'divider',
        bgcolor: 'background.paper',
        boxShadow: (theme) => `0 14px 40px ${theme.palette.primary.main}0C`,
        position: 'relative',
        animation: `${index % 2 === 0 ? float : floatReverse} 5s ease-in-out ${source.delay} infinite`,
        transition: 'transform .3s ease, box-shadow .3s ease',
        '&:hover': {
          boxShadow: (theme) => `0 18px 45px ${theme.palette.primary.main}20`,
          transform: 'translateY(-4px)'
        }
      }}
    >
      <Stack direction="row" alignItems="center" spacing={1.3}>
        <Box
          sx={{
            width: 42,
            height: 42,
            borderRadius: 2.5,
            display: 'grid',
            placeItems: 'center',
            bgcolor: 'action.hover',
            color: 'primary.main',
            flexShrink: 0,
            '& svg': { fontSize: 22 }
          }}
        >
          {source.icon}
        </Box>

        <Box sx={{ minWidth: 0 }}>
          <Typography fontSize={12} fontWeight={800} noWrap>
            {source.title}
          </Typography>
          <Typography fontSize={10} color="text.secondary" noWrap>
            {source.subtitle}
          </Typography>
        </Box>

        <Box sx={{ ml: 'auto !important' }}>
          <CheckCircleRoundedIcon
            sx={{ fontSize: 15, color: 'success.main' }}
          />
        </Box>
      </Stack>
    </Paper>
  );
}

function ProcessingCore() {
  return (
    <Box
      sx={{
        position: 'relative',
        width: { xs: 160, sm: 190 },
        height: { xs: 160, sm: 190 },
        display: 'grid',
        placeItems: 'center',
        mx: 'auto',
        my: { xs: 1, md: 0 }
      }}
    >
      <Box
        sx={{
          position: 'absolute',
          inset: 8,
          borderRadius: '50%',
          bgcolor: 'primary.main',
          opacity: 0.07,
          filter: 'blur(24px)',
          animation: `${pulse} 3s ease-in-out infinite`
        }}
      />

      <Box
        sx={{
          position: 'absolute',
          inset: 7,
          border: '1px dashed',
          borderColor: 'primary.main',
          opacity: 0.35,
          borderRadius: '50%',
          animation: `${orbit} 24s linear infinite`
        }}
      >
        <Box
          sx={{
            position: 'absolute',
            top: '12%',
            left: '14%',
            width: 9,
            height: 9,
            borderRadius: '50%',
            bgcolor: 'primary.main',
            boxShadow: (theme) => `0 0 14px ${theme.palette.primary.main}`
          }}
        />
      </Box>

      <Box
        sx={{
          position: 'absolute',
          inset: 23,
          borderRadius: '50%',
          border: '1px solid',
          borderColor: 'primary.main',
          opacity: 0.16
        }}
      />

      <Box
        sx={{
          width: { xs: 86, sm: 102 },
          height: { xs: 86, sm: 102 },
          borderRadius: '32%',
          bgcolor: 'primary.main',
          color: 'primary.contrastText',
          display: 'grid',
          placeItems: 'center',
          boxShadow: (theme) => `0 15px 45px ${theme.palette.primary.main}55`,
          position: 'relative',
          overflow: 'hidden',
          transform: 'rotate(-8deg)'
        }}
      >
        <AutoAwesomeRoundedIcon
          sx={{
            fontSize: { xs: 39, sm: 47 },
            transform: 'rotate(8deg)'
          }}
        />

        <Box
          sx={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: 0,
            height: '30%',
            background: (theme) =>
              `linear-gradient(180deg, ${theme.palette.common.white}40, transparent)`,
            animation: `${scan} 3s ease-in-out infinite`
          }}
        />
      </Box>

      <Paper
        elevation={0}
        sx={{
          position: 'absolute',
          bottom: -5,
          px: 1.3,
          py: 0.7,
          borderRadius: 5,
          bgcolor: 'background.paper',
          border: '1px solid',
          borderColor: 'divider',
          boxShadow: 2
        }}
      >
        <Typography
          fontSize={9}
          fontWeight={800}
          letterSpacing={0.8}
          color="primary.main"
        >
          TALENTVAULT AI
        </Typography>
      </Paper>
    </Box>
  );
}

function ProfilePreview() {
  return (
    <Paper
      elevation={0}
      sx={{
        width: '100%',
        maxWidth: 320,
        p: { xs: 2, sm: 2.5 },
        borderRadius: 4,
        border: '1px solid',
        borderColor: 'divider',
        bgcolor: 'background.paper',
        boxShadow: (theme) => `0 25px 70px ${theme.palette.primary.main}18`,
        position: 'relative',
        overflow: 'hidden',
        animation: `${floatReverse} 6s ease-in-out infinite`
      }}
    >
      <Box
        sx={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 3,
          bgcolor: 'primary.main'
        }}
      />

      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        sx={{ mb: 2.5 }}
      >
        <Typography
          fontSize={10}
          fontWeight={800}
          letterSpacing={1}
          color="text.secondary"
        >
          PROFILE OVERVIEW
        </Typography>

        <Chip
          size="small"
          label="Preview"
          variant="outlined"
          color="success"
          sx={{ height: 22, fontSize: 9, fontWeight: 700 }}
        />
      </Stack>

      <Stack direction="row" alignItems="center" spacing={1.5}>
        <Avatar
          sx={{
            width: 49,
            height: 49,
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
          <Typography fontSize={10} color="text.secondary">
            Unified candidate information
          </Typography>
        </Box>
      </Stack>

      <Box
        sx={{
          my: 2.2,
          height: '1px',
          bgcolor: 'divider'
        }}
      />

      <Stack spacing={2}>
        <Stack direction="row" spacing={1.2} alignItems="center">
          <WorkOutlineRoundedIcon
            sx={{ fontSize: 17, color: 'primary.main' }}
          />
          <Box>
            <Typography fontSize={9} color="text.secondary">
              EXPERIENCE
            </Typography>
            <Typography fontSize={11} fontWeight={700}>
              Frontend Developer
            </Typography>
          </Box>
        </Stack>

        <Stack direction="row" spacing={1.2} alignItems="center">
          <SchoolRoundedIcon sx={{ fontSize: 17, color: 'primary.main' }} />
          <Box>
            <Typography fontSize={9} color="text.secondary">
              EDUCATION
            </Typography>
            <Typography fontSize={11} fontWeight={700}>
              Computer Engineering
            </Typography>
          </Box>
        </Stack>

        <Stack direction="row" spacing={1.2} alignItems="center">
          <CodeRoundedIcon sx={{ fontSize: 17, color: 'primary.main' }} />
          <Box>
            <Typography fontSize={9} color="text.secondary">
              SKILLS
            </Typography>
            <Typography fontSize={11} fontWeight={700}>
              React · JavaScript · CSS
            </Typography>
          </Box>
        </Stack>
      </Stack>

      <Box
        sx={{
          mt: 2.5,
          p: 1.2,
          borderRadius: 2.5,
          bgcolor: 'action.hover'
        }}
      >
        <Stack direction="row" spacing={1} alignItems="center">
          <CheckCircleRoundedIcon color="success" sx={{ fontSize: 17 }} />
          <Typography fontSize={10} fontWeight={700}>
            Ready for human review
          </Typography>
        </Stack>
      </Box>

      <Typography
        fontSize={9}
        color="text.disabled"
        sx={{ mt: 1.5, textAlign: 'center' }}
      >
        Illustrative profile preview
      </Typography>
    </Paper>
  );
}

function Connector() {
  return (
    <Box
      sx={{
        display: { xs: 'none', md: 'block' },
        width: '100%',
        height: 2,
        position: 'relative',
        overflow: 'hidden',
        borderRadius: 5,
        bgcolor: 'action.hover',
        '&::after': {
          content: '""',
          position: 'absolute',
          inset: 0,
          width: '35%',
          background: (theme) =>
            `linear-gradient(90deg, transparent, ${theme.palette.primary.main}, transparent)`,
          animation: `${flow} 2.5s linear infinite`
        }
      }}
    />
  );
}

export default function HowItWorks() {
  return (
    <Box
      id="how-it-works"
      sx={{
        position: 'relative',
        overflow: 'hidden',
        py: { xs: 5, md: 8 },
        bgcolor: 'background.default',
        '@media (prefers-reduced-motion: reduce)': {
          '& *': {
            animation: 'none !important',
            transition: 'none !important'
          }
        }
      }}
    >
      {/* Ambient background */}
      <Box
        sx={{
          position: 'absolute',
          top: '10%',
          left: '-15%',
          width: 400,
          height: 400,
          borderRadius: '50%',
          bgcolor: 'primary.main',
          opacity: 0.035,
          filter: 'blur(100px)',
          pointerEvents: 'none'
        }}
      />

      <Box
        sx={{
          position: 'absolute',
          bottom: '-10%',
          right: '-12%',
          width: 420,
          height: 420,
          borderRadius: '50%',
          bgcolor: 'primary.main',
          opacity: 0.04,
          filter: 'blur(110px)',
          pointerEvents: 'none'
        }}
      />

      <Box
        sx={{
          maxWidth: 1200,
          mx: 'auto',
          px: { xs: 2, sm: 3 },
          position: 'relative',
          zIndex: 1
        }}
      >
        {/* Section heading */}
        <Stack
          alignItems="center"
          textAlign="center"
          spacing={2}
          sx={{ mb: { xs: 4, md: 6 } }}
        >
          <Stack direction="row" alignItems="center" spacing={1.2}>
            <Box
              sx={{
                width: 25,
                height: 2,
                bgcolor: 'primary.main',
                borderRadius: 2
              }}
            />

            <Typography
              fontSize={10}
              fontWeight={800}
              letterSpacing={2}
              color="primary.main"
            >
              HOW TALENTVAULT WORKS
            </Typography>
          </Stack>

          <Typography
            component="h2"
            sx={{
              maxWidth: 750,
              fontSize: { xs: 30, sm: 40, md: 48 },
              lineHeight: 1.15,
              letterSpacing: '-1.8px',
              fontWeight: 800,
              color: 'text.primary'
            }}
          >
            Every detail,
            <Box component="span" sx={{ color: 'primary.main' }}>
              {' '}
              brought into focus.
            </Box>
          </Typography>

          <Typography
            sx={{
              maxWidth: 550,
              fontSize: { xs: 13, md: 14 },
              lineHeight: 1.9,
              color: 'text.secondary'
            }}
          >
            See how different candidate data sources come together to create one
            structured profile, ready for review.
          </Typography>
        </Stack>

        {/* Main visual */}
        <Box
          sx={{
            position: 'relative',
            borderRadius: { xs: 4, md: 6 },
            border: '1px solid',
            borderColor: 'divider',
            bgcolor: 'background.paper',
            backgroundImage: (theme) =>
              `radial-gradient(${theme.palette.primary.main}13 1px, transparent 1px)`,
            backgroundSize: '24px 24px',
            px: { xs: 2, sm: 4, md: 5 },
            py: { xs: 4, md: 6 },
            boxShadow: (theme) => `0 30px 90px ${theme.palette.text.primary}08`
          }}
        >
          <Stack
            direction="row"
            justifyContent="space-between"
            alignItems="center"
            sx={{ mb: { xs: 4, md: 5 } }}
          >
            <Typography
              fontSize={10}
              fontWeight={800}
              color="text.secondary"
              letterSpacing={1}
            >
              FROM MULTIPLE SOURCES
            </Typography>

            <Stack direction="row" alignItems="center" spacing={0.8}>
              <Box
                sx={{
                  width: 7,
                  height: 7,
                  borderRadius: '50%',
                  bgcolor: 'success.main'
                }}
              />

              <Typography fontSize={9} color="text.secondary" fontWeight={700}>
                VISUAL WORKFLOW
              </Typography>
            </Stack>
          </Stack>

          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: {
                xs: '1fr',
                md: '1fr 70px 0.85fr 70px 1.15fr'
              },
              alignItems: 'center',
              gap: { xs: 3, md: 1.5 }
            }}
          >
            <Stack spacing={2} alignItems="center">
              {sources.map((source, index) => (
                <SourceItem key={source.title} source={source} index={index} />
              ))}
            </Stack>

            <Connector />

            <Stack alignItems="center" spacing={2}>
              <ProcessingCore />

              <Typography
                fontSize={9}
                fontWeight={800}
                letterSpacing={1}
                color="text.secondary"
              >
                EXTRACT · STRUCTURE · VALIDATE
              </Typography>
            </Stack>

            <Connector />

            <Stack alignItems="center" spacing={1.5}>
              <ProfilePreview />
            </Stack>
          </Box>

          <Box
            sx={{
              mt: { xs: 4, md: 5 },
              pt: 2.5,
              borderTop: '1px solid',
              borderColor: 'divider',
              display: 'flex',
              justifyContent: 'center'
            }}
          >
            <Stack
              direction="row"
              spacing={1}
              alignItems="center"
              color="text.secondary"
            >
              <AutoAwesomeRoundedIcon
                sx={{ fontSize: 15, color: 'primary.main' }}
              />

              <Typography fontSize={10} fontWeight={700}>
                Multiple sources. Structured information. Human review.
              </Typography>
            </Stack>
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
