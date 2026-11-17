import { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  MenuItem,
  Stack,
  TextField,
  Typography
} from '@mui/material';

import ReviewConfidenceInput from './ReviewConfidenceInput';

const ReviewResolutionForm = ({
  review,
  selectedOptionId,
  onSubmit,
  isSubmitting = false,
  error = ''
}) => {
  const isItemMatch =
    review?.reason === 'item_match_uncertain' ||
    review?.conflict?.fieldName === '__item__';

  const [action, setAction] = useState(isItemMatch ? 'merge' : 'choose');
  const [manualValue, setManualValue] = useState('');
  const [confidence, setConfidence] = useState(0.8);
  const [reason, setReason] = useState('');

  const handleActionChange = (event) => {
    setAction(event.target.value);
  };

  const handleSubmit = (event) => {
    event.preventDefault();

    const payload = {
      action,
      confidence
    };

    if (action === 'choose') {
      payload.optionId = Number(selectedOptionId);
    }

    if (action === 'manual') {
      payload.value = manualValue;
    }

    if (reason.trim()) {
      payload.reason = reason.trim();
    }

    onSubmit(payload);
  };

  const isValid =
    Number.isFinite(confidence) &&
    confidence >= 0 &&
    confidence <= 1 &&
    (action !== 'choose' ||
      (Number.isInteger(Number(selectedOptionId)) &&
        Number(selectedOptionId) > 0)) &&
    (action !== 'manual' || manualValue.trim() !== '');

  return (
    <Box component="form" onSubmit={handleSubmit}>
      <Stack spacing={3}>
        <Typography variant="h6" fontWeight={700}>
          Resolve Review
        </Typography>

        {isItemMatch ? (
          <Alert severity="info">
            This is an uncertain item match. Choose whether the item should be
            merged with the existing item or added separately.
          </Alert>
        ) : null}

        <TextField
          select
          label="Resolution Action"
          value={action}
          onChange={handleActionChange}
          fullWidth
          disabled={isSubmitting}
        >
          {isItemMatch ? (
            <>
              <MenuItem value="merge">Same entity — Merge</MenuItem>
              <MenuItem value="add">Separate item — Add</MenuItem>
            </>
          ) : (
            <>
              <MenuItem value="choose">Choose an option</MenuItem>
              <MenuItem value="manual">Enter a manual value</MenuItem>
            </>
          )}
        </TextField>

        {action === 'choose' && (
          <Alert severity={selectedOptionId ? 'info' : 'warning'}>
            {selectedOptionId
              ? `Selected option: #${selectedOptionId}`
              : 'Please select an option before submitting.'}
          </Alert>
        )}

        {action === 'manual' && (
          <TextField
            label="Manual Value"
            value={manualValue}
            onChange={(event) => setManualValue(event.target.value)}
            fullWidth
            multiline
            minRows={2}
            required
            disabled={isSubmitting}
          />
        )}

        <ReviewConfidenceInput
          value={confidence}
          onChange={setConfidence}
          disabled={isSubmitting}
        />

        <TextField
          label="Reason (optional)"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          fullWidth
          multiline
          minRows={2}
          inputProps={{ maxLength: 1000 }}
          helperText={`${reason.length}/1000`}
          disabled={isSubmitting}
        />

        {error && <Alert severity="error">{error}</Alert>}

        <Button
          type="submit"
          variant="contained"
          fullWidth
          disabled={!isValid || isSubmitting}
        >
          {isSubmitting ? 'Submitting...' : 'Submit Resolution'}
        </Button>
      </Stack>
    </Box>
  );
};

export default ReviewResolutionForm;
