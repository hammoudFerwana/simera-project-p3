
import {
  Box,
  Typography,
} from "@mui/material";

import ProfileSection from "./ProfileSection";

import { SECTION_CONFIG } from "../../../utils/candidateProfile";

export default function SectionsList({ sections }) {
  if (!sections || typeof sections !== "object") {
    return (
      <Typography color="text.secondary">
        No profile sections available.
      </Typography>
    );
  }

  return (
    <Box>
      {Object.entries(SECTION_CONFIG).map(([sectionName, config]) => {
        const records = sections[sectionName];

        if (!Array.isArray(records)) {
          return null;
        }

        return (
          <Box key={sectionName} sx={{ mb: 4 }}>
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                mb: 2,
              }}
            >
              <Typography variant="h6" fontWeight={700}>
                {config.title}
              </Typography>

              <Typography variant="body2" color="text.secondary">
                {records.length} {records.length === 1 ? "record" : "records"}
              </Typography>
            </Box>

            {records.length === 0 ? (
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{ py: 1 }}
              >
                No {config.title.toLowerCase()} available.
              </Typography>
            ) : (
              records.map((item, index) => (
                <ProfileSection
                  key={item.id ?? `${sectionName}-${index}`}
                  title={
                    records.length > 1
                      ? `${config.title} ${index + 1}`
                      : config.title
                  }
                  item={item}
                  fields={config.fields}
                  sectionName={sectionName}
                />
              ))
            )}
          </Box>
        );
      })}
    </Box>
  );
}
