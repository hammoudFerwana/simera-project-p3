
import { useState } from "react";

import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Pagination,
  Paper,
  Typography,
} from "@mui/material";

import UnknownSkillsFilters from "../../components/admin/unknown-skills/UnknownSkillsFilters";
import UnknownSkillsTable from "../../components/admin/unknown-skills/UnknownSkillsTable";
import UnknownSkillReview from "../../components/admin/unknown-skills/UnknownSkillReview";

import useUnknownSkills from "../../hooks/useUnknownSkills";
import useUnknownSkill from "../../hooks/useUnknownSkill";

const PAGE_SIZE = 20;

export default function ReviewQueue() {
  const [filters, setFilters] = useState({
    status: "pending",
    candidateId: "",
    page: 1,
    pageSize: PAGE_SIZE,
  });

  const [selectedSkill, setSelectedSkill] = useState(null);
  const [reviewOpen, setReviewOpen] = useState(false);

  // Fetch unknown skills using current filters and pagination.
  const {
    data,
    isLoading,
    isError,
    error,
  } = useUnknownSkills(filters);

  // Fetch the selected skill's full details.
  const {
    data: skillDetails,
    isLoading: isDetailsLoading,
    isError: isDetailsError,
  } = useUnknownSkill(selectedSkill?.id);

  const skills = data?.items || [];

  const totalPages = Math.max(
    1,
    Math.ceil((data?.total || 0) / PAGE_SIZE)
  );

  const handleFilterChange = (name, value) => {
    setFilters((previous) => ({
      ...previous,
      [name]: value,
      page: 1,
    }));
  };

  const handleClearFilters = () => {
    setFilters({
      status: "pending",
      candidateId: "",
      page: 1,
      pageSize: PAGE_SIZE,
    });
  };

  const handleReview = (skill) => {
    setSelectedSkill(skill);
    setReviewOpen(true);
  };

  const handleCloseReview = () => {
    setReviewOpen(false);
    setSelectedSkill(null);
  };

  const reviewedSkill =
    skillDetails?.unknownSkill || skillDetails || selectedSkill;

  return (
    <Box sx={{ p: { xs: 2, md: 3 } }}>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h4" fontWeight={700}>
          Review Queue
        </Typography>

        <Typography color="text.secondary" sx={{ mt: 1 }}>
          Review and resolve unknown skills extracted from candidate files.
        </Typography>
      </Box>

      <Paper sx={{ p: { xs: 2, md: 3 }, borderRadius: 3 }}>
        <UnknownSkillsFilters
          filters={filters}
          onFilterChange={handleFilterChange}
          onClear={handleClearFilters}
        />

        {isLoading ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 5 }}>
            <CircularProgress />
          </Box>
        ) : isError ? (
          <Alert severity="error" sx={{ mt: 2 }}>
            {error?.response?.data?.message ||
              "Failed to load unknown skills. Please try again."}
          </Alert>
        ) : (
          <>
            <UnknownSkillsTable
              skills={skills}
              isLoading={isLoading}
              onReview={handleReview}
            />

            {data?.total > 0 && (
              <Box
                sx={{
                  display: "flex",
                  justifyContent: "center",
                  mt: 3,
                }}
              >
                <Pagination
                  count={totalPages}
                  page={filters.page}
                  onChange={(_, page) =>
                    setFilters((previous) => ({
                      ...previous,
                      page,
                    }))
                  }
                  color="primary"
                />
              </Box>
            )}
          </>
        )}
      </Paper>

      {reviewOpen && (
        <>
          {isDetailsLoading ? (
            <Paper sx={{ p: 3, mt: 2 }}>
              <CircularProgress size={24} />
              <Typography sx={{ mt: 1 }}>
                Loading skill details...
              </Typography>
            </Paper>
          ) : isDetailsError ? (
            <Alert
              severity="error"
              sx={{ mt: 2 }}
              action={
                <Button
                  color="inherit"
                  size="small"
                  onClick={handleCloseReview}
                >
                  Close
                </Button>
              }
            >
              Failed to load skill details.
            </Alert>
          ) : (
            <UnknownSkillReview
              open={reviewOpen}
              skill={reviewedSkill}
              onClose={handleCloseReview}
            />
          )}
        </>
      )}
    </Box>
  );
}
