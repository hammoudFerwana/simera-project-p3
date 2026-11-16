
import {
  Alert,
  Box,
  CircularProgress,
  Paper,
  Stack,
  Typography,
  Divider
} from '@mui/material';

import useCandidateHistory from '../../../hooks/useCandidateHistory';

export default function CandidateHistory({ candidateId }) {
  const { data, isLoading, isError, error } =
    useCandidateHistory(candidateId);

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
        <CircularProgress size={28} />
      </Box>
    );
  }

  if (isError) {
    return (
      <Alert severity="error">
        {error?.response?.data?.message ||
          'Failed to load candidate history.'}
      </Alert>
    );
  }

  const items = data?.items ?? [];

  if (items.length === 0) {
    return (
      <Alert severity="info">
        No history records found for this candidate.
      </Alert>
    );
  }

  return (
    <Stack spacing={2}>
      {items.map((item) => (
        <Paper
          key={item.id}
          elevation={0}
          sx={{
            p: 2.5,
            border: '1px solid',
            borderColor: 'divider',
            borderRadius: 2
          }}
        >
          <Stack spacing={1.5}>
            <Typography fontWeight={700}>
              {item.fieldName || item.itemType}
            </Typography>

            <Box>
              <Typography variant="caption" color="text.secondary">
                Previous Value
              </Typography>
              <Typography sx={{ overflowWrap: 'anywhere' }}>
                {item.previousValue ?? '—'}
              </Typography>
            </Box>

            <Divider />

            <Box>
              <Typography variant="caption" color="text.secondary">
                New Value
              </Typography>
              <Typography sx={{ overflowWrap: 'anywhere' }}>
                {item.newValue ?? '—'}
              </Typography>
            </Box>

            <Divider />

            <Typography variant="body2" color="text.secondary">
              Changed by: {item.changedBy?.email ?? 'Unknown'}
            </Typography>

            <Typography variant="body2" color="text.secondary">
              {item.timestamp
                ? new Date(item.timestamp).toLocaleString()
                : '—'}
            </Typography>

            {item.reason && (
              <Typography variant="body2">
                Reason: {item.reason}
              </Typography>
            )}
          </Stack>
        </Paper>
      ))}
    </Stack>
  );
}
