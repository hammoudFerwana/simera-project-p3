
import { useQuery } from "@tanstack/react-query";
import { getAdminCandidateProfileApi } from "../api/admin";

const useAdminCandidateProfile = (candidateId) => {
  return useQuery({
    queryKey: ["adminCandidateProfile", candidateId],
    queryFn: () => getAdminCandidateProfileApi(candidateId),
    enabled: Boolean(candidateId),
  });
};

export default useAdminCandidateProfile;
