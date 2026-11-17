
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { resolveReviewApi } from "../api/admin";

const useResolveReview = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, payload }) => resolveReviewApi(id, payload),

    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["reviews"],
      });

      queryClient.invalidateQueries({
        queryKey: ["review", variables.id],
      });

      if (variables.candidateId) {
        queryClient.invalidateQueries({
          queryKey: [
            "adminCandidateProfile",
            variables.candidateId,
          ],
        });
      }
    },
  });
};

export default useResolveReview;
