import { Box, Button, Chip, Divider, Stack, Typography } from '@mui/material';

const ReviewOptionCard = ({
  option,
  selected = false,
  onSelect,
  disabled = false,
  onDownload,
  downloading = false
}) => {
  if (!option) return null;

  const confidence = Number(option.confidence);
  const confidenceLabel = Number.isFinite(confidence)
    ? `${Math.round(confidence * 100)}%`
    : 'Not available';

  const sourceFile = option.sourceFile;

  return (
    <Box
      sx={{
        p: 2,
        border: 1,
        borderColor: selected ? 'primary.main' : 'divider',
        borderRadius: 2,
        bgcolor: selected ? 'action.selected' : 'background.paper',
        transition: 'border-color 0.2s ease'
      }}
    >
      <Stack spacing={2}>
        <Stack
          direction="row"
          alignItems="center"
          justifyContent="space-between"
          gap={1}
        >
          <Typography variant="subtitle2" fontWeight={700}>
            Option #{option.id}
          </Typography>

          <Chip
            label={`Confidence: ${confidenceLabel}`}
            size="small"
            color="info"
            variant="outlined"
          />
        </Stack>

        <Box>
          <Typography
            variant="caption"
            color="text.secondary"
            display="block"
            mb={0.5}
          >
            Proposed Value
          </Typography>

          <Typography variant="body1" sx={{ overflowWrap: 'anywhere' }}>
            {option.value === null || option.value === undefined
              ? 'No value'
              : typeof option.value === 'object'
                ? JSON.stringify(option.value, null, 2)
                : String(option.value)}
          </Typography>
        </Box>

        {option.evidence && (
          <>
            <Divider />

            <Box>
              <Typography
                variant="caption"
                color="text.secondary"
                display="block"
                mb={0.5}
              >
                Evidence
              </Typography>

              <Typography
                variant="body2"
                sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}
              >
                {option.evidence}
              </Typography>
            </Box>
          </>
        )}

        {sourceFile && (
          <>
            <Divider />

            <Stack spacing={1}>
              <Typography variant="caption" color="text.secondary">
                Source File
              </Typography>

              <Typography variant="body2" fontWeight={600}>
                {sourceFile.originalFilename || 'Unnamed file'}
              </Typography>

              {sourceFile.sourceType && (
                <Typography variant="caption" color="text.secondary">
                  Source type: {sourceFile.sourceType}
                </Typography>
              )}

              {sourceFile.uploadedAt && (
                <Typography variant="caption" color="text.secondary">
                  Uploaded: {new Date(sourceFile.uploadedAt).toLocaleString()}
                </Typography>
              )}

              {onDownload && sourceFile.rawUrl && (
                <Button
                  variant="outlined"
                  size="small"
                  onClick={() => onDownload(sourceFile)}
                  disabled={disabled || downloading}
                  sx={{ alignSelf: 'flex-start' }}
                >
                  {downloading ? 'Downloading...' : 'Download Source'}
                </Button>
              )}
            </Stack>
          </>
        )}

        <Divider />

        <Button
          variant={selected ? 'contained' : 'outlined'}
          onClick={onSelect}
          disabled={disabled || selected}
          fullWidth
        >
          {selected ? 'Selected' : 'Choose This Option'}
        </Button>
      </Stack>
    </Box>
  );
};

export default ReviewOptionCard;
