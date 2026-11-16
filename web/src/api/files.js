
import axiosInstance from "./axiosInstance";

export const downloadCandidateFileApi = async (rawUrl) => {
  const endpoint = rawUrl.replace(/^\/api(?=\/)/, "");

  const { data } = await axiosInstance.get(endpoint, {
    responseType: "blob",
  });

  return data;
};
