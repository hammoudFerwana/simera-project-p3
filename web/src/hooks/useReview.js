
import { useQuery } from "@tanstack/react-query";

import { getReviewApi } from "../api/admin";

const useReview = (id) => {
  return useQuery({
    queryKey: ["review", id],
    queryFn: () => getReviewApi(id),
    enabled: Number.isInteger(Number(id)) && Number(id) > 0,
  });
};

export default useReview;
