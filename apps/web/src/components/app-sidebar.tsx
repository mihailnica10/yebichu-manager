"use client";
import { NavMain } from "@/components/nav-main";
import { NavSecondary } from "@/components/nav-secondary";
import { NavUser } from "@/components/nav-user";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { usePathname } from "next/navigation";
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
  { title: "Get Help", url: "https://github.com/anomalyco/mt5-manager/issues", icon: <CircleHelpIcon /> },
];

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const pathname = usePathname();
  return (
    <Sidebar collapsible="offcanvas" {...props}>
      <SidebarHeader>
        <div className="relative">
          <div className="absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-sidebar-accent/50 to-transparent pointer-events-none" />
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton asChild className="data-[slot=sidebar-menu-button]:p-1.5! h-auto! overflow-visible!">
                <Link href="/system" className="flex items-center gap-3 px-3 py-3 whitespace-nowrap group">
                  <div className="relative">
                    <Image
                      src="/yebichu-logo.svg"
                      alt="YEBICHU"
                      width={32}
                      height={28}
                      style={{ width: 32, height: 28 }}
                      className="transition-transform duration-200 group-hover:scale-110"
                    />
                  </div>
                  <div className="flex flex-col leading-none min-w-0">
                    <span className="font-display text-lg font-black label-text tracking-tight leading-none group-hover:text-primary transition-colors duration-200">
                      YEBICHU
                    </span>
                    <span className="text-[9px] font-semibold uppercase tracking-[0.3em] text-muted-foreground mt-0.5 group-hover:text-sidebar-accent-foreground transition-colors duration-200">
                      MANAGER
                    </span>
                  </div>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={navMain.map(item => ({ ...item, isActive: pathname.startsWith(item.url) }))} />
        <div className="px-3 py-2">
          <ThemeSwitcher />
        </div>
        <NavSecondary items={navSecondary.map(item => ({ ...item, isActive: pathname.startsWith(item.url) }))} className="mt-auto" />
      </SidebarContent>
      <SidebarFooter>
        <NavUser />
      </SidebarFooter>
    </Sidebar>
  );
}
