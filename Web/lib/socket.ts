import { io, type Socket } from "socket.io-client";
import { API_URL, getToken } from "./api";

export function connectSocket(): Socket | null {
  const token = getToken();
  if (!token) return null;
  return io(API_URL.replace(/\/api\/v1$/, ""), { auth: { token }, transports: ["websocket"] });
}
