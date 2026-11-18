import { Box, Button, Container, Stack, Typography } from '@mui/material';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import PlayCircleOutlineRoundedIcon from '@mui/icons-material/PlayCircleOutlineRounded';
import AutoAwesomeRoundedIcon from '@mui/icons-material/AutoAwesomeRounded';

import ParsingCard from './ParsingCard';

export default function Hero() {
  return (
    <Box
      sx={{
        position: 'relative',
        overflow: 'hidden',
        minHeight: { xs: 'auto', md: '720px' },
        display: 'flex',
        alignItems: 'center',
        bgcolor: 'background.default',
        pt: { xs: 12, md: 15 },
        pb: { xs: 7, md: 10 }
      }}
    >
      {/* Background decoration */}
      <Box
        sx={{
          position: 'absolute',
          top: -180,
          right: '-10%',
          width: 550,
          height: 550,
          borderRadius: '50%',
          background: (theme) =>
            `radial-gradient(circle, ${theme.palette.primary.main}12 0%, transparent 70%)`,
          pointerEvents: 'none'
        }}
      />

      <Box
        sx={{
          position: 'absolute',
          bottom: -250,
          left: '-12%',
          width: 500,
          height: 500,
          borderRadius: '50%',
          background: (theme) =>
            `radial-gradient(circle, ${theme.palette.primary.main}0B 0%, transparent 70%)`,
          pointerEvents: 'none'
        }}
      />

      <Container maxWidth="lg" sx={{ position: 'relative' }}>
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
            alignItems: 'center',
            gap: { xs: 5, md: 3 }
          }}
        >
          {/* Hero content */}
          <Stack
            spacing={3}
            sx={{
              maxWidth: 560,
              textAlign: { xs: 'center', md: 'left' },
              alignItems: { xs: 'center', md: 'flex-start' }
            }}
          >
            <Box
              sx={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 1,
                px: 1.6,
                py: 0.8,
                borderRadius: 10,
                border: '1px solid',
                borderColor: 'divider',
                bgcolor: 'background.paper'
              }}
            >
              <AutoAwesomeRoundedIcon
                sx={{ fontSize: 16, color: 'primary.main' }}
              />
              <Typography
                variant="caption"
                fontWeight={700}
                color="primary.main"
                letterSpacing={0.5}
              >
                SMARTER CANDIDATE DATA
              </Typography>
            </Box>

            <Typography
              component="h1"
              sx={{
                fontFamily: (theme) => theme.typography.h1.fontFamily,
                fontSize: { xs: '2.5rem', sm: '3.5rem', md: '3.7rem' },
                fontWeight: 800,
                lineHeight: 1.13,
                letterSpacing: '-0.045em',
                color: 'text.primary'
              }}
            >
              From scattered data
              <Box
                component="span"
                sx={{
                  display: 'block',
                  color: 'primary.main'
                }}
              >
                to one clear profile.
              </Box>
            </Typography>

            <Typography
              sx={{
                maxWidth: 490,
                color: 'text.secondary',
                fontSize: { xs: 15, md: 17 },
                lineHeight: 1.85
              }}
            >
              Bring CVs, LinkedIn exports, and existing profile data together.
              Simera helps transform multiple sources into structured candidate
              profiles ready for review.
            </Typography>

            <Stack
              direction={{ xs: 'column', sm: 'row' }}
              spacing={1.5}
              sx={{
                width: { xs: '100%', sm: 'auto' },
                pt: 1
              }}
            >
              <Button
                component="a"
                href="/auth/register"
                variant="contained"
                size="large"
                endIcon={<ArrowForwardRoundedIcon />}
                sx={{
                  px: 3,
                  py: 1.5,
                  borderRadius: 2.5,
                  fontWeight: 700,
                  boxShadow: (theme) =>
                    `0 10px 25px ${theme.palette.primary.main}30`
                }}
              >
                Get started
              </Button>

              <Button
                component="a"
                href="#how-it-works"
                variant="outlined"
                size="large"
                startIcon={<PlayCircleOutlineRoundedIcon />}
                sx={{
                  px: 3,
                  py: 1.5,
                  borderRadius: 2.5,
                  fontWeight: 700,
                  borderColor: 'divider',
                  color: 'text.primary'
                }}
              >
                Explore the workflow
              </Button>
            </Stack>

            <Typography variant="caption" color="text.secondary" sx={{ pt: 1 }}>
              One workflow. Multiple sources. A structured profile.
            </Typography>
          </Stack>

          {/* Animated product visual */}
          <Box
            sx={{
              width: '100%',
              minWidth: 0,
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center'
            }}
          >
            <ParsingCard />
          </Box>
        </Box>
      </Container>
    </Box>
  );
}
