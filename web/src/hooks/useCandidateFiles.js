
import { useQuery } from "@tanstack/react-query";

import { getCandidateFilesApi } from "../api/candidateFiles";
import { FILE_STATUS } from "../constants/fileStatus";

const POLLING_INTERVAL = 3000;

const useCandidateFiles = () => {
  return useQuery({
    queryKey: ["candidateFiles"],
    queryFn: getCandidateFilesApi,

    select: (files) =>
      files.map((file) => ({
        ...file,
        status: file.status.toLowerCase(),
      })),

    refetchInterval: (query) => {
      const files = query.state.data ?? [];

      const hasProcessingFiles = files.some(
        (file) =>
          file.status.toLowerCase() === FILE_STATUS.PROCESSING
      );

      return hasProcessingFiles ? POLLING_INTERVAL : false;
    },
  });
};

export default useCandidateFiles;
