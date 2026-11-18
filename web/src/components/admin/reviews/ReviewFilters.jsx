import { Button, MenuItem, Paper, Stack, TextField } from '@mui/material';

const ReviewFilters = ({ filters, onChange, onReset }) => {
  const handleChange = (field) => (event) => {
    onChange({
      ...filters,
      [field]: event.target.value,
      page: 1
    });
  };

  return (
    <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
      <Stack
        direction={{ xs: 'column', md: 'row' }}
        spacing={2}
        alignItems={{ xs: 'stretch', md: 'center' }}
      >
        <TextField
          select
          label="Status"
          value={filters.status}
          onChange={handleChange('status')}
          size="small"
          fullWidth
        >
          <MenuItem value="pending">Pending</MenuItem>
          <MenuItem value="in_review">In Review</MenuItem>
          <MenuItem value="completed">Completed</MenuItem>
        </TextField>

        <TextField
          select
          label="Reason"
          value={filters.reason}
          onChange={handleChange('reason')}
          size="small"
          fullWidth
        >
          <MenuItem value="">All Reasons</MenuItem>
          <MenuItem value="conflict">Conflict</MenuItem>
          <MenuItem value="intra_source_conflict">
            Intra-source Conflict
          </MenuItem>
          <MenuItem value="low_confidence">Low Confidence</MenuItem>
          <MenuItem value="validation_failure">Validation Failure</MenuItem>
          <MenuItem value="item_match_uncertain">Item Match Uncertain</MenuItem>
          <MenuItem value="unknown_skill">Unknown Skill</MenuItem>
        </TextField>

        <TextField
          label="Candidate ID"
          type="number"
          value={filters.candidateId}
          onChange={handleChange('candidateId')}
          size="small"
          fullWidth
          inputProps={{ min: 1 }}
        />

        <Button variant="outlined" onClick={onReset} sx={{ minWidth: 110 }}>
          Reset
        </Button>
      </Stack>
    </Paper>
  );
};

export default ReviewFilters;
