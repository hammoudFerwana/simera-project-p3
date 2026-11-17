import { useState } from 'react';

import {
  Alert,
  Box,
  Chip,
  CircularProgress,
  Divider,
  Grid,
  Paper,
  Stack,
  Typography
} from '@mui/material';

import ReviewOptionCard from './ReviewOptionCard';
import ReviewResolutionForm from './ReviewResolutionForm';

import useResolveReview from '../../../hooks/useResolveReview';
import useDownloadCandidateFile from '../../../hooks/useDownloadCandidateFile';

const formatValue = (value) => {
  if (value === null || value === undefined) {
    return 'No stored value';
  }

  if (typeof value === 'object') {
    return JSON.stringify(value, null, 2);
  }

  return String(value);
};

const ReviewDetails = ({ review, isLoading, loadError }) => {
  const [selectedOptionId, setSelectedOptionId] = useState(null);

  const resolveMutation = useResolveReview();
  const downloadMutation = useDownloadCandidateFile();

  if (isLoading) {
    return (
      <Box display="flex" justifyContent="center" py={6}>
        <CircularProgress />
      </Box>
    );
  }

  if (loadError || !review) {
    return (
      <Alert severity="error">
        {loadError || 'Unable to load review details.'}
      </Alert>
    );
  }

  const options = Array.isArray(review.options) ? review.options : [];
  const candidate = review.candidate;
  const conflict = review.conflict;

  const handleResolve = (payload) => {
    resolveMutation.mutate({
      id: review.id,
      payload,
      candidateId: candidate?.id
    });
  };

  const handleDownload = (sourceFile) => {
    downloadMutation.mutate({
      id: sourceFile.id,
      rawUrl: sourceFile.rawUrl,
      name: sourceFile.originalFilename
    });
  };

  const candidateName = [candidate?.firstName, candidate?.lastName]
    .filter(Boolean)
    .join(' ');

  return (
    <Stack spacing={3}>
      {/* Review Information */}
      <Paper variant="outlined" sx={{ p: 3, borderRadius: 2 }}>
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          justifyContent="space-between"
          alignItems={{ xs: 'flex-start', sm: 'center' }}
          gap={2}
        >
          <Box>
            <Typography variant="h5" fontWeight={700}>
              Review #{review.id}
            </Typography>

            <Typography color="text.secondary" variant="body2">
              {candidateName || 'Unknown candidate'}
              {candidate?.email ? ` • ${candidate.email}` : ''}
            </Typography>
          </Box>

          <Stack direction="row" gap={1} flexWrap="wrap">
            <Chip
              label={review.status}
              color={review.status === 'completed' ? 'success' : 'info'}
            />

            <Chip
              label={review.reason?.replaceAll('_', ' ') || 'Review'}
              variant="outlined"
            />
          </Stack>
        </Stack>

        <Divider sx={{ my: 2 }} />

        <Grid container spacing={2}>
          <Grid item xs={12} sm={6}>
            <Typography variant="caption" color="text.secondary">
              Candidate ID
            </Typography>

            <Typography>{candidate?.id ?? '—'}</Typography>
          </Grid>

          <Grid item xs={12} sm={6}>
            <Typography variant="caption" color="text.secondary">
              Created At
            </Typography>

            <Typography>
              {review.createdAt
                ? new Date(review.createdAt).toLocaleString()
                : '—'}
            </Typography>
          </Grid>

          {conflict && (
            <>
              <Grid item xs={12} sm={6}>
                <Typography variant="caption" color="text.secondary">
                  Item Type
                </Typography>

                <Typography>{conflict.itemType || '—'}</Typography>
              </Grid>

              <Grid item xs={12} sm={6}>
                <Typography variant="caption" color="text.secondary">
                  Field Name
                </Typography>

                <Typography>{conflict.fieldName || '—'}</Typography>
              </Grid>
            </>
          )}
        </Grid>
      </Paper>

      {/* Stored Value */}
      <Paper variant="outlined" sx={{ p: 3, borderRadius: 2 }}>
        <Typography variant="h6" fontWeight={700} mb={1}>
          Stored Value
        </Typography>

        <Box
          component="pre"
          sx={{
            m: 0,
            p: 2,
            bgcolor: 'action.hover',
            borderRadius: 1,
            whiteSpace: 'pre-wrap',
            overflowWrap: 'anywhere',
            fontFamily: 'inherit'
          }}
        >
          {formatValue(review.storedValue)}
        </Box>
      </Paper>

      {/* Proposed Options */}
      <Box>
        <Typography variant="h6" fontWeight={700} mb={2}>
          Proposed Options ({options.length})
        </Typography>

        {options.length === 0 ? (
          <Alert severity="info">
            No proposed options are available for this review.
          </Alert>
        ) : (
          <Grid container spacing={2}>
            {options.map((option) => (
              <Grid item xs={12} md={6} key={option.id}>
                <ReviewOptionCard
                  option={option}
                  selected={selectedOptionId === option.id}
                  onSelect={() => setSelectedOptionId(option.id)}
                  onDownload={handleDownload}
                  downloading={downloadMutation.isPending}
                  disabled={resolveMutation.isPending}
                />
              </Grid>
            ))}
          </Grid>
        )}
      </Box>

      {/* Resolution Form */}
      {review.targetType === 'unknown_skill' ? (
        <Alert severity="info">
          This review belongs to Unknown Skills. Please resolve it from the
          Unknown Skills page (US-19).
        </Alert>
      ) : review.status === 'completed' ? (
        <Alert severity="success">
          This review has already been completed.
        </Alert>
      ) : (
        <Paper variant="outlined" sx={{ p: 3, borderRadius: 2 }}>
          <ReviewResolutionForm
            review={review}
            selectedOptionId={selectedOptionId}
            onSubmit={handleResolve}
            isSubmitting={resolveMutation.isPending}
            error={
              resolveMutation.error?.response?.data?.message ||
              resolveMutation.error?.message ||
              ''
            }
          />
        </Paper>
      )}
    </Stack>
  );
};

export default ReviewDetails;
