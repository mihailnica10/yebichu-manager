"use client";
import { api } from "@/lib/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export interface User {
  id: number;
  email: string;
  name: string;
}

export function useAuthSession() {
  return useQuery({
    queryKey: ["auth", "session"],
    queryFn: async () => {
      const res = await api.get<{ user: User | null }>("/auth/session");
      return res.data.user;
    },
    retry: false,
  });
}

export function useSignIn() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: { email: string; password: string }) => {
      const res = await api.post("/auth/sign-in", body);
      return res.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["auth", "session"] }),
  });
}

export function useSignOut() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      await api.post("/auth/sign-out");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["auth", "session"] }),
  });
}
