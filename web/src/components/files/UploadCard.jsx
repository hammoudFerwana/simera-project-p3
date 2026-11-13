
import {
  Box,
  Typography,
  Paper,
  Button,
} from '@mui/material';

import CloudUploadOutlinedIcon from '@mui/icons-material/CloudUploadOutlined';

import AlertBanner from './AlertBanner';

export default function UploadCard({
  type,
  title,
  description,
  file,
  error,
  success,
  inputRef,
  onFileChange,
  onUpload,
  isPending,
  accept,
  formats,
}) {
  return (
    <Paper sx={{ p: 3, borderRadius: 3 }}>
      <Typography variant="h6" fontWeight={700}>
        {title}
      </Typography>

      <Typography color="text.secondary" variant="body2" sx={{ mt: 1 }}>
        {description}
      </Typography>

      <input
        ref={inputRef}
        type="file"
        accept={accept}
        hidden
        onChange={onFileChange}
      />

      <Box
        sx={{
          mt: 3,
          p: 4,
          border: '2px dashed',
          borderColor: 'divider',
          borderRadius: 2,
          textAlign: 'center',
        }}
      >
        <CloudUploadOutlinedIcon
          sx={{ fontSize: 45, color: 'primary.main', mb: 1 }}
        />

        <Typography fontWeight={600}>
          {type === 'cv' ? 'Choose your CV file' : 'Choose your LinkedIn file'}
        </Typography>

        <Typography variant="body2" color="text.secondary">
          Select a file from your device
        </Typography>

        <Button
          variant="outlined"
          sx={{ mt: 2 }}
          onClick={() => inputRef.current?.click()}
        >
          Browse Files
        </Button>
      </Box>

      <Typography variant="caption" color="text.secondary">
        Accepted formats: {formats} · Maximum size: 10 MB
      </Typography>

      {file && (
        <Box sx={{ mt: 2 }}>
          <Typography variant="body2" fontWeight={600}>
            Selected file: {file.name}
          </Typography>

          <Typography variant="caption" color="text.secondary">
            {(file.size / (1024 * 1024)).toFixed(2)} MB
          </Typography>

          <Button
            variant="contained"
            fullWidth
            sx={{ mt: 2 }}
            disabled={isPending || Boolean(success)}
            onClick={onUpload}
          >
            {isPending ? 'Uploading...' : 'Upload File'}
          </Button>
        </Box>
      )}

      <AlertBanner
        severity="error"
        message={error}
        sx={{ mt: 2 }}
      />

      <AlertBanner
        severity="success"
        message={success}
        sx={{ mt: 2 }}
      />
    </Paper>
  );
}
