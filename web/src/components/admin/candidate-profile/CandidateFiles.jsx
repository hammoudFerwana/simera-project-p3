
import {
  Alert,
  Box,
  Button,
  Chip,
  Paper,
  Stack,
  Typography,
} from "@mui/material";

import DescriptionOutlinedIcon from "@mui/icons-material/DescriptionOutlined";
import DownloadOutlinedIcon from "@mui/icons-material/DownloadOutlined";

import useDownloadCandidateFile from "../../../hooks/useDownloadCandidateFile";
import { formatDate, formatLabel } from "../../../utils/candidateProfile";

const getStatusColor = (status) => {
  switch (status) {
    case "completed":
      return "success";
    case "completed_with_review":
      return "warning";
    case "processing":
      return "info";
    case "failed":
      return "error";
    case "queued":
      return "default";
    default:
      return "default";
  }
};

export default function CandidateFiles({ files = [] }) {
  const {
    mutate: downloadFile,
    isPending,
    variables,
    error,
  } = useDownloadCandidateFile();

  if (!files.length) {
    return (
      <Paper
        elevation={0}
        sx={{
          p: 3,
          border: "1px solid",
          borderColor: "divider",
          borderRadius: 3,
        }}
      >
        <Typography color="text.secondary">
          No uploaded files found for this candidate.
        </Typography>
      </Paper>
    );
  }

  return (
    <Box>
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error?.response?.data?.message ||
            "Failed to download the file. Please try again."}
        </Alert>
      )}

      <Stack spacing={2}>
        {files.map((file) => {
          const isDownloading =
            isPending && variables?.id === file.id;

          return (
            <Paper
              key={file.id}
              elevation={0}
              sx={{
                p: { xs: 2, md: 2.5 },
                border: "1px solid",
                borderColor: "divider",
                borderRadius: 3,
                transition: "border-color 0.2s ease",
                "&:hover": {
                  borderColor: "primary.main",
                },
              }}
            >
              <Stack
                direction={{ xs: "column", sm: "row" }}
                justifyContent="space-between"
                alignItems={{ xs: "flex-start", sm: "center" }}
                spacing={2}
              >
                <Stack
                  direction="row"
                  spacing={2}
                  alignItems="center"
                  sx={{ minWidth: 0, flex: 1 }}
                >
                  <Box
                    sx={{
                      width: 44,
                      height: 44,
                      borderRadius: 2,
                      bgcolor: "action.hover",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    <DescriptionOutlinedIcon color="primary" />
                  </Box>

                  <Box sx={{ minWidth: 0 }}>
                    <Typography
                      fontWeight={600}
                      sx={{ overflowWrap: "anywhere" }}
                    >
                      {file.name || "Unnamed file"}
                    </Typography>

                    <Typography
                      variant="body2"
                      color="text.secondary"
                      sx={{ mt: 0.5 }}
                    >
                      {formatLabel(file.type || "Unknown type")}
                      {" · "}
                      Uploaded {formatDate(file.uploadedAt)}
                    </Typography>

                    <Typography
                      variant="caption"
                      color="text.secondary"
                    >
                      File ID: {file.id}
                    </Typography>
                  </Box>
                </Stack>

                <Stack
                  direction="row"
                  alignItems="center"
                  spacing={1}
                  flexWrap="wrap"
                >
                  <Chip
                    size="small"
                    label={formatLabel(file.status || "Unknown")}
                    color={getStatusColor(file.status)}
                  />

                  <Button
                    size="small"
                    variant="outlined"
                    startIcon={<DownloadOutlinedIcon />}
                    disabled={!file.rawUrl || isDownloading}
                    onClick={() => downloadFile(file)}
                  >
                    {isDownloading ? "Downloading..." : "Download"}
                  </Button>
                </Stack>
              </Stack>

              <Box
                sx={{
                  mt: 2,
                  pt: 2,
                  borderTop: "1px solid",
                  borderColor: "divider",
                }}
              >
                <Stack spacing={1}>
                  <Typography variant="body2" color="text.secondary">
                    Completed at: {formatDate(file.completedAt)}
                  </Typography>

                  <Typography variant="body2" color="text.secondary">
                    Pending reviews: {file.pendingReviewCount ?? 0}
                  </Typography>

                  {file.failureReason && (
                    <Alert severity="error">
                      {file.failureReason}
                    </Alert>
                  )}
                </Stack>
              </Box>
            </Paper>
          );
        })}
      </Stack>
    </Box>
  );
}
