"use client";
import { api } from "@/lib/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { disconnectSocket } from "@/hooks/useSocket";

export interface User {
  id: number;
  email: string;
  name: string;
}

export function useAuthSession() {
  return useQuery({
    queryKey: ["auth", "session"],
    queryFn: async ({ signal }) => {
      const res = await api.get<{ user: User | null }>("/auth/session", { signal });
      return res.data.user;
    },
    retry: false,
    staleTime: 60_000,
  });
}

export function useSignIn() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: { email: string; password: string }) => {
      const res = await api.post("/auth/sign-in", body);
      return res.data;
    },
    onMutate: () => ({ toastId: toast.loading("Signing in...") }),
    onSuccess: (_data, _vars, ctx) => {
      toast.success("Welcome back", { id: ctx?.toastId });
      qc.invalidateQueries({ queryKey: ["auth", "session"] });
    },
    onError: (err: Error, _vars, ctx) => {
      toast.error(err.message, { id: ctx?.toastId });
    },
  });
}

export function useSignOut() {
  const qc = useQueryClient();
  const router = useRouter();
  return useMutation({
    mutationFn: async () => {
      await api.post("/auth/sign-out");
    },
    onSuccess: () => {
      disconnectSocket();
      qc.invalidateQueries({ queryKey: ["auth", "session"] });
      router.push("/login");
    },
  });
}
