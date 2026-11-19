import {
  Avatar,
  Box,
  Button,
  Chip,
  Container,
  Divider,
  Stack,
  Typography
} from '@mui/material';

import { keyframes } from '@mui/system';

import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import AutoAwesomeRoundedIcon from '@mui/icons-material/AutoAwesomeRounded';
import DescriptionRoundedIcon from '@mui/icons-material/DescriptionRounded';
import WorkOutlineRoundedIcon from '@mui/icons-material/WorkOutlineRounded';
import SchoolRoundedIcon from '@mui/icons-material/SchoolRounded';
import VerifiedRoundedIcon from '@mui/icons-material/VerifiedRounded';
import DataObjectRoundedIcon from '@mui/icons-material/DataObjectRounded';
import LinkedInIcon from '@mui/icons-material/LinkedIn';

import { Link as RouterLink } from 'react-router-dom';

const float = keyframes`
  0%, 100% {
    transform: translateY(0);
  }

  50% {
    transform: translateY(-7px);
  }
`;

const sources = [
  {
    label: 'Resume.pdf',
    icon: DescriptionRoundedIcon,
    color: '#FCA5A5',
    rotation: '-7deg',
    position: 'left',
    delay: '0s'
  },
  {
    label: 'LinkedIn',
    icon: LinkedInIcon,
    color: '#93C5FD',
    rotation: '6deg',
    position: 'right',
    delay: '1s'
  }
];

function SourceBadge({ icon: Icon, label, color, sx = {} }) {
  return (
    <Stack
      direction="row"
      alignItems="center"
      spacing={1}
      sx={{
        px: 1.4,
        py: 1,
        borderRadius: '12px',
        bgcolor: '#1C3154',
        border: '1px solid rgba(255,255,255,0.12)',
        boxShadow: '0 10px 25px rgba(0,0,0,0.18)',
        ...sx
      }}
    >
      <Icon sx={{ color, fontSize: 18 }} />

      <Typography
        sx={{
          color: '#E2E8F0',
          fontSize: 11,
          fontWeight: 700,
          whiteSpace: 'nowrap'
        }}
      >
        {label}
      </Typography>
    </Stack>
  );
}

function ProfilePreview() {
  return (
    <Box
      sx={{
        position: 'relative',
        width: '100%',
        maxWidth: 370,
        mx: 'auto',
        pt: 3,
        pb: 2
      }}
    >
      {/* Ambient glow */}
      <Box
        sx={{
          position: 'absolute',
          width: 250,
          height: 250,
          borderRadius: '50%',
          bgcolor: 'rgba(59,130,246,0.18)',
          filter: 'blur(75px)',
          top: '25%',
          left: '20%',
          pointerEvents: 'none'
        }}
      />

      {/* Floating source badges */}
      {sources.map((source) => {
        const Icon = source.icon;

        return (
          <Box
            key={source.label}
            sx={{
              position: 'absolute',
              zIndex: 3,
              top: 0,
              [source.position]: { xs: -2, sm: -14 },
              transform: `rotate(${source.rotation})`,
              animation: `${float} 4s ease-in-out infinite`,
              animationDelay: source.delay
            }}
          >
            <SourceBadge
              icon={Icon}
              label={source.label}
              color={source.color}
            />
          </Box>
        );
      })}

      {/* Main candidate profile card */}
      <Box
        sx={{
          position: 'relative',
          zIndex: 2,
          mt: 4,
          mx: { xs: 1, sm: 2 },
          p: { xs: 2.2, sm: 2.7 },
          borderRadius: '22px',
          bgcolor: '#FFFFFF',
          border: '1px solid rgba(255,255,255,0.65)',
          boxShadow: '0 25px 65px rgba(0,0,0,0.28)'
        }}
      >
        {/* Card heading */}
        <Stack
          direction="row"
          alignItems="center"
          justifyContent="space-between"
          sx={{ mb: 2.5 }}
        >
          <Stack direction="row" alignItems="center" spacing={1}>
            <Box
              sx={{
                width: 30,
                height: 30,
                borderRadius: '9px',
                display: 'grid',
                placeItems: 'center',
                bgcolor: '#EFF6FF',
                color: '#2563EB'
              }}
            >
              <DataObjectRoundedIcon sx={{ fontSize: 18 }} />
            </Box>

            <Typography
              sx={{
                color: '#172554',
                fontSize: 12,
                fontWeight: 800
              }}
            >
              Candidate profile
            </Typography>
          </Stack>

          <Chip
            size="small"
            icon={<VerifiedRoundedIcon sx={{ fontSize: '14px !important' }} />}
            label="Structured"
            sx={{
              height: 24,
              bgcolor: '#ECFDF5',
              color: '#047857',
              fontSize: 10,
              fontWeight: 700,
              '& .MuiChip-icon': {
                color: '#059669'
              }
            }}
          />
        </Stack>

        <Divider sx={{ borderColor: '#EEF2F7', mb: 2.5 }} />

        {/* Candidate identity */}
        <Stack direction="row" alignItems="center" spacing={1.7}>
          <Avatar
            sx={{
              width: 48,
              height: 48,
              bgcolor: '#DBEAFE',
              color: '#1D4ED8',
              fontSize: 17,
              fontWeight: 800
            }}
          >
            JD
          </Avatar>

          <Box>
            <Typography
              sx={{
                color: '#172554',
                fontSize: 14,
                fontWeight: 800
              }}
            >
              Candidate Profile
            </Typography>

            <Typography
              sx={{
                color: '#64748B',
                fontSize: 11,
                mt: 0.3
              }}
            >
              Frontend Developer
            </Typography>
          </Box>
        </Stack>

        {/* Profile details */}
        <Stack spacing={1.8} sx={{ mt: 2.8 }}>
          <Stack direction="row" spacing={1.3} alignItems="center">
            <WorkOutlineRoundedIcon sx={{ color: '#64748B', fontSize: 18 }} />

            <Box sx={{ flex: 1 }}>
              <Typography sx={{ color: '#94A3B8', fontSize: 10 }}>
                EXPERIENCE
              </Typography>

              <Typography
                sx={{
                  color: '#334155',
                  fontSize: 12,
                  fontWeight: 700
                }}
              >
                Frontend Development
              </Typography>
            </Box>
          </Stack>

          <Stack direction="row" spacing={1.3} alignItems="center">
            <SchoolRoundedIcon sx={{ color: '#64748B', fontSize: 18 }} />

            <Box sx={{ flex: 1 }}>
              <Typography sx={{ color: '#94A3B8', fontSize: 10 }}>
                EDUCATION
              </Typography>

              <Typography
                sx={{
                  color: '#334155',
                  fontSize: 12,
                  fontWeight: 700
                }}
              >
                Computer Engineering
              </Typography>
            </Box>
          </Stack>
        </Stack>

        <Divider sx={{ borderColor: '#EEF2F7', my: 2.3 }} />

        {/* Skills */}
        <Typography
          sx={{
            color: '#64748B',
            fontSize: 10,
            fontWeight: 800,
            letterSpacing: 0.8,
            mb: 1.2
          }}
        >
          SKILLS
        </Typography>

        <Stack direction="row" flexWrap="wrap" gap={0.8}>
          {['React', 'JavaScript', 'CSS'].map((skill) => (
            <Chip
              key={skill}
              label={skill}
              size="small"
              sx={{
                bgcolor: '#EFF6FF',
                color: '#1D4ED8',
                fontSize: 10,
                fontWeight: 700,
                height: 25,
                borderRadius: '7px'
              }}
            />
          ))}
        </Stack>
      </Box>

      {/* Bottom floating status */}
      <Box
        sx={{
          position: 'relative',
          zIndex: 3,
          display: 'flex',
          justifyContent: 'center',
          mt: -1.2
        }}
      >
        <Stack
          direction="row"
          alignItems="center"
          spacing={1}
          sx={{
            px: 2,
            py: 1.1,
            borderRadius: '12px',
            bgcolor: '#1D3760',
            border: '1px solid rgba(147,197,253,0.25)',
            boxShadow: '0 12px 30px rgba(0,0,0,0.2)'
          }}
        >
          <VerifiedRoundedIcon sx={{ color: '#86EFAC', fontSize: 17 }} />

          <Typography
            sx={{
              color: '#FFFFFF',
              fontSize: 11,
              fontWeight: 700
            }}
          >
            Ready for human review
          </Typography>
        </Stack>
      </Box>
    </Box>
  );
}

export default function FinalCTA() {
  return (
    <Box
      sx={{
        py: { xs: 7, md: 11 },
        bgcolor: 'background.default'
      }}
    >
      <Container maxWidth="lg">
        <Box
          sx={{
            position: 'relative',
            overflow: 'hidden',
            borderRadius: { xs: '24px', md: '32px' },
            background:
              'linear-gradient(125deg, #101D3A 0%, #172B50 60%, #14264A 100%)',
            px: { xs: 3, sm: 5, md: 8 },
            py: { xs: 5, md: 7 }
          }}
        >
          {/* Background glow */}
          <Box
            sx={{
              position: 'absolute',
              width: 400,
              height: 400,
              borderRadius: '50%',
              bgcolor: 'rgba(37,99,235,0.16)',
              filter: 'blur(100px)',
              top: -220,
              right: -100,
              pointerEvents: 'none'
            }}
          />

          <Box
            sx={{
              position: 'absolute',
              width: 300,
              height: 300,
              borderRadius: '50%',
              bgcolor: 'rgba(59,130,246,0.10)',
              filter: 'blur(90px)',
              bottom: -220,
              left: -100,
              pointerEvents: 'none'
            }}
          />

          {/* Main content */}
          <Box
            sx={{
              position: 'relative',
              zIndex: 1,
              display: 'grid',
              gridTemplateColumns: {
                xs: '1fr',
                md: '1.1fr 0.9fr'
              },
              alignItems: 'center',
              gap: { xs: 5, md: 4 }
            }}
          >
            {/* Text content */}
            <Stack spacing={2.5} alignItems="flex-start">
              <Stack
                direction="row"
                alignItems="center"
                spacing={1}
                sx={{
                  px: 1.5,
                  py: 0.8,
                  borderRadius: '30px',
                  border: '1px solid rgba(147,197,253,0.22)',
                  bgcolor: 'rgba(59,130,246,0.10)'
                }}
              >
                <AutoAwesomeRoundedIcon
                  sx={{ fontSize: 16, color: '#93C5FD' }}
                />

                <Typography
                  sx={{
                    color: '#BFDBFE',
                    fontSize: 11,
                    fontWeight: 800,
                    letterSpacing: 1.5
                  }}
                >
                  MEET TALENTVAULT
                </Typography>
              </Stack>

              <Typography
                component="h2"
                sx={{
                  color: '#FFFFFF',
                  fontSize: { xs: 34, sm: 42, md: 48 },
                  fontWeight: 800,
                  lineHeight: 1.15,
                  letterSpacing: '-1.8px',
                  maxWidth: 490
                }}
              >
                Every candidate detail.
                <Box component="span" sx={{ color: '#93C5FD' }}>
                  {' '}
                  One clear picture.
                </Box>
              </Typography>

              <Typography
                sx={{
                  color: 'rgba(255,255,255,0.68)',
                  fontSize: { xs: 14, md: 15 },
                  lineHeight: 1.9,
                  maxWidth: 440
                }}
              >
                Bring CVs, LinkedIn exports, and existing profile data together
                into one structured candidate profile, ready for human review.
              </Typography>

              <Button
                component={RouterLink}
                to="/auth/register"
                variant="contained"
                endIcon={<ArrowForwardRoundedIcon />}
                sx={{
                  mt: 1,
                  px: 3.5,
                  py: 1.5,
                  borderRadius: '11px',
                  bgcolor: '#FFFFFF',
                  color: '#172554',
                  fontSize: 14,
                  fontWeight: 800,
                  textTransform: 'none',
                  boxShadow: 'none',
                  '&:hover': {
                    bgcolor: '#DBEAFE',
                    transform: 'translateY(-2px)',
                    boxShadow: '0 10px 25px rgba(0,0,0,0.16)'
                  },
                  transition: 'all 200ms ease'
                }}
              >
                Get started
              </Button>
            </Stack>

            {/* Product visual */}
            <Box
              sx={{
                width: '100%',
                maxWidth: 370,
                justifySelf: { xs: 'center', md: 'end' }
              }}
            >
              <ProfilePreview />
            </Box>
          </Box>
        </Box>
      </Container>
    </Box>
  );
}
