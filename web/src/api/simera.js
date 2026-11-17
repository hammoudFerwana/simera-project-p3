import axiosInstance from './axiosInstance';

// Upload a Simera JSON file for processing.
export const uploadSimeraFileApi = async (file) => {
  if (!(file instanceof File)) {
    throw new Error('Please select a valid file.');
  }

  const formData = new FormData();
  formData.append('file', file);

  const { data } = await axiosInstance.post('/admin/simera-files', formData);

  return data;
};

// Get the Simera section for a specific candidate.
export const getSimeraSectionApi = async (candidateId) => {
  const { data } = await axiosInstance.get(
    `/admin/candidates/${candidateId}/simera`
  );

  return data;
};

// Send the latest Simera file to processing for a specific candidate.
export const sendSimeraFileApi = async (candidateId) => {
  const { data } = await axiosInstance.post(
    `/admin/candidates/${candidateId}/simera/send`
  );

  return data;
};
