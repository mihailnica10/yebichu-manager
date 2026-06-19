"use client";
import { AppSidebar } from "@/components/app-sidebar";
import { SiteHeader } from "@/components/site-header";
import { SidebarInset } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { useAuthSession } from "@/hooks/useAuth";
import { initSocket, disconnectSocket } from "@/hooks/useSocket";
import { api } from "@/lib/api";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Loader2Icon, RefreshCwIcon } from "lucide-react";
import { useEffect } from "react";

function DashboardShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <AppSidebar variant="inset" />
      <SidebarInset>
        <SiteHeader />
        <div className="flex flex-1 flex-col">
          <div className="@container/main flex flex-1 flex-col gap-2">
            {children}
          </div>
        </div>
      </SidebarInset>
    </>
  );
}

function LoadingState({ message = "Loading…" }: { message?: string }) {
  return (
    <div className="flex h-svh w-full items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-4 text-muted-foreground">
        <Loader2Icon className="size-6 animate-spin" />
        <p className="text-sm">{message}</p>
      </div>
    </div>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { data: user, isLoading } = useAuthSession();
  const router = useRouter();

  const healthQuery = useQuery({
    queryKey: ["setup-health"],
    queryFn: () => api.get("/setup/status").then((r) => r.data),
    retry: false,
    refetchInterval: 30_000,
  });

  useEffect(() => {
    if (user) {
      initSocket();
    }
  }, [user]);

  useEffect(() => {
    if (!isLoading && !user) {
      disconnectSocket();
      router.push("/login");
    }
  }, [user, isLoading, router]);

  useEffect(() => {
    if (healthQuery.data && !healthQuery.data.healthy && user) {
      router.replace("/setup");
    }
  }, [healthQuery.data, user, router]);

  if (isLoading) return <LoadingState message="Checking session…" />;
  if (!user) return <LoadingState message="Redirecting to login…" />;

  if (healthQuery.isError) {
    return (
      <div className="flex h-svh items-center justify-center bg-background text-center gap-3 px-4">
        <div>
          <p className="text-sm text-destructive">Health check failed</p>
          <Button variant="outline" size="sm" className="mt-2" onClick={() => healthQuery.refetch()}>
            <RefreshCwIcon className="size-3 mr-1" />Retry
          </Button>
        </div>
      </div>
    );
  }

  if (healthQuery.data && !healthQuery.data.healthy) {
    return (
      <div className="flex h-svh items-center justify-center bg-background px-4">
        <div className="text-center space-y-4">
          <p className="text-sm text-muted-foreground">System configuration is incomplete or unhealthy.</p>
          <Button onClick={() => router.replace("/setup")}>Go to Setup</Button>
        </div>
      </div>
    );
  }

  return (
    <DashboardShell>
      <div className="flex flex-1 flex-col animate-[fadeSlideUp_0.3s_ease-out]">
        <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">{children}</div>
      </div>
    </DashboardShell>
  );
}
