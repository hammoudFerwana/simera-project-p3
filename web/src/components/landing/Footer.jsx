import { Box, Container, Stack, Typography, Divider } from '@mui/material';

import AutoAwesomeRoundedIcon from '@mui/icons-material/AutoAwesomeRounded';
import ArrowOutwardRoundedIcon from '@mui/icons-material/ArrowOutwardRounded';

const footerLinks = {
  Explore: [
    { label: 'Overview', href: '#top' },
    { label: 'How it works', href: '#how-it-works' }
  ],
  Account: [
    { label: 'Log in', href: '/auth/login' },
    { label: 'Get started', href: '/auth/register' }
  ]
};

function FooterBrand() {
  return (
    <Stack spacing={2} sx={{ maxWidth: 390 }}>
      <Stack direction="row" alignItems="center" spacing={1.2}>
        <Box
          sx={{
            width: 38,
            height: 38,
            display: 'grid',
            placeItems: 'center',
            borderRadius: '11px',
            bgcolor: 'primary.main',
            color: '#FFFFFF'
          }}
        >
          <AutoAwesomeRoundedIcon sx={{ fontSize: 21 }} />
        </Box>

        <Typography
          sx={{
            color: '#FFFFFF',
            fontSize: 21,
            fontWeight: 800,
            letterSpacing: '-0.7px'
          }}
        >
          TalentVault
        </Typography>
      </Stack>

      <Typography
        sx={{
          color: 'rgba(255,255,255,0.62)',
          fontSize: 13,
          lineHeight: 1.9,
          maxWidth: 350
        }}
      >
        One structured candidate profile, bringing together information from
        multiple sources for a clearer review.
      </Typography>
    </Stack>
  );
}

function FooterLinkColumn({ title, links }) {
  return (
    <Stack spacing={2}>
      <Typography
        sx={{
          color: '#FFFFFF',
          fontSize: 12,
          fontWeight: 800,
          letterSpacing: 1,
          textTransform: 'uppercase'
        }}
      >
        {title}
      </Typography>

      <Stack spacing={1.5}>
        {links.map((link) => (
          <Box
            key={link.label}
            component="a"
            href={link.href}
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 0.6,
              width: 'fit-content',
              color: 'rgba(255,255,255,0.58)',
              fontSize: 13,
              textDecoration: 'none',
              transition: 'all 180ms ease',
              '&:hover': {
                color: '#FFFFFF',
                '& .footer-arrow': {
                  opacity: 1,
                  transform: 'translate(2px, -2px)'
                }
              }
            }}
          >
            {link.label}

            <ArrowOutwardRoundedIcon
              className="footer-arrow"
              sx={{
                fontSize: 13,
                opacity: 0,
                transform: 'translate(-2px, 2px)',
                transition: 'all 180ms ease'
              }}
            />
          </Box>
        ))}
      </Stack>
    </Stack>
  );
}

function FooterBottom() {
  return (
    <Stack
      direction={{ xs: 'column', sm: 'row' }}
      alignItems={{ xs: 'flex-start', sm: 'center' }}
      justifyContent="space-between"
      spacing={1.5}
    >
      <Typography
        sx={{
          color: 'rgba(255,255,255,0.42)',
          fontSize: 12
        }}
      >
        © {new Date().getFullYear()} TalentVault. All rights reserved.
      </Typography>

      <Typography
        sx={{
          color: 'rgba(255,255,255,0.42)',
          fontSize: 12
        }}
      >
        Built to bring every detail into focus.
      </Typography>
    </Stack>
  );
}

export default function Footer() {
  return (
    <Box
      component="footer"
      sx={{
        position: 'relative',
        overflow: 'hidden',
        bgcolor: '#101D3A',
        color: '#FFFFFF'
      }}
    >
      <Box
        sx={{
          position: 'absolute',
          width: 380,
          height: 380,
          borderRadius: '50%',
          bgcolor: 'rgba(37,99,235,0.09)',
          filter: 'blur(110px)',
          top: -280,
          right: '15%',
          pointerEvents: 'none'
        }}
      />

      <Container
        maxWidth="lg"
        sx={{
          position: 'relative',
          zIndex: 1
        }}
      >
        <Box
          sx={{
            py: { xs: 5, md: 6 },
            display: 'grid',
            gridTemplateColumns: {
              xs: '1fr 1fr',
              md: '2fr 0.8fr 0.8fr'
            },
            gap: { xs: 4, md: 8 }
          }}
        >
          <Box sx={{ gridColumn: { xs: '1 / -1', md: 'auto' } }}>
            <FooterBrand />
          </Box>

          <FooterLinkColumn title="Explore" links={footerLinks.Explore} />

          <FooterLinkColumn title="Account" links={footerLinks.Account} />
        </Box>

        <Divider
          sx={{
            borderColor: 'rgba(255,255,255,0.12)'
          }}
        />

        <Box sx={{ py: 2.5 }}>
          <FooterBottom />
        </Box>
      </Container>
    </Box>
  );
}
