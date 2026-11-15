
import { useQuery } from "@tanstack/react-query";
import { getCurrentUserApi } from "../api/axiosAuthInstance";

const useCurrentUser = () => {
  return useQuery({
    queryKey: ["currentUser"],
    queryFn: async () => {
      const response = await getCurrentUserApi();
      return response.user;
    },
    retry: false,
  });
};

export default useCurrentUser;
