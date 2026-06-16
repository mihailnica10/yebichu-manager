import axios from "axios";

export const api = axios.create({
  baseURL: "/api",
  timeout: 120_000,
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.data) {
      const data = error.response.data;
      if (typeof data.error === "string") {
        return Promise.reject(new Error(data.error));
      }
      if (typeof data.error === "object" && data.error?.message) {
        return Promise.reject(new Error(data.error.message));
      }
      if (data.message) {
        return Promise.reject(new Error(data.message));
      }
    }
    return Promise.reject(error);
  },
);
