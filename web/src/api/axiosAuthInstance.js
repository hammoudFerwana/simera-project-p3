
import axiosInstance from "./axiosInstance";

export const loginApi = async (credentials) => {
  const { data } = await axiosInstance.post(
    "/auth/login",
    credentials
  );

  return data;
};

export const getCurrentUserApi = async () => {
  const { data } = await axiosInstance.get("/auth/me");

  return data;
};

export const logoutApi = async () => {
  const { data } = await axiosInstance.post("/auth/logout");

  return data;
};
