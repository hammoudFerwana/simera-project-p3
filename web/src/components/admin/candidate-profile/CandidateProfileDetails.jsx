
import {
  Box,
  Chip,
  Divider,
  Paper,
  Stack,
  Typography,
} from "@mui/material";

import ProfileField from "./ProfileField";

import {
  PROFILE_FIELDS,
  formatLabel,
} from "../../../utils/candidateProfile";

const hasInformation = (field) => {
  if (field === null || field === undefined) return false;

  if (typeof field !== "object" || Array.isArray(field)) {
    return field !== "";
  }

  if (!Object.prototype.hasOwnProperty.call(field, "value")) {
    return Object.keys(field).length > 0;
  }

  const hasValue =
    field.value !== null &&
    field.value !== undefined &&
    field.value !== "";

  const hasSources =
    Array.isArray(field.sources) && field.sources.length > 0;

  const hasReviewInfo =
    Boolean(
      field.resolutionMethod ||
      field.approvedAt ||
      field.reviewId ||
      field.humanReviewed ||
      field.manualValue ||
      field.pendingReview
    );

  return hasValue || hasSources || hasReviewInfo;
};

export default function CandidateProfileDetails({ profile = {} }) {
  const visibleFields = PROFILE_FIELDS.filter((fieldName) =>
    hasInformation(profile?.[fieldName])
  );

  return (
    <Paper
      elevation={0}
      sx={{
        p: { xs: 2, md: 3 },
        border: "1px solid",
        borderColor: "#E5EAF2",
        borderRadius: 3,
        bgcolor: "#FFFFFF",
        overflow: "hidden",
      }}
    >
      {/* Section Header */}
      <Stack
        direction={{ xs: "column", sm: "row" }}
        justifyContent="space-between"
        alignItems={{ xs: "flex-start", sm: "center" }}
        spacing={2}
        sx={{ mb: 3 }}
      >
        <Box>
          <Stack direction="row" alignItems="center" spacing={1.5}>
            <Box
              sx={{
                width: 4,
                height: 28,
                borderRadius: 2,
                bgcolor: "primary.main",
              }}
            />

            <Box>
              <Typography
                variant="h6"
                fontWeight={750}
                color="text.primary"
              >
                Personal Information
              </Typography>

              <Typography
                variant="body2"
                color="text.secondary"
                sx={{ mt: 0.3 }}
              >
                Personal details and profile data sources
              </Typography>
            </Box>
          </Stack>
        </Box>

        <Chip
          label={`${visibleFields.length} ${
            visibleFields.length === 1 ? "Field" : "Fields"
          }`}
          size="small"
          sx={{
            bgcolor: "#EFF6FF",
            color: "#2563EB",
            fontWeight: 700,
            borderRadius: 2,
            px: 0.5,
          }}
        />
      </Stack>

      <Divider sx={{ mb: 3, borderColor: "#EDF0F5" }} />

      {/* Profile Information */}
      {visibleFields.length > 0 ? (
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: {
              xs: "1fr",
              md: "repeat(2, minmax(0, 1fr))",
            },
            gap: 1.5,

            "& .MuiAccordion-root": {
              m: 0,
              border: "1px solid #E9EDF4",
              borderRadius: "10px !important",
              bgcolor: "#FAFBFD",
              boxShadow: "none",
              overflow: "hidden",
              transition: "all 0.2s ease",
              "&:before": {
                display: "none",
              },
              "&:hover": {
                borderColor: "#B9CCF5",
                bgcolor: "#FFFFFF",
              },
              "&.Mui-expanded": {
                m: 0,
                borderColor: "#B9CCF5",
                bgcolor: "#FFFFFF",
              },
            },

            "& .MuiAccordionSummary-root": {
              minHeight: 68,
              px: 2,
              "&.Mui-expanded": {
                minHeight: 68,
              },
            },

            "& .MuiAccordionSummary-content": {
              my: 1.5,
              "&.Mui-expanded": {
                my: 1.5,
              },
            },
          }}
        >
          {visibleFields.map((fieldName) => (
            <ProfileField
              key={fieldName}
              label={formatLabel(fieldName)}
              field={profile?.[fieldName]}
            />
          ))}
        </Box>
      ) : (
        <Box
          sx={{
            py: 5,
            textAlign: "center",
            bgcolor: "#FAFBFD",
            border: "1px dashed #DCE3ED",
            borderRadius: 2,
          }}
        >
          <Typography fontWeight={600} color="text.secondary">
            No personal information available
          </Typography>

          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            Candidate profile details will appear here when available.
          </Typography>
        </Box>
      )}
    </Paper>
  );
}