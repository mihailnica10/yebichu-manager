"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { SidebarProvider } from "@/components/ui/sidebar";
import { ThemeProvider } from "next-themes";
import { useState } from "react";

export default function SetupLayout({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider delayDuration={300}>
        <SidebarProvider>
          <ThemeProvider attribute="class" defaultTheme="dark" forcedTheme="dark">
            {children}
            <Toaster />
          </ThemeProvider>
        </SidebarProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}
