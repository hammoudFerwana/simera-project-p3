
import axiosInstance from "./axiosInstance";

// Upload CV file
export const uploadCvApi = async (file) => {
  const formData = new FormData();
  formData.append("file", file);

  const { data } = await axiosInstance.post(
    "/uploads/cv",
    formData
  );

  return data;
};

// Upload LinkedIn file
export const uploadLinkedInApi = async (file) => {
  const formData = new FormData();
  formData.append("file", file);

  const { data } = await axiosInstance.post(
    "/uploads/linkedin",
    formData
  );

  return data;
};
