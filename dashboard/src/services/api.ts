
import axios from "axios";

export const api = axios.create({
  baseURL: import.meta.env["VITE_API_URL"] || "http://localhost:3333",
  timeout: 15000,
});

api.interceptors.request.use(
  (config) => {
    if (typeof window !== "undefined") {
      const token = localStorage.getItem("@SmartTennis:token");

      if (token) {
        config.headers.set("Authorization", `Bearer ${token}`);
      }
    }

    return config;
  },
  (error) => Promise.reject(error)
);
