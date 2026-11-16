
import { Box, Pagination, Typography } from "@mui/material";

const CandidatesPagination = ({
  page,
  pageSize,
  total,
  onPageChange,
}) => {
  const totalPages = Math.ceil(total / pageSize);

  if (totalPages <= 1) {
    return null;
  }

  return (
    <Box
      display="flex"
      justifyContent="space-between"
      alignItems="center"
      flexWrap="wrap"
      gap={2}
      mt={3}
    >
      <Typography variant="body2" color="text.secondary">
        Total candidates: {total}
      </Typography>

      <Pagination
        count={totalPages}
        page={page}
        onChange={(_, newPage) => onPageChange(newPage)}
        color="primary"
        shape="rounded"
      />
    </Box>
  );
};

export default CandidatesPagination;
