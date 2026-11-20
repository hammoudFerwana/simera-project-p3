
import {
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";

import {
  uploadCvApi,
  uploadLinkedInApi,
} from "../api/uploads";

export const getUploadErrorMessage = (error) => {
  const reason = error.response?.data?.reason;

  if (reason === "no_readable_text") {
    return "Insufficient text. The uploaded file contains too little readable text to process.";
  }

  return (
    error.response?.data?.errors?.file ||
    error.response?.data?.message ||
    "Something went wrong. Please try again."
  );
};
const uploadFunctions = {
  cv: uploadCvApi,
  linkedin: uploadLinkedInApi,
};

const useUpload = (type) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (file) => {
      const uploadFile = uploadFunctions[type];

      if (!uploadFile) {
        throw new Error("Invalid upload type");
      }

      return uploadFile(file);
    },

    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["candidateFiles"],
      });
    },
  });
};

export default useUpload;
