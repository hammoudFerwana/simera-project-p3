
import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { getUnknownSkillsApi } from "../api/admin";

const useUnknownSkills = (filters = {}) => {
  const {
    status = "pending",
    candidateId = "",
    page = 1,
    pageSize = 20,
  } = filters;

  const params = {
    status,
    candidateId: candidateId || undefined,
    page,
    pageSize,
  };

  return useQuery({
    queryKey: ["unknownSkills", params],
    queryFn: () => getUnknownSkillsApi(params),
    placeholderData: keepPreviousData,
  });
};

export default useUnknownSkills;
