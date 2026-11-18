import { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Pagination,
  Stack,
  Typography
} from '@mui/material';
import ArrowBackRoundedIcon from '@mui/icons-material/ArrowBackRounded';

import ReviewFilters from '../../components/admin/reviews/ReviewFilters';
import ReviewTable from '../../components/admin/reviews/ReviewTable';
import ReviewDetails from '../../components/admin/reviews/ReviewDetails';

import useReviews from '../../hooks/useReviews';
import useReview from '../../hooks/useReview';
import getErrorMessage from '../../utils/getErrorMessage';

const INITIAL_FILTERS = {
  status: 'pending',
  reason: '',
  candidateId: '',
  page: 1,
  pageSize: 20
};

export default function ReviewQueue() {
  const [filters, setFilters] = useState(INITIAL_FILTERS);
  const [selectedReviewId, setSelectedReviewId] = useState(null);

  const { data: reviewsData, isLoading, isError, error } = useReviews(filters);

  const {
    data: reviewData,
    isLoading: isReviewLoading,
    isError: isReviewError,
    error: reviewError
  } = useReview(selectedReviewId);

  const reviews = reviewsData?.items ?? [];
  const total = reviewsData?.total ?? 0;

  const totalPages = Math.max(1, Math.ceil(total / filters.pageSize));

  const handleFilterChange = (nextFilters) => {
    setFilters(nextFilters);
  };

  const handleResetFilters = () => {
    setFilters(INITIAL_FILTERS);
  };

  const handlePageChange = (_, page) => {
    setFilters((current) => ({
      ...current,
      page
    }));
  };

  const handleBackToList = () => {
    setSelectedReviewId(null);
  };

  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="h4" fontWeight={700}>
          Review Queue
        </Typography>

        <Typography color="text.secondary" mt={0.5}>
          Review candidate data conflicts and resolve uncertain matches.
        </Typography>
      </Box>

      {selectedReviewId === null ? (
        <>
          <ReviewFilters
            filters={filters}
            onChange={handleFilterChange}
            onReset={handleResetFilters}
          />

          {isError ? (
            <Alert severity="error">
              {getErrorMessage(error, 'Failed to load reviews.')}
            </Alert>
          ) : (
            <>
              <ReviewTable
                reviews={reviews}
                isLoading={isLoading}
                onView={setSelectedReviewId}
              />

              {!isLoading && total > 0 && (
                <Stack
                  direction={{ xs: 'column', sm: 'row' }}
                  justifyContent="space-between"
                  alignItems="center"
                  spacing={2}
                >
                  <Typography variant="body2" color="text.secondary">
                    {total} review{total === 1 ? '' : 's'} found
                  </Typography>

                  <Pagination
                    count={totalPages}
                    page={filters.page}
                    onChange={handlePageChange}
                    color="primary"
                    shape="rounded"
                    disabled={isLoading}
                  />
                </Stack>
              )}
            </>
          )}
        </>
      ) : (
        <>
          <Box>
            <Button
              startIcon={<ArrowBackRoundedIcon />}
              onClick={handleBackToList}
              sx={{ mb: 2 }}
            >
              Back to Review Queue
            </Button>
          </Box>

          {isReviewError ? (
            <Alert severity="error">
              {getErrorMessage(reviewError, 'Failed to load review details.')}
            </Alert>
          ) : (
            <ReviewDetails review={reviewData} isLoading={isReviewLoading} />
          )}
        </>
      )}
    </Stack>
  );
}
