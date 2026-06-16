"use client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

export function useConfigSets() {
  return useQuery({
    queryKey: ["config-sets"],
    queryFn: async () => {
      const res = await api.get<{ configSets: any[] }>("/config-sets");
      return res.data.configSets;
    },
    refetchInterval: 15_000,
  });
}

export function useConfigSet(id: number | null) {
  return useQuery({
    queryKey: ["config-set", id],
    queryFn: async () => {
      if (!id) return null;
      const res = await api.get(`/config-sets/${id}`);
      return res.data;
    },
    enabled: !!id,
  });
}

export function useConfigSetVersions(id: number | null) {
  return useQuery({
    queryKey: ["config-set-versions", id],
    queryFn: async () => {
      if (!id) return [];
      const res = await api.get<{ versions: any[] }>(`/config-sets/${id}/versions`);
      return res.data.versions;
    },
    enabled: !!id,
  });
}

export function useCaptureConfigSet() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const res = await api.post(`/config-sets/${id}/capture`);
      return res.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["config-sets"] });
      qc.invalidateQueries({ queryKey: ["config-set"] });
      qc.invalidateQueries({ queryKey: ["config-set-versions"] });
    },
  });
}

export function useDeployConfigSet() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, instanceNames, version }: { id: number; instanceNames?: string[]; version?: number }) => {
      const res = await api.post(`/config-sets/${id}/deploy`, { instanceNames, version });
      return res.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["config-sets"] });
    },
  });
}

export function useLoadConfigSet() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const res = await api.post(`/config-sets/${id}/load`);
      return res.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["config-sets"] });
    },
  });
}

export function useAssignConfigSet() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, instanceNames, autoSync }: { id: number; instanceNames: string[]; autoSync?: boolean }) => {
      const res = await api.post(`/config-sets/${id}/assign`, { instanceNames, autoSync: autoSync ?? false });
      return res.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["config-sets"] });
      qc.invalidateQueries({ queryKey: ["config-set"] });
    },
  });
}
