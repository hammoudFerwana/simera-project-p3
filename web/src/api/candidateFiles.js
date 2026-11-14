
import axiosInstance from "./axiosInstance";

export const getCandidateFilesApi = async () => {
  const { data } = await axiosInstance.get("/candidate/files");

  return data.files;
};
