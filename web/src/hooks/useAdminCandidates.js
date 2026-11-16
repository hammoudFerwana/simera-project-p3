
import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { getAdminCandidatesApi } from "../api/admin";

const useAdminCandidates = (filters = {}) => {
  const {
    search = "",
    status = "",
    hasPendingReview = "",
    page = 1,
    pageSize = 20,
  } = filters;

  const params = {
    search: search.trim() || undefined,
    status: status || undefined,
    hasPendingReview:
      hasPendingReview === ""
        ? undefined
        : hasPendingReview,
    page,
    pageSize,
  };

  return useQuery({
    queryKey: ["adminCandidates", params],
    queryFn: () => getAdminCandidatesApi(params),
    placeholderData: keepPreviousData,
  });
};

export default useAdminCandidates;
