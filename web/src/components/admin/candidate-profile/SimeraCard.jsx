import { useState } from 'react';

import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  Paper,
  Stack,
  Typography
} from '@mui/material';

import useSimera from '../../../hooks/useSimera';

const getErrorMessage = (error, fallback) => {
  const errors = error?.response?.data?.errors;

  if (typeof errors === 'string') return errors;

  if (errors && typeof errors === 'object') {
    return Object.values(errors).join(' ');
  }

  return error?.response?.data?.message || error?.message || fallback;
};

const getStatusColor = (status) => {
  switch (status) {
    case 'completed':
      return 'success';
    case 'failed':
      return 'error';
    case 'processing':
      return 'info';
    case 'not_sent':
      return 'warning';
    default:
      return 'default';
  }
};

export default function SimeraCard({ candidate }) {
  const [message, setMessage] = useState('');
  const [localError, setLocalError] = useState('');

  const {
    simeraData,
    isLoadingSimera,
    simeraError,
    refetchSimera,
    uploadSimeraFileAsync,
    isUploading,
    uploadError,
    sendSimeraFileAsync,
    isSending,
    sendError
  } = useSimera(candidate?.id);

  const handleUpload = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';

    if (!file) return;

    setMessage('');
    setLocalError('');

    try {
      if (!file.name.toLowerCase().endsWith('.json')) {
        throw new Error('Please select a JSON file.');
      }

      const content = JSON.parse(await file.text());

      const fileEmail = content?.email?.trim().toLowerCase();
      const candidateEmail = candidate?.email?.trim().toLowerCase();

      if (!fileEmail) {
        throw new Error('The JSON file must contain a top-level email field.');
      }

      if (fileEmail !== candidateEmail) {
        throw new Error(
          'The email in the JSON file does not match this candidate.'
        );
      }

      await uploadSimeraFileAsync(file);

      setMessage('Simera file uploaded successfully.');
    } catch (error) {
      setLocalError(getErrorMessage(error, 'Failed to upload Simera file.'));
    }
  };

  const handleSend = async () => {
    setMessage('');
    setLocalError('');

    try {
      await sendSimeraFileAsync(candidate.id);
      setMessage('Simera file sent to processing successfully.');
    } catch (error) {
      setLocalError(getErrorMessage(error, 'Failed to send Simera file.'));
      refetchSimera();
    }
  };

  if (isLoadingSimera) {
    return (
      <Paper sx={{ p: 3, borderRadius: 3 }}>
        <CircularProgress size={26} />
      </Paper>
    );
  }

  if (simeraError) {
    return (
      <Alert severity="error">
        {getErrorMessage(simeraError, 'Failed to load Simera section.')}
      </Alert>
    );
  }

  const file = simeraData?.file;
  const job = simeraData?.job;

  return (
    <Paper
      elevation={0}
      sx={{
        p: { xs: 2, md: 3 },
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 3
      }}
    >
      <Stack spacing={2}>
        <Box>
          <Typography variant="h6" fontWeight={700}>
            Simera File
          </Typography>

          <Typography variant="body2" color="text.secondary">
            Upload and send the candidate's Simera JSON file for processing.
          </Typography>
        </Box>

        <Divider />

        {message && <Alert severity="success">{message}</Alert>}

        {localError && <Alert severity="error">{localError}</Alert>}

        {uploadError && (
          <Alert severity="error">
            {getErrorMessage(uploadError, 'Upload failed.')}
          </Alert>
        )}

        {sendError && (
          <Alert severity="error">
            {getErrorMessage(sendError, 'Send failed.')}
          </Alert>
        )}

        <Box>
          <Typography fontWeight={600} sx={{ mb: 1 }}>
            Latest Simera File
          </Typography>

          {file ? (
            <Stack spacing={1}>
              <Typography variant="body2">
                **File name:** {file.name}
              </Typography>

              <Typography variant="body2" color="text.secondary">
                Uploaded at:{' '}
                {file.uploadedAt
                  ? new Date(file.uploadedAt).toLocaleString()
                  : '—'}
              </Typography>

              <Typography variant="body2" color="text.secondary">
                File ID: {file.id}
              </Typography>

              <Button
                component="a"
                href={file.rawUrl}
                target="_blank"
                rel="noopener noreferrer"
                size="small"
                sx={{ alignSelf: 'flex-start' }}
              >
                View raw file
              </Button>
            </Stack>
          ) : (
            <Typography color="text.secondary" variant="body2">
              No Simera file uploaded yet.
            </Typography>
          )}
        </Box>

        <Divider />

        <Box>
          <Typography fontWeight={600} sx={{ mb: 1 }}>
            Processing Status
          </Typography>

          {simeraData?.status ? (
            <Stack spacing={1}>
              <Box>
                <Chip
                  label={simeraData.status.replaceAll('_', ' ')}
                  color={getStatusColor(simeraData.status)}
                  size="small"
                />
              </Box>

              {job && (
                <>
                  <Typography variant="body2" color="text.secondary">
                    Job ID: {job.id}
                  </Typography>

                  {job.pendingReviewCount != null && (
                    <Typography variant="body2" color="text.secondary">
                      Pending reviews: {job.pendingReviewCount}
                    </Typography>
                  )}

                  {job.failureReason && (
                    <Alert severity="error">{job.failureReason}</Alert>
                  )}
                </>
              )}

              {simeraData.disabledReason && (
                <Typography variant="body2" color="text.secondary">
                  {simeraData.disabledReason}
                </Typography>
              )}
            </Stack>
          ) : (
            <Typography variant="body2" color="text.secondary">
              No processing status available.
            </Typography>
          )}
        </Box>

        <Divider />

        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          spacing={2}
          alignItems={{ xs: 'stretch', sm: 'center' }}
        >
          <Button
            variant="outlined"
            component="label"
            disabled={isUploading || isSending}
          >
            {isUploading ? 'Uploading...' : 'Upload Simera JSON'}

            <input
              hidden
              type="file"
              accept=".json,application/json"
              onChange={handleUpload}
            />
          </Button>

          <Button
            variant="contained"
            disabled={!simeraData?.canSend || isSending || isUploading}
            onClick={handleSend}
          >
            {isSending ? 'Sending...' : 'Send to Processing'}
          </Button>
        </Stack>
      </Stack>
    </Paper>
  );
}
