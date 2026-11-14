
import { Alert } from '@mui/material';

export default function AlertBanner({
  severity = 'info',
  message,
  sx = {},
}) {
  if (!message) return null;

  return (
    <Alert severity={severity} sx={sx}>
      {message}
    </Alert>
  );
}
