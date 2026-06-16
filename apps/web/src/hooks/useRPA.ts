"use client";

import { api } from "@/lib/api";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";

// ─── Types ──────────────────────────────────────────────────────────

export interface RPAWindow {
  id: number;
  name: string;
  x: string;
  y: string;
  width: string;
  height: string;
}

export interface FocusResult {
  status: string;
  window_id: number;
  title: string;
  width: string;
  height: string;
}

export interface BrokerResult {
  name: string;
}

export interface SearchBrokerResult {
  brokers?: {
    status: string;
    query: string;
    ocr_text?: string;
    detail?: string;
    brokers: BrokerResult[];
  };
}

export interface DiscoverServersResult {
  status: string;
  broker: string;
  servers: string[];
}

export interface SignInResult {
  status: string;
  login: string;
  server: string;
}

export interface DialogResult {
  status: string;
  dialog_hwnd?: number;
  rect?: number[];
  detail?: string;
}

export interface DialogStateResult {
  status: string;
  dialog?: {
    hwnd: number;
    rect: number[];
    edit_count: number;
    visible_buttons: string[];
    combo_count: number;
    list_items?: number;
  };
}

export interface ServerListResult {
  status: string;
  servers: { servers: string[] }[];
}

export interface ExecuteResult {
  status: string;
  executed_actions: number;
}

export interface LiveUpdateResult {
  result: { status: string };
}

export interface KeyResult {
  status: string;
}

// ─── Hook ───────────────────────────────────────────────────────────

export function useRPA(name: string) {
  const rpaPost = <T>(path: string, body?: unknown) =>
    api.post<T>(`/instances/${name}/rpa${path}`, body).then((r) => r.data);

  // ── Focus ──
  const focus = useMutation({
    mutationFn: () => rpaPost<FocusResult>("/focus"),
    onError: (e: Error) => toast.error(`Focus failed: ${e.message}`),
  });

  // ── List Windows ──
  const listWindows = useMutation({
    mutationFn: () => rpaPost<{ windows: RPAWindow[] }>("/list-windows"),
    onError: (e: Error) => toast.error(`List windows failed: ${e.message}`),
  });

  // ── Search Broker ──
  const searchBroker = useMutation({
    mutationFn: (query: string) =>
      rpaPost<SearchBrokerResult>("/search-broker", { query }),
    onError: (e: Error) => toast.error(`Broker search failed: ${e.message}`),
  });

  // ── Discover Servers ──
  const discoverServers = useMutation({
    mutationFn: (broker: string) =>
      rpaPost<DiscoverServersResult>("/discover-servers", { broker }),
    onError: (e: Error) => toast.error(`Server discovery failed: ${e.message}`),
  });

  // ── Sign In ──
  const signIn = useMutation({
    mutationFn: (creds: { login: string; password: string; server: string; broker?: string }) =>
      rpaPost<SignInResult>("/sign-in", creds),
    onSuccess: () => toast.success("Sign-in submitted"),
    onError: (e: Error) => toast.error(`Sign-in failed: ${e.message}`),
  });

  // ── Dialog ──
  const dialogOpen = useMutation({
    mutationFn: () => rpaPost<DialogResult>("/dialog/open"),
    onError: (e: Error) => toast.error(`Dialog open failed: ${e.message}`),
  });

  const dialogSearch = useMutation({
    mutationFn: (query: string) => rpaPost<DialogResult>("/dialog/search", { query }),
    onError: (e: Error) => toast.error(`Search failed: ${e.message}`),
  });

  const dialogSelect = useMutation({
    mutationFn: (index: number) => rpaPost<DialogResult>("/dialog/select", { index }),
  });

  const dialogNext = useMutation({
    mutationFn: () => rpaPost<DialogResult>("/dialog/next"),
  });

  const dialogCancel = useMutation({
    mutationFn: () => rpaPost<DialogResult>("/dialog/cancel"),
  });

  const dialogServers = useMutation({
    mutationFn: () => rpaPost<ServerListResult>("/dialog/servers"),
  });

  const dialogState = useMutation({
    mutationFn: () => rpaPost<DialogStateResult>("/dialog/state"),
  });

  // ── Keyboard ──
  const typeText = useMutation({
    mutationFn: (text: string) => rpaPost<KeyResult>("/type-text", { text }),
  });

  const key = useMutation({
    mutationFn: (keyName: string) => rpaPost<KeyResult>("/key", { key: keyName }),
  });

  // ── Dismiss ──
  const dismissLiveupdate = useMutation({
    mutationFn: () => rpaPost<LiveUpdateResult>("/dismiss-liveupdate"),
    onSuccess: (data) => {
      const status = data.result?.status;
      if (status === "dismissed") toast.success("LiveUpdate dismissed");
      else if (status === "not_found") toast("No LiveUpdate dialogs");
    },
    onError: (e: Error) => toast.error(`Dismiss failed: ${e.message}`),
  });

  // ── Execute ──
  const execute = useMutation({
    mutationFn: (sequence: { action_type: string; payload?: string }[]) =>
      rpaPost<ExecuteResult>("/execute", { sequence }),
    onError: (e: Error) => toast.error(`RPA execute failed: ${e.message}`),
  });

  return {
    focus,
    listWindows,
    searchBroker,
    discoverServers,
    signIn,
    dialogOpen,
    dialogSearch,
    dialogSelect,
    dialogNext,
    dialogCancel,
    dialogServers,
    dialogState,
    typeText,
    key,
    dismissLiveupdate,
    execute,
  };
}
