
import {
  Box,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";

import StatusBadge from "./StatusBadge";

const formatDate = (date) => {
  if (!date) return "—";

  const parsedDate = new Date(date);

  if (Number.isNaN(parsedDate.getTime())) {
    return "—";
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(parsedDate);
};

const getFileTypeLabel = (type) => {
  const types = {
    cv: "CV / Resume",
    linkedin: "LinkedIn",
  };

  return types[type] || "Unknown";
};

export default function FilesTable({ files = [] }) {
  return (
    
<Box sx={{ mt: 4 }}>
  <Typography
    variant="h6"
    sx={{
      fontWeight: 800,
      color: "primary.main",
      letterSpacing: "-0.4px",
      fontSize: { xs: "1.15rem", md: "1.3rem" },
      mb: 2,
    }}
  >
    Uploaded Files
  </Typography>

      <TableContainer component={Paper} sx={{ borderRadius: 2 }}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>File Name</TableCell>
              <TableCell>Type</TableCell>
              <TableCell>Uploaded At</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Message</TableCell>
            </TableRow>
          </TableHead>

          <TableBody>
            {files.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} align="center">
                  <Typography color="text.secondary" sx={{ py: 3 }}>
                    No files uploaded yet.
                  </Typography>
                </TableCell>
              </TableRow>
            ) : (
              files.map((file) => (
                <TableRow key={file.id}>
                  <TableCell>{file.name}</TableCell>

                  <TableCell>
                    {getFileTypeLabel(file.type)}
                  </TableCell>

                  <TableCell>
                    {formatDate(file.uploadedAt)}
                  </TableCell>

                  <TableCell>
                    <StatusBadge status={file.status} />
                  </TableCell>

                  <TableCell>
                    {file.message || "—"}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
}