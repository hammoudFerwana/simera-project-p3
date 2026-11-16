import axiosInstance from './axiosInstance';

// Get paginated admin candidates list with optional filters.
export const getAdminCandidatesApi = async (params = {}) => {
  const { data } = await axiosInstance.get('/admin/candidates', {
    params
  });

  return data;
};

// Get complete profile details for a specific candidate.
export const getAdminCandidateProfileApi = async (candidateId) => {
  const { data } = await axiosInstance.get(`/admin/candidates/${candidateId}`);

  return data;
};
// Get candidate history
export const getCandidateHistoryApi = async (candidateId) => {
  const { data } = await axiosInstance.get(
    `/admin/candidates/${candidateId}/history`
  );

  return data;
};

// Get paginated unknown skills with optional filters.
export const getUnknownSkillsApi = async (params = {}) => {
  const { data } = await axiosInstance.get("/admin/unknown-skills", {
    params,
  });

  return data;
};

// Get one unknown skill by ID.
export const getUnknownSkillApi = async (id) => {
  const { data } = await axiosInstance.get(`/admin/unknown-skills/${id}`);

  return data;
};

// Search canonical skills.
export const searchSkillsApi = async (q) => {
  const { data } = await axiosInstance.get("/admin/skills/search", {
    params: { q },
  });

  return data;
};

// Resolve an unknown skill.
export const resolveUnknownSkillApi = async (id, payload) => {
  const { data } = await axiosInstance.post(
    `/admin/unknown-skills/${id}/resolve`,
    payload
  );

  return data;
};
