import {
  Alert,
  Box,
  Chip,
  CircularProgress,
  IconButton,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
  Typography
} from '@mui/material';

import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';

const getStatusColor = (status) => {
  switch (status) {
    case 'pending':
      return 'warning';
    case 'in_review':
      return 'info';
    case 'completed':
      return 'success';
    default:
      return 'default';
  }
};

const formatReason = (reason) => {
  return reason?.replaceAll('_', ' ') || '—';
};

const ReviewTable = ({
  reviews = [],
  isLoading = false,
  error = null,
  onView
}) => {
  if (isLoading) {
    return (
      <Box display="flex" justifyContent="center" py={6}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return <Alert severity="error">{error}</Alert>;
  }

  if (reviews.length === 0) {
    return (
      <Alert severity="info">No reviews found for the selected filters.</Alert>
    );
  }

  return (
    <TableContainer component={Paper} variant="outlined">
      <Table>
        <TableHead>
          <TableRow>
            <TableCell>Review ID</TableCell>
            <TableCell>Candidate</TableCell>
            <TableCell>Email</TableCell>
            <TableCell>Reason</TableCell>
            <TableCell>Target Type</TableCell>
            <TableCell>Status</TableCell>
            <TableCell>Created At</TableCell>
            <TableCell align="center">Action</TableCell>
          </TableRow>
        </TableHead>

        <TableBody>
          {reviews.map((review) => {
            const candidateName = [
              review.candidate?.firstName,
              review.candidate?.lastName
            ]
              .filter(Boolean)
              .join(' ');

            return (
              <TableRow hover key={review.id}>
                <TableCell>
                  <Typography fontWeight={600}>#{review.id}</Typography>
                </TableCell>

                <TableCell>{candidateName || 'Unknown candidate'}</TableCell>

                <TableCell>{review.candidate?.email || '—'}</TableCell>

                <TableCell sx={{ textTransform: 'capitalize' }}>
                  {formatReason(review.reason)}
                </TableCell>

                <TableCell>{review.targetType || '—'}</TableCell>

                <TableCell>
                  <Chip
                    label={formatReason(review.status)}
                    color={getStatusColor(review.status)}
                    size="small"
                  />
                </TableCell>

                <TableCell>
                  {review.createdAt
                    ? new Date(review.createdAt).toLocaleDateString()
                    : '—'}
                </TableCell>

                <TableCell align="center">
                  <Tooltip title="View review details">
                    <IconButton
                      color="primary"
                      onClick={() => onView?.(review.id)}
                      aria-label={`View review ${review.id}`}
                    >
                      <VisibilityOutlinedIcon />
                    </IconButton>
                  </Tooltip>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </TableContainer>
  );
};

export default ReviewTable;
