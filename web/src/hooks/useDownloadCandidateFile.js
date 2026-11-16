
import { useMutation } from "@tanstack/react-query";
import { downloadCandidateFileApi } from "../api/files";

const useDownloadCandidateFile = () => {
  return useMutation({
    mutationFn: async (file) => {
      const blob = await downloadCandidateFileApi(file.rawUrl);

      return {
        blob,
        fileName: file.name || `candidate-file-${file.id}`,
      };
    },

    onSuccess: ({ blob, fileName }) => {
      const downloadUrl = window.URL.createObjectURL(blob);

      const link = document.createElement("a");
      link.href = downloadUrl;
      link.download = fileName;

      document.body.appendChild(link);
      link.click();
      link.remove();

      window.URL.revokeObjectURL(downloadUrl);
    },
  });
};

export default useDownloadCandidateFile;
