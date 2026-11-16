import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import { searchSkillsApi } from '../api/admin';

const useSearchSkills = (q) => {
  const [debouncedQuery, setDebouncedQuery] = useState(q);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      setDebouncedQuery(q);
    }, 400);

    return () => clearTimeout(timeoutId);
  }, [q]);

  return useQuery({
    queryKey: ['searchSkills', debouncedQuery],
    queryFn: () => searchSkillsApi(debouncedQuery.trim()),
    enabled: Boolean(debouncedQuery?.trim())
  });
};

export default useSearchSkills;
