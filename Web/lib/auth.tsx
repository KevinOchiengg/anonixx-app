"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api, getToken, setAdultMode, setToken, type AuthUser } from "./api";

type AuthResponse = { access_token: string; user: AuthUser };

export type SignupInput = {
  email: string;
  password: string;
  username?: string;
  date_of_birth: string;
  gender?: string;
  referral_code?: string;
};

type Ctx = {
  user: AuthUser | null;
  ready: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (input: SignupInput) => Promise<void>;
  logout: () => void;
  refresh: () => Promise<void>;
  setBalance: (n: number) => void;
};

const AuthContext = createContext<Ctx | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [ready, setReady] = useState(false);

  const accept = useCallback((res: AuthResponse) => {
    setToken(res.access_token);
    setAdultMode(Boolean(res.user.age_verified));
    setUser(res.user);
  }, []);

  const refresh = useCallback(async () => {
    if (!getToken()) { setUser(null); return; }
    try {
      const me = await api<Omit<AuthUser, "coin_balance" | "is_admin" | "avatar_url">>("/auth/me");
      const bal = await api<{ balance: number }>("/coins/balance").catch(() => null);
      setAdultMode(Boolean(me.age_verified));
      setUser((prev) => ({
        avatar_url: null,
        is_admin: false,
        ...prev,
        ...me,
        coin_balance: bal?.balance ?? prev?.coin_balance ?? 0,
      }));
    } catch (e) {
      const status = (e as { status?: number }).status;
      if (status === 401 || status === 403 || status === 404) { setToken(null); setAdultMode(false); setUser(null); }
    }
  }, []);

  useEffect(() => {
    refresh().finally(() => setReady(true));
  }, [refresh]);

  const login = useCallback(async (email: string, password: string) => {
    accept(await api<AuthResponse>("/auth/login", { body: { email, password } }));
  }, [accept]);

  const signup = useCallback(async (input: SignupInput) => {
    const body: Record<string, unknown> = { email: input.email, password: input.password, date_of_birth: input.date_of_birth };
    if (input.username) body.username = input.username;
    if (input.gender) body.gender = input.gender;
    if (input.referral_code) body.referral_code = input.referral_code;
    accept(await api<AuthResponse>("/auth/register", { body }));
  }, [accept]);

  const logout = useCallback(() => {
    setToken(null);
    setAdultMode(false);
    setUser(null);
  }, []);

  const setBalance = useCallback((n: number) => {
    setUser((u) => (u ? { ...u, coin_balance: n } : u));
  }, []);

  const value = useMemo(
    () => ({ user, ready, login, signup, logout, refresh, setBalance }),
    [user, ready, login, signup, logout, refresh, setBalance],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): Ctx {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
