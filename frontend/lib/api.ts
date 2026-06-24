import axios from "axios";

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000",
  headers: {
    "Content-Type": "application/json",
  },
});

export const setAuthTokens = (accessToken: string | null, refreshToken: string | null) => {
  if (typeof window === "undefined") return;
  if (accessToken) {
    localStorage.setItem("usb_access_token", accessToken);
  } else {
    localStorage.removeItem("usb_access_token");
  }
  if (refreshToken) {
    localStorage.setItem("usb_refresh_token", refreshToken);
  } else {
    localStorage.removeItem("usb_refresh_token");
  }
};

export const clearAuthTokens = () => {
  if (typeof window === "undefined") return;
  localStorage.removeItem("usb_access_token");
  localStorage.removeItem("usb_refresh_token");
};

export const getAuthToken = (): string | null => {
  return typeof window !== "undefined" ? localStorage.getItem("usb_access_token") : null;
};

export const getRefreshToken = (): string | null => {
  return typeof window !== "undefined" ? localStorage.getItem("usb_refresh_token") : null;
};

export const authRequest = async (email: string, password: string) => {
  const response = await api.post("/auth/login", { email, password });
  return response.data;
};

export const authRefresh = async () => {
  const refresh_token = getRefreshToken();
  if (!refresh_token) {
    throw new Error("Missing refresh token");
  }
  const response = await api.post("/auth/refresh", { refresh_token });
  setAuthTokens(response.data.access_token, response.data.refresh_token);
  return response.data;
};

api.interceptors.request.use((config) => {
  const token = getAuthToken();
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config as any;
    if (!originalRequest || originalRequest._retry) {
      return Promise.reject(error);
    }

    if (error.response?.status === 401) {
      originalRequest._retry = true;
      try {
        const data = await authRefresh();
        originalRequest.headers.Authorization = `Bearer ${data.access_token}`;
        return api(originalRequest);
      } catch (refreshError) {
        clearAuthTokens();
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  }
);

export const apiGet = async (path: string) => {
  return api.get(path);
};

export const apiPost = async (path: string, data?: unknown) => {
  return api.post(path, data ?? {});
};

export const apiPut = async (path: string, data?: unknown) => {
  return api.put(path, data ?? {});
};

export const apiDelete = async (path: string) => {
  return api.delete(path);
};

export const authMe = async () => {
  const response = await api.get("/auth/me");
  return response.data;
};

export const logout = () => {
  clearAuthTokens();
};

export default api;
