
import { useMutation } from "@tanstack/react-query";

import {
  uploadCvApi,
  uploadLinkedInApi,
} from "../api/uploads";

export const getUploadErrorMessage = (error) => {
  return (
    error.response?.data?.errors?.file ||
    error.response?.data?.message ||
    "Something went wrong. Please try again."
  );
};

const useUpload = (type) => {
  return useMutation({
    mutationFn: (file) => {
      if (type === "cv") {
        return uploadCvApi(file);
      }

      if (type === "linkedin") {
        return uploadLinkedInApi(file);
      }

      throw new Error("Invalid upload type");
    },
  });
};

export default useUpload;
