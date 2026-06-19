"use client";
import { SidebarProvider } from "@/components/ui/sidebar";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { Fraunces, Plus_Jakarta_Sans } from "next/font/google";
import { type ReactNode, useState } from "react";
import "./globals.css";
import { cn } from "@/lib/utils";

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-serif",
  display: "swap",
});

const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

export default function RootLayout({ children }: { children: ReactNode }) {
  const [qc] = useState(() => new QueryClient());
  return (
    <html lang="en" suppressHydrationWarning className={cn("h-full antialiased font-sans", fraunces.variable, plusJakartaSans.variable)}>
      <body className="min-h-full flex">
        <QueryClientProvider client={qc}>
          <ThemeProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange>
            <TooltipProvider delayDuration={0}>
              <SidebarProvider
                style={
                  {
                    "--sidebar-width": "calc(var(--spacing) * 72)",
                    "--header-height": "calc(var(--spacing) * 12)",
                  } as React.CSSProperties
                }
              >
                {children}
              </SidebarProvider>
              <Toaster />
            </TooltipProvider>
          </ThemeProvider>
        </QueryClientProvider>
      </body>
    </html>
  );
}
