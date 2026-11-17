import { Box, Slider, Stack, Typography } from '@mui/material';

const ReviewConfidenceInput = ({
  value,
  onChange,
  disabled = false,
  error = false,
  helperText = ''
}) => {
  const percentage = Math.round(Number(value ?? 0) * 100);

  const handleChange = (_, newValue) => {
    onChange(newValue / 100);
  };

  return (
    <Stack spacing={1}>
      <Box display="flex" alignItems="center" justifyContent="space-between">
        <Typography variant="subtitle2" fontWeight={600}>
          Decision Confidence
        </Typography>

        <Typography
          variant="body2"
          fontWeight={700}
          color={error ? 'error.main' : 'primary.main'}
        >
          {percentage}%
        </Typography>
      </Box>

      <Slider
        value={percentage}
        onChange={handleChange}
        min={0}
        max={100}
        step={1}
        disabled={disabled}
        valueLabelDisplay="auto"
        valueLabelFormat={(value) => `${value}%`}
        aria-label="Decision confidence"
      />

      {helperText && (
        <Typography
          variant="caption"
          color={error ? 'error.main' : 'text.secondary'}
        >
          {helperText}
        </Typography>
      )}
    </Stack>
  );
};

export default ReviewConfidenceInput;
