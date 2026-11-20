
import {
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
  Button,
  Chip,
  Stack,
} from "@mui/material";

import { useNavigate } from "react-router-dom";

const formatDate = (date) => {
  if (!date) return "—";

  const parsedDate = new Date(date);

  if (Number.isNaN(parsedDate.getTime())) {
    return "—";
  }

  return new Intl.DateTimeFormat("en", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(parsedDate);
};

const formatStatus = (status) => {
  if (!status) return "No status";

  return status
    .replaceAll("_", " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
};

const CandidatesTable = ({ candidates = [], isLoading }) => {
  const navigate = useNavigate();

  if (isLoading) {
    return <Typography>Loading candidates...</Typography>;
  }

  if (candidates.length === 0) {
    return (
      <Paper sx={{ p: 4, textAlign: "center" }}>
        <Typography color="text.secondary">
          No candidates found.
        </Typography>
      </Paper>
    );
  }

  return (
   <TableContainer
  component={Paper}
  sx={{
    width: "100%",
    overflowX: "auto",
  }}
>
  <Table
    sx={{
      minWidth: { xs: 850, md: 900 },
      whiteSpace: "nowrap",
    }}
  >
        <TableHead>
          <TableRow>
            <TableCell>Candidate Name</TableCell>
            <TableCell>Email</TableCell>
            <TableCell>Processing Status</TableCell>
            <TableCell>Pending Reviews</TableCell>
            <TableCell>Uploaded Files</TableCell>
            <TableCell>Created At</TableCell>
            <TableCell align="right">Action</TableCell>
          </TableRow>
        </TableHead>

        <TableBody>
          {candidates.map((candidate) => {
            const fullName = [
              candidate.firstName,
              candidate.lastName,
            ]
              .filter(Boolean)
              .join(" ");

            const hasPendingReviews =
              (candidate.pendingReviewCount ?? 0) > 0;

            return (
              <TableRow key={candidate.id} hover>
                <TableCell>
                  <Stack
                    direction="row"
                    alignItems="center"
                    spacing={1}
                    flexWrap="wrap"
                    useFlexGap
                  >
                    <Typography variant="body2" fontWeight={600}>
                      {fullName || "Unnamed Candidate"}
                    </Typography>

                    {hasPendingReviews && (
                      <Chip
                        label="Needs Review"
                        color="warning"
                        size="small"
                      />
                    )}
                  </Stack>
                </TableCell>

                <TableCell>{candidate.email}</TableCell>

                <TableCell>
                  <Chip
                    size="small"
                    label={formatStatus(candidate.latestJobStatus)}
                  />
                </TableCell>

                <TableCell>
                  {candidate.pendingReviewCount ?? 0}
                </TableCell>

                <TableCell>
                  {candidate.fileCount ?? 0}
                </TableCell>

                <TableCell>
                  {formatDate(candidate.createdAt)}
                </TableCell>

                <TableCell align="right">
                  <Button
                    size="small"
                    variant="contained"
                    onClick={() =>
                      navigate(`/admin/candidates/${candidate.id}`)
                    }
                    sx={{
                      textTransform: "none",
                      fontWeight: 600,
                      fontSize: "0.8rem",
                      borderRadius: 2,
                      px: 2,
                      py: 0.7,
                      boxShadow: "none",
                      "&:hover": {
                        boxShadow: "none",
                        bgcolor: "primary.dark",
                      },
                    }}
                  >
                    View Profile
                  </Button>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </TableContainer>
  );
};

export default CandidatesTable;
