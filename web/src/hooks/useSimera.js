import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  uploadSimeraFileApi,
  getSimeraSectionApi,
  sendSimeraFileApi
} from '../api/simera';

const useSimera = (candidateId) => {
  const queryClient = useQueryClient();

  // Get Simera section.
  const simeraQuery = useQuery({
    queryKey: ['simera', candidateId],
    queryFn: () => getSimeraSectionApi(candidateId),
    enabled: Boolean(candidateId),
    refetchInterval: (query) =>
      query.state.data?.status === 'processing' ? 5000 : false
  });

  // Upload Simera file.
  const uploadMutation = useMutation({
    mutationFn: uploadSimeraFileApi,
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['simera', candidateId]
      });
    }
  });

  // Send Simera file to processing.
  const sendMutation = useMutation({
    mutationFn: sendSimeraFileApi,
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['simera', candidateId]
      });
    }
  });

  return {
    // Get section
    simeraData: simeraQuery.data,
    isLoadingSimera: simeraQuery.isLoading,
    simeraError: simeraQuery.error,
    refetchSimera: simeraQuery.refetch,

    // Upload
    uploadSimeraFile: uploadMutation.mutate,
    uploadSimeraFileAsync: uploadMutation.mutateAsync,
    isUploading: uploadMutation.isPending,
    uploadError: uploadMutation.error,
    uploadData: uploadMutation.data,
    isUploadSuccess: uploadMutation.isSuccess,
    resetUpload: uploadMutation.reset,

    // Send
    sendSimeraFile: sendMutation.mutate,
    sendSimeraFileAsync: sendMutation.mutateAsync,
    isSending: sendMutation.isPending,
    sendError: sendMutation.error,
    sendData: sendMutation.data,
    isSendSuccess: sendMutation.isSuccess,
    resetSend: sendMutation.reset
  };
};

export default useSimera;
