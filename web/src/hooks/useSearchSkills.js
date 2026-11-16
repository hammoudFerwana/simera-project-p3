
import { useQuery } from "@tanstack/react-query";
import { searchSkillsApi } from "../api/admin";

const useSearchSkills = (q) => {
  return useQuery({
    queryKey: ["searchSkills", q],
    queryFn: () => searchSkillsApi(q),
    enabled: Boolean(q?.trim()),
  });
};

export default useSearchSkills;
