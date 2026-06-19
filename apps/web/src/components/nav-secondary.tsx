"use client";

import type * as React from "react";

import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import Link from "next/link";

export function NavSecondary({
  items,
  ...props
}: {
  items: {
    title: string;
    url: string;
    icon: React.ReactNode;
    isActive?: boolean;
  }[];
} & React.ComponentPropsWithoutRef<typeof SidebarGroup>) {
  return (
    <SidebarGroup {...props}>
      <div className="mx-3 my-2 border-t border-sidebar-border/50" />
      <SidebarGroupContent className="flex flex-col gap-1 px-2 pb-2">
        <SidebarMenu>
          {items.map((item) => (
            <SidebarMenuItem key={item.title}>
              <SidebarMenuButton
                asChild
                isActive={item.isActive}
                tooltip={item.title}
                className="transition-all duration-200 ease-out text-muted-foreground data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground data-[active=true]:font-medium hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground hover:translate-x-0.5"
              >
                <Link href={item.url} className="gap-3 px-3 py-2">
                  <span className="transition-transform duration-200">{item.icon}</span>
                  <span>{item.title}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
