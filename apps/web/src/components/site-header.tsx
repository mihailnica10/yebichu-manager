"use client";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { useSocket } from "@/hooks/useSocket";
import { usePathname } from "next/navigation";

const pageTitles: Record<string, string> = {
  "/instances": "Instances",
  "/system": "System",
  "/profiles": "Profiles",
  "/audit": "Audit Log",
};

export function SiteHeader() {
  const pathname = usePathname();
  const title = pageTitles[pathname] ?? "Documents";
  const { isConnected } = useSocket();

  return (
    <header className="flex h-(--header-height) shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-(--header-height)">
      <div className="flex w-full items-center gap-1 px-4 lg:gap-2 lg:px-6">
        <SidebarTrigger className="-ms-1" />
        <Separator orientation="vertical" className="mx-2 data-[orientation=vertical]:h-4" />
        <h1 className="text-base font-medium">{title}</h1>
        <div className="ms-auto flex items-center gap-2 text-xs text-muted-foreground">
          <span
            className={`inline-block size-2 rounded-full ${isConnected ? "bg-green-500" : "bg-red-500"}`}
          />
          <span>{isConnected ? "Connected" : "Disconnected"}</span>
        </div>
      </div>
    </header>
  );
}
