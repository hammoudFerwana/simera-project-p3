
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Chip,
  Divider,
  Stack,
  Typography,
} from "@mui/material";

import ExpandMoreIcon from "@mui/icons-material/ExpandMore";

import {
  formatDate,
  formatValue,
} from "../../../utils/candidateProfile";

export default function FieldMetadata({ field }) {
  if (!field || typeof field !== "object") {
    return null;
  }

  const sources = Array.isArray(field.sources) ? field.sources : [];

  return (
    <Accordion
      disableGutters
      elevation={0}
      sx={{
        mt: 1.5,
        border: "1px solid",
        borderColor: "divider",
        borderRadius: 2,
        "&::before": { display: "none" },
      }}
    >
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Stack spacing={0.5}>
          <Typography variant="body2" fontWeight={600}>
            Source & Review Details
          </Typography>

          <Typography variant="caption" color="text.secondary">
            {sources.length} source(s)
          </Typography>
        </Stack>
      </AccordionSummary>

      <AccordionDetails>
        <Stack
          direction="row"
          spacing={1}
          flexWrap="wrap"
          useFlexGap
          sx={{ mb: 2 }}
        >
          {field.humanReviewed && (
            <Chip label="Human Reviewed" size="small" color="success" />
          )}

          {field.manualValue && (
            <Chip label="Manual Value" size="small" color="info" />
          )}

          {field.pendingReview && (
            <Chip label="Pending Review" size="small" color="warning" />
          )}
        </Stack>

        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: {
              xs: "1fr",
              sm: "repeat(2, minmax(0, 1fr))",
            },
            gap: 2,
          }}
        >
          <MetadataItem
            label="Resolution Method"
            value={field.resolutionMethod}
          />

          <MetadataItem
            label="Approved At"
            value={field.approvedAt ? formatDate(field.approvedAt) : null}
          />

          <MetadataItem label="Review ID" value={field.reviewId} />

          <MetadataItem
            label="Human Reviewed"
            value={field.humanReviewed}
          />

          <MetadataItem
            label="Manual Value"
            value={field.manualValue}
          />

          <MetadataItem
            label="Pending Review"
            value={field.pendingReview}
          />
        </Box>

        <Divider sx={{ my: 2 }} />

        <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1.5 }}>
          Sources ({sources.length})
        </Typography>

        {sources.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            No source records available.
          </Typography>
        ) : (
          <Stack spacing={1.5}>
            {sources.map((source, index) => (
              <Box
                key={`${source.fileId ?? "file"}-${source.jobId ?? index}-${index}`}
                sx={{
                  p: 2,
                  border: "1px solid",
                  borderColor: "divider",
                  borderRadius: 2,
                  bgcolor: "background.default",
                }}
              >
                <Typography variant="subtitle2" fontWeight={700}>
                  {source.fileName || "Unnamed File"}
                </Typography>

                <Box
                  sx={{
                    display: "grid",
                    gridTemplateColumns: {
                      xs: "1fr",
                      sm: "repeat(2, minmax(0, 1fr))",
                    },
                    gap: 1.5,
                    mt: 1.5,
                  }}
                >
                  <MetadataItem label="File ID" value={source.fileId} />

                  <MetadataItem label="Job ID" value={source.jobId} />

                  <MetadataItem label="File Type" value={source.fileType} />

                  <MetadataItem
                    label="Uploaded At"
                    value={source.uploadedAt ? formatDate(source.uploadedAt) : null}
                  />

                  <MetadataItem
                    label="Confidence"
                    value={source.confidence}
                  />
                </Box>

                <Box sx={{ mt: 1.5 }}>
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    fontWeight={700}
                  >
                    Source Value
                  </Typography>

                  <Typography
                    variant="body2"
                    sx={{
                      mt: 0.5,
                      whiteSpace: "pre-wrap",
                      overflowWrap: "anywhere",
                    }}
                  >
                    {formatValue(source.value)}
                  </Typography>
                </Box>

                <Box sx={{ mt: 1.5 }}>
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    fontWeight={700}
                  >
                    Evidence
                  </Typography>

                  <Typography
                    variant="body2"
                    sx={{
                      mt: 0.5,
                      whiteSpace: "pre-wrap",
                      overflowWrap: "anywhere",
                    }}
                  >
                    {formatValue(source.evidence)}
                  </Typography>
                </Box>
              </Box>
            ))}
          </Stack>
        )}
      </AccordionDetails>
    </Accordion>
  );
}

function MetadataItem({ label, value }) {
  return (
    <Box>
      <Typography variant="caption" color="text.secondary" display="block">
        {label}
      </Typography>

      <Typography
        variant="body2"
        fontWeight={500}
        sx={{ overflowWrap: "anywhere" }}
      >
        {value === null || value === undefined || value === ""
          ? "—"
          : formatValue(value)}
      </Typography>
    </Box>
  );
}
