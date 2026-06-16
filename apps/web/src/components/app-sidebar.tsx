"use client";
import { NavMain } from "@/components/nav-main";
import { NavSecondary } from "@/components/nav-secondary";
import { NavUser } from "@/components/nav-user";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import {
  ChartColumnIcon,
  CircleHelpIcon,
  FileJsonIcon,
  FileTextIcon,
  ServerIcon,
  Settings2Icon,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import type * as React from "react";

const navMain = [
  { title: "Dashboard", url: "/system", icon: <ChartColumnIcon /> },
  { title: "Instances", url: "/instances", icon: <ServerIcon /> },

];

const navSecondary = [
  { title: "Audit Log", url: "/audit", icon: <FileTextIcon /> },
  { title: "Settings", url: "/settings", icon: <Settings2Icon /> },
  { title: "Get Help", url: "#", icon: <CircleHelpIcon /> },
];

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  return (
    <Sidebar collapsible="offcanvas" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild className="data-[slot=sidebar-menu-button]:p-1.5! h-auto! overflow-visible!">
              <Link href="/system" className="flex items-center gap-3 px-3 py-2 whitespace-nowrap">
                <Image
                  src="/yebichu-logo.svg"
                  alt="YEBICHU"
                  width={32}
                  height={28}
                  className="size-8 shrink-0"
                />
                <div className="flex flex-col leading-none min-w-0">
                  <span className="font-display text-lg font-black label-text tracking-tight leading-none">
                    YEBICHU
                  </span>
                  <span className="text-[9px] font-semibold uppercase tracking-[0.3em] text-muted-foreground mt-0.5">
                    MANAGER
                  </span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={navMain} />
        <NavSecondary items={navSecondary} className="mt-auto" />
      </SidebarContent>
      <SidebarFooter>
        <NavUser />
      </SidebarFooter>
    </Sidebar>
  );
}
