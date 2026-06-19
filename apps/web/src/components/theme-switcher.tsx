"use client";
import { MoonIcon, SunIcon } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

export function ThemeSwitcher({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <Button variant="ghost" size="icon" className={cn("size-8", className)}>
        <span className="sr-only">Toggle theme</span>
      </Button>
    );
  }

  const isDark = theme === "dark";

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          className={cn(
            "relative size-8 rounded-md hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-all duration-200",
            className
          )}
          onClick={() => setTheme(isDark ? "light" : "dark")}
        >
          <SunIcon
            className={cn(
              "size-4 transition-all duration-300 rotate-0 scale-100",
              isDark ? "rotate-90 scale-0 absolute" : "rotate-0 scale-100"
            )}
          />
          <MoonIcon
            className={cn(
              "size-4 transition-all duration-300 -rotate-90 scale-0 absolute",
              !isDark ? "-rotate-90 scale-0 absolute" : "-rotate-0 scale-100"
            )}
          />
          <span className="sr-only">Toggle theme</span>
        </Button>
      </TooltipTrigger>
      <TooltipContent side="right" sideOffset={8}>
        {isDark ? "Switch to light mode" : "Switch to dark mode"}
      </TooltipContent>
    </Tooltip>
  );
}
