
import { Box, Paper, Typography } from "@mui/material";

import ProfileField from "./ProfileField";
import { formatLabel } from "../../../utils/candidateProfile";

export default function ProfileSection({
  title,
  item,
  fields = [],
  sectionName,
}) {
  return (
    <Paper
      elevation={0}
      sx={{
        p: { xs: 2, md: 2.5 },
        border: "1px solid",
        borderColor: "divider",
        borderRadius: 3,
      }}
    >
      <Box sx={{ mb: 2 }}>
        <Typography fontWeight={700}>
          {title}
        </Typography>

        <Typography variant="caption" color="text.secondary">
          Record ID: {item.id}
        </Typography>
      </Box>

      {sectionName === "work_experience" && (
        <Typography
          variant="body2"
          color="text.secondary"
          sx={{ mb: 2 }}
        >
          Duration in months: {item.months ?? "—"}
        </Typography>
      )}

      {sectionName === "skills" && item.skillName && (
        <Typography fontWeight={600} sx={{ mb: 2 }}>
          {item.skillName}
        </Typography>
      )}

      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: {
            xs: "1fr",
            md: "repeat(2, minmax(0, 1fr))",
          },
          gap: 2,
        }}
      >
        {fields.map((fieldName) => (
          <ProfileField
            key={fieldName}
            label={formatLabel(fieldName)}
            field={item.fields?.[fieldName]}
          />
        ))}
      </Box>
    </Paper>
  );
}
