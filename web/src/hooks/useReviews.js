import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { getReviewsApi } from '../api/admin';

const useReviews = (filters = {}) => {
  const {
    status = 'pending',
    reason = '',
    candidateId = '',
    page = 1,
    pageSize = 20
  } = filters;

  const params = {
    status,
    reason: reason || undefined,
    candidateId: candidateId || undefined,
    page,
    pageSize
  };

  return useQuery({
    queryKey: ['reviews', params],
    queryFn: () => getReviewsApi(params),
    placeholderData: keepPreviousData
  });
};

export default useReviews;
