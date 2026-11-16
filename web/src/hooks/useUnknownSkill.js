
import { useQuery } from "@tanstack/react-query";

import { getUnknownSkillApi } from "../api/admin";

const useUnknownSkill = (id) => {
  return useQuery({
    queryKey: ["unknownSkill", id],
    queryFn: () => getUnknownSkillApi(id),
    enabled: Boolean(id),
  });
};

export default useUnknownSkill;
