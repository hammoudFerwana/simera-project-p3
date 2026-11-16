
import {
  Box,
  TextField,
  MenuItem,
  Button,
} from "@mui/material";

const CandidatesFilters = ({
  filters,
  onFilterChange,
  onClear,
}) => {
  const handleChange = (event) => {
    const { name, value } = event.target;
    onFilterChange(name, value);
  };

  return (
    <Box sx={{ mb: 1 }}>
   

      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: {
            xs: "1fr",
            sm: "repeat(2, minmax(0, 1fr))",
            lg: "minmax(240px, 1.5fr) repeat(2, minmax(170px, 1fr)) auto",
          },
          gap: 2,
          alignItems: "center",
        }}
      >
        <TextField
          fullWidth
          label="Search candidates"
          placeholder="Enter name or email"
          name="search"
          value={filters.search}
          onChange={handleChange}
          size="small"
        />

        <TextField
          fullWidth
          select
          label="Processing Status"
          name="status"
          value={filters.status}
          onChange={handleChange}
          size="small"
        >
          <MenuItem value="">All statuses</MenuItem>
          <MenuItem value="queued">Queued</MenuItem>
          <MenuItem value="processing">Processing</MenuItem>
          <MenuItem value="completed">Completed</MenuItem>
          <MenuItem value="completed_with_review">
            Completed with review
          </MenuItem>
          <MenuItem value="failed">Failed</MenuItem>
        </TextField>

        <TextField
          fullWidth
          select
          label="Pending Review"
          name="hasPendingReview"
          value={filters.hasPendingReview}
          onChange={handleChange}
          size="small"
        >
          <MenuItem value="">All candidates</MenuItem>
          <MenuItem value="true">Has pending review</MenuItem>
          <MenuItem value="false">No pending review</MenuItem>
        </TextField>

        <Button
          variant="outlined"
          color="secondary"
          onClick={onClear}
          sx={{
            height: 40,
            px: 2.5,
            whiteSpace: "nowrap",
            borderRadius: 2,
            fontWeight: 600,
            textTransform: "none",
          }}
        >
          Clear Filters
        </Button>
      </Box>
    </Box>
  );
};

export default CandidatesFilters;


