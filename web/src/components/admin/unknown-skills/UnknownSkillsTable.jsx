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
  Chip
} from '@mui/material';

const formatDate = (date) => {
  if (!date) return '—';

  const parsedDate = new Date(date);

  if (Number.isNaN(parsedDate.getTime())) {
    return '—';
  }

  return new Intl.DateTimeFormat('en', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  }).format(parsedDate);
};

const formatStatus = (status) => {
  if (!status) return 'Unknown';

  return status.charAt(0).toUpperCase() + status.slice(1);
};

const isCompleted = (status) =>
  ['accepted', 'rejected'].includes(String(status || '').toLowerCase());

const UnknownSkillsTable = ({ skills = [], isLoading, onReview }) => {
  if (isLoading) {
    return <Typography>Loading unknown skills...</Typography>;
  }

  if (skills.length === 0) {
    return (
      <Paper sx={{ p: 4, textAlign: 'center' }}>
        <Typography color="text.secondary">No unknown skills found.</Typography>
      </Paper>
    );
  }

  return (
    <TableContainer component={Paper}>
      <Table>
        <TableHead>
          <TableRow>
            <TableCell>Skill Name</TableCell>
            <TableCell>Candidate</TableCell>
            <TableCell>Email</TableCell>
            <TableCell>Confidence</TableCell>
            <TableCell>Status</TableCell>
            <TableCell>Created At</TableCell>
            <TableCell align="right">Action</TableCell>
          </TableRow>
        </TableHead>

        <TableBody>
          {skills.map((skill) => {
            const candidateName = [
              skill.candidate?.firstName,
              skill.candidate?.lastName
            ]
              .filter(Boolean)
              .join(' ');

            const completed = isCompleted(skill.status);

            return (
              <TableRow key={skill.id} hover>
                <TableCell>{skill.skillName}</TableCell>

                <TableCell>{candidateName || 'Unnamed Candidate'}</TableCell>

                <TableCell>{skill.candidate?.email || '—'}</TableCell>

                <TableCell>
                  {typeof skill.confidence === 'number' &&
                  Number.isFinite(skill.confidence)
                    ? `${(skill.confidence * 100).toFixed(1)}%`
                    : '—'}
                </TableCell>

                <TableCell>
                  <Chip
                    size="small"
                    label={formatStatus(skill.status)}
                    color={
                      completed
                        ? skill.status.toLowerCase() === 'accepted'
                          ? 'success'
                          : 'error'
                        : 'default'
                    }
                  />
                </TableCell>

                <TableCell>{formatDate(skill.createdAt)}</TableCell>

                <TableCell align="right">
                  <Button
                    size="small"
                    variant="contained"
                    disabled={completed}
                    onClick={() => onReview(skill)}
                    sx={{
                      textTransform: 'none',
                      fontWeight: 600,
                      fontSize: '0.8rem',
                      borderRadius: 2,
                      px: 2,
                      py: 0.7,
                      boxShadow: 'none',
                      '&:hover': {
                        boxShadow: 'none',
                        bgcolor: 'primary.dark'
                      }
                    }}
                  >
                    {completed ? 'Reviewed' : 'Review'}
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

export default UnknownSkillsTable;
