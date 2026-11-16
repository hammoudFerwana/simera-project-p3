
import { useState } from "react";

import {
  Alert,
  Box,
  Container,
  Paper,
  Typography,
} from "@mui/material";

import CandidatesFilters from "../../components/admin/CandidatesFilters";
import CandidatesTable from "../../components/admin/CandidatesTable";
import CandidatesPagination from "../../components/admin/CandidatesPagination";

import useAdminCandidates from "../../hooks/useAdminCandidates";

const INITIAL_FILTERS = {
  search: "",
  status: "",
  hasPendingReview: "",
  page: 1,
  pageSize: 20,
};

export default function Candidates() {
  const [filters, setFilters] = useState(INITIAL_FILTERS);

  const {
    data,
    isLoading,
    isError,
    error,
  } = useAdminCandidates(filters);

  const handleFilterChange = (name, value) => {
    setFilters((previousFilters) => ({
      ...previousFilters,
      [name]: value,
      page: 1,
    }));
  };

  const handleClearFilters = () => {
    setFilters(INITIAL_FILTERS);
  };

  const handlePageChange = (newPage) => {
    setFilters((previousFilters) => ({
      ...previousFilters,
      page: newPage,
    }));
  };

  return (
    <Container maxWidth="xl">
  <Box
  sx={{
    mb: 5,
    mt: 1,
  }}
>
  <Typography
    variant="h4"
    sx={{
      fontSize: { xs: "1.6rem", md: "1.9rem" },
      fontWeight: 700,
      color: "text.primary",
      letterSpacing: "-0.5px",
      mb: 1,
    }}
  >
    Candidates
  </Typography>

  <Typography
    variant="body1"
    sx={{
      color: "text.secondary",
      fontSize: "0.95rem",
      lineHeight: 1.7,
    }}
  >
    Manage candidates, review their profiles, and track processing status.
  </Typography>
</Box>

      <Paper sx={{ p: 3, borderRadius: 2 }}>
    <CandidatesFilters
  filters={filters}
  onFilterChange={handleFilterChange}
  onClear={handleClearFilters}
/>

<Box
  sx={{
    mt: 3,
    mb: 3,
    borderBottom: "1px solid",
    borderColor: "divider",
  }}
/>

{isError && (
  <Alert severity="error" sx={{ mb: 3, borderRadius: 2 }}>
    {error?.response?.data?.message ||
      "Failed to load candidates. Please try again."}
  </Alert>
)}

<CandidatesTable
  candidates={data?.items ?? []}
  isLoading={isLoading}
/>

        {!isLoading && !isError && data && (
          <CandidatesPagination
            page={filters.page}
            pageSize={data.pageSize}
            total={data.total}
            onPageChange={handlePageChange}
          />
        )}
      </Paper>
    </Container>
  );
}
