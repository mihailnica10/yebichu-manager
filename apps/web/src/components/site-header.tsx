"use client";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { useBridgeStatus, useSocket } from "@/hooks/useSocket";
import { usePathname } from "next/navigation";

const pageTitles: Record<string, string> = {
  "/instances": "Instances",
  "/system": "System",
  "/profiles": "Profiles",
  "/audit": "Audit Log",
  "/settings": "Settings",
};

function pageTitle(pathname: string): string {
  if (pageTitles[pathname]) return pageTitles[pathname];
  const match = pathname.match(/^\/instances\/([^/]+)/);
  if (match) return match[1];
  const vncMatch = pathname.match(/^\/vnc\/([^/]+)/);
  if (vncMatch) return `VNC – ${vncMatch[1]}`;
  return "";
}

export function SiteHeader() {
  const pathname = usePathname();
  const title = pageTitle(pathname);
  const { isConnected } = useSocket();
  const { status: bridge } = useBridgeStatus("mt5-mgmt");

  const mt5Ok = bridge?.mt5 === "connected";
  const ok = isConnected && mt5Ok;
  const partial = isConnected !== mt5Ok;

  const statusColor = ok
    ? "bg-emerald-500 shadow-[0_0_6px_theme(colors.emerald.500/0.6)]"
    : partial
    ? "bg-amber-500 shadow-[0_0_6px_theme(colors.amber.500/0.6)]"
    : "bg-rose-500 shadow-[0_0_6px_theme(colors.rose.500/0.6)]";

  const statusText = ok
    ? "Live"
    : isConnected
    ? "MT5 Offline"
    : mt5Ok
    ? "Reconnecting…"
    : "Disconnected";

  return (
    <header className="sticky top-0 z-50 flex h-(--header-height) shrink-0 items-center border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-(--header-height)">
      <div className="flex w-full items-center gap-3 px-4 lg:gap-4 lg:px-6">
        <SidebarTrigger className="-ms-1" />
        <Separator
          orientation="vertical"
          className="mx-1 h-5 w-px bg-border/50"
        />
        <span className="text-base font-semibold tracking-tight text-foreground/90">
          {title}
        </span>
        <div className="ms-auto flex items-center gap-3">
          <div className="flex items-center gap-2 rounded-full bg-muted/50 px-3 py-1.5">
            <span
              className={`inline-block size-2 rounded-full ${statusColor}`}
              title={`Socket: ${isConnected ? "connected" : "disconnected"}, MT5: ${mt5Ok ? "connected" : "offline"}`}
            />
            <span className="text-xs font-medium text-muted-foreground">
              {statusText}
            </span>
          </div>
          <Separator
            orientation="vertical"
            className="mx-1 h-5 w-px bg-border/50"
          />
          <ThemeSwitcher />
        </div>
      </div>
    </header>
  );
}
