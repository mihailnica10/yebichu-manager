"use client";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useEffect, useRef, useState } from "react";

interface VncViewerProps {
  wsUrl: string;
  onDisconnect?: () => void;
}

export function VncViewer({ wsUrl, onDisconnect }: VncViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const rfbRef = useRef<any>(null);
  const [status, setStatus] = useState<"connecting" | "connected" | "disconnected" | "error">(
    "connecting",
  );
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    if (!containerRef.current || !wsUrl) return;

    let rfb: any;
    let mounted = true;

    async function connect() {
      try {
        const RFB = (await import("@novnc/novnc")).default;
        if (!mounted) return;

        rfb = new RFB(containerRef.current, wsUrl, {
          credentials: { password: "" },
          repeaterID: "",
          shared: true,
        });
        rfbRef.current = rfb;

        rfb.addEventListener("connect", () => {
          if (mounted) setStatus("connected");
        });
        rfb.addEventListener("disconnect", () => {
          if (mounted) {
            setStatus("disconnected");
            onDisconnect?.();
          }
        });
        rfb.addEventListener("securityfailure", (e: any) => {
          if (mounted) {
            setStatus("error");
            setErrorMsg(e.detail || "Authentication failed");
          }
        });
        rfb.addEventListener("desktopname", () => {
          document.title = `VNC - ${rfb.desktopName || "Remote Desktop"}`;
        });

        rfb.viewOnly = false;
        rfb.scaleViewport = true;
        rfb.resizeSession = false;
      } catch (err: any) {
        if (mounted) {
          setStatus("error");
          setErrorMsg(err.message || "Failed to initialize VNC");
        }
      }
    }

    connect();

    return () => {
      mounted = false;
      if (rfb) {
        try {
          rfb.disconnect();
        } catch {}
        rfbRef.current = null;
      }
    };
  }, [wsUrl, onDisconnect]);

  useEffect(() => {
    function handleResize() {
      if (rfbRef.current) {
        try {
          rfbRef.current.requestResize();
        } catch {}
      }
    }
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return (
    <div className="relative flex flex-col items-center bg-black rounded-lg overflow-hidden">
      <div className="w-full flex items-center justify-between px-3 py-1.5 bg-card border-b border-border">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span
            className={`inline-block size-1.5 rounded-full ${
              status === "connected"
                ? "bg-green-500"
                : status === "connecting"
                  ? "bg-yellow-500 animate-pulse"
                  : "bg-red-500"
            }`}
          />
          <span>
            {status === "connecting" && "Connecting..."}
            {status === "connected" && "Connected"}
            {status === "disconnected" && "Disconnected"}
            {status === "error" && "Connection Error"}
          </span>
        </div>
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-xs"
            onClick={() => {
              if (rfbRef.current) {
                try {
                  rfbRef.current.sendCtrlAltDel();
                } catch {}
              }
            }}
          >
            Ctrl+Alt+Del
          </Button>
        </div>
      </div>

      <div className="relative w-full h-[50vh] md:h-[70vh]">
        {status === "connecting" && (
          <div className="absolute inset-0 flex items-center justify-center bg-card/95 z-10">
            <div className="text-center text-muted-foreground">
              <Spinner className="size-8 mx-auto mb-2" />
              <p className="text-sm">Connecting to VNC...</p>
            </div>
          </div>
        )}
        {status === "error" && (
          <div className="absolute inset-0 flex items-center justify-center bg-card/95 z-10">
            <div className="text-center text-muted-foreground max-w-md px-4">
              <p className="text-sm font-medium text-destructive mb-1">Connection Failed</p>
              <p className="text-xs">{errorMsg || "Could not connect to the VNC server"}</p>
            </div>
          </div>
        )}
        <div
          ref={containerRef}
          className="w-full h-full touch-none"
          style={{ touchAction: "none" }}
        />
      </div>

      <div className="w-full flex items-center justify-center gap-4 px-3 py-2 bg-card border-t border-border text-xs text-muted-foreground">
        <span>Mouse: click to interact</span>
        <span className="text-muted-foreground/50">|</span>
        <span>Scroll to zoom</span>
      </div>
    </div>
  );
}
