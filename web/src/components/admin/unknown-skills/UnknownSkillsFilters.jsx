
import {
  Box,
  TextField,
  MenuItem,
  Button,
} from "@mui/material";

const UnknownSkillsFilters = ({
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
            lg: "minmax(200px, 1fr) auto",
          },
          gap: 2,
          alignItems: "center",
        }}
      >
        <TextField
          fullWidth
          select
          label="Review Status"
          name="status"
          value={filters.status}
          onChange={handleChange}
          size="small"
        >
          <MenuItem value="pending">Pending</MenuItem>
          <MenuItem value="accepted">Accepted</MenuItem>
          <MenuItem value="rejected">Rejected</MenuItem>
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

export default UnknownSkillsFilters;
