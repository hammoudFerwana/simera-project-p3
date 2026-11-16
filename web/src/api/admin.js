
import axiosInstance from "./axiosInstance";

// Get paginated admin candidates list with optional filters.
export const getAdminCandidatesApi = async (params = {}) => {
  const { data } = await axiosInstance.get("/admin/candidates", {
    params,
  });

  return data;
};

// Get complete profile details for a specific candidate.
export const getAdminCandidateProfileApi = async (candidateId) => {
  const { data } = await axiosInstance.get(
    `/admin/candidates/${candidateId}`
  );

  return data;
};
// Get candidate history
export const getCandidateHistoryApi = async (candidateId) => {
  const { data } = await axiosInstance.get(
    `/admin/candidates/${candidateId}/history`
  );

  return data;
};
