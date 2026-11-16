import { useParams } from 'react-router-dom';

import {
  Alert,
  Box,
  CircularProgress,
  Container,
  Paper,
  Stack,
  Typography
} from '@mui/material';

import useAdminCandidateProfile from '../../hooks/useAdminCandidateProfile';

import CandidateHeader from '../../components/admin/candidate-profile/CandidateHeader';
import CandidateProfileDetails from '../../components/admin/candidate-profile/CandidateProfileDetails';
import SectionsList from '../../components/admin/candidate-profile/SectionsList';
import CandidateFiles from '../../components/admin/candidate-profile/CandidateFiles';
import CandidateHistory from '../../components/admin/candidate-profile/CandidateHistory';

export default function CandidatesProfile() {
  const { id } = useParams();

  const { data, isLoading, isError, error } = useAdminCandidateProfile(id);

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (isError) {
    return (
      <Container maxWidth="xl">
        <Alert severity="error">
          {error?.response?.data?.message ||
            'Failed to load candidate profile.'}
        </Alert>
      </Container>
    );
  }

  if (!data?.candidate) {
    return (
      <Container maxWidth="xl">
        <Alert severity="warning">Candidate not found.</Alert>
      </Container>
    );
  }

  const { candidate, profile, sections, experience, files } = data;

  return (
    <Container maxWidth="xl">
      <Box sx={{ mt: 1, mb: 4 }}>
        <Typography
          variant="h4"
          sx={{
            fontSize: { xs: '1.6rem', md: '1.9rem' },
            fontWeight: 700,
            color: 'text.primary',
            letterSpacing: '-0.5px',
            mb: 1
          }}
        >
          Candidate Profile
        </Typography>

        <Typography
          color="text.secondary"
          sx={{ fontSize: '0.95rem', lineHeight: 1.7 }}
        >
          View candidate information, profile sections, data sources, and
          uploaded files.
        </Typography>
      </Box>

      <Stack spacing={3}>
        <CandidateHeader candidate={candidate} profile={profile} />

        <CandidateProfileDetails profile={profile} />

        <Box>
          <Typography variant="h6" fontWeight={700} sx={{ mb: 2 }}>
            Candidate Sections
          </Typography>

          <SectionsList sections={sections} />
        </Box>

        <Paper
          elevation={0}
          sx={{
            p: { xs: 2, md: 3 },
            border: '1px solid',
            borderColor: 'divider',
            borderRadius: 3
          }}
        >
          <Typography variant="h6" fontWeight={700} sx={{ mb: 1 }}>
            Overall Experience
          </Typography>

          <Typography color="text.secondary">
            {experience?.totalMonths ?? '—'} months{' '}
          </Typography>
        </Paper>

        <Box>
          <Typography variant="h6" fontWeight={700} sx={{ mb: 2 }}>
            Uploaded Files
          </Typography>

          <CandidateFiles files={files ?? []} />
        </Box>
        <Box>
          <Typography variant="h6" fontWeight={700} sx={{ mb: 2 }}>
            Candidate History
          </Typography>

          <CandidateHistory candidateId={id} />
        </Box>
      </Stack>
    </Container>
  );
}
