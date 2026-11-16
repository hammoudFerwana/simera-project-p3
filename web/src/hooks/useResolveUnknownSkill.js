
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { resolveUnknownSkillApi } from "../api/admin";

const useResolveUnknownSkill = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, payload }) =>
      resolveUnknownSkillApi(id, payload),

    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["unknownSkills"],
      });

      queryClient.invalidateQueries({
        queryKey: ["unknownSkill", variables.id],
      });
    },
  });
};

export default useResolveUnknownSkill;
