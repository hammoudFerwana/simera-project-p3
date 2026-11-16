
import { useQuery } from '@tanstack/react-query';
import { getCandidateHistoryApi } from '../api/admin';

export default function useCandidateHistory(candidateId) {
  return useQuery({
    queryKey: ['candidateHistory', candidateId],
    queryFn: () => getCandidateHistoryApi(candidateId),
    enabled: Boolean(candidateId),
  });
}
