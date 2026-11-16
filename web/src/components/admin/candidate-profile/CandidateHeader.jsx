
import {
  Avatar,
  Box,
  Paper,
  Stack,
  Typography,
} from "@mui/material";

import EmailOutlinedIcon from "@mui/icons-material/EmailOutlined";

import { formatDate } from "../../../utils/candidateProfile";

export default function CandidateHeader({ candidate, profile }) {
  const firstName = profile?.first_name?.value;
  const lastName = profile?.last_name?.value;

  const fullName = [firstName, lastName]
    .filter(Boolean)
    .join(" ");

  const displayName = fullName || "Unnamed Candidate";

  const initials =
    `${firstName?.[0] || ""}${lastName?.[0] || ""}` || "?";

  return (
    <Paper
      elevation={0}
      sx={{
        p: { xs: 2, md: 3 },
        mb: 3,
        border: "1px solid",
        borderColor: "divider",
        borderRadius: 3,
        bgcolor: "background.paper",
      }}
    >
      <Stack
        direction={{ xs: "column", sm: "row" }}
        spacing={2}
        alignItems={{ xs: "flex-start", sm: "center" }}
      >
        <Avatar
          sx={{
            width: 64,
            height: 64,
            bgcolor: "primary.light",
            color: "primary.dark",
            fontSize: 22,
            fontWeight: 700,
          }}
        >
          {initials}
        </Avatar>

        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="h5" fontWeight={700}>
            {displayName}
          </Typography>

          <Stack
            direction="row"
            spacing={1}
            alignItems="center"
            sx={{ mt: 1 }}
          >
            <EmailOutlinedIcon fontSize="small" color="action" />

            <Typography
              variant="body2"
              color="text.secondary"
              sx={{ overflowWrap: "anywhere" }}
            >
              {candidate?.email || "—"}
            </Typography>
          </Stack>

          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ display: "block", mt: 1 }}
          >
            Candidate ID: {candidate?.id ?? "—"}
          </Typography>

          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ display: "block" }}
          >
            Created At: {formatDate(candidate?.createdAt)}
          </Typography>
        </Box>
      </Stack>
    </Paper>
  );
}
