"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from "@/components/ui/dialog";
import { useRPA } from "@/hooks/useRPA";
import { toast } from "sonner";
import {
  EyeIcon,
  MonitorIcon,
  SearchIcon,
  ServerIcon,
  LogInIcon,
  XIcon,
  KeyboardIcon,
  MousePointerClickIcon,
  Trash2Icon,
  RotateCcwIcon,
} from "lucide-react";

export function RPAPanel({ name }: { name: string }) {
  const rpa = useRPA(name);

  return (
    <div className="space-y-4">
      <QuickActions rpa={rpa} name={name} />
      <BrokerSearch rpa={rpa} name={name} />
      <SignInPanel rpa={rpa} name={name} />
    </div>
  );
}

// ─── Quick Actions ──────────────────────────────────────────────────

function QuickActions({ rpa, name: _n }: { rpa: ReturnType<typeof useRPA>; name: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <MonitorIcon className="size-4" />
          Quick Actions
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => rpa.focus.mutate()}
            disabled={rpa.focus.isPending}
          >
            {rpa.focus.isPending ? <Spinner className="size-3" /> : null}
            Focus MT5
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => rpa.dismissLiveupdate.mutate()}
            disabled={rpa.dismissLiveupdate.isPending}
          >
            {rpa.dismissLiveupdate.isPending ? <Spinner className="size-3" /> : <XIcon className="size-3" />}
            Dismiss Dialogs
          </Button>
          <ListWindowsDialog rpa={rpa} />
          <Button
            variant="outline"
            size="sm"
            onClick={() => rpa.dialogOpen.mutate()}
            disabled={rpa.dialogOpen.isPending}
          >
            {rpa.dialogOpen.isPending ? <Spinner className="size-3" /> : null}
            Open Account
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => rpa.dialogCancel.mutate()}
            disabled={rpa.dialogCancel.isPending}
          >
            Cancel Dialog
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function ListWindowsDialog({ rpa }: { rpa: ReturnType<typeof useRPA> }) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <EyeIcon className="size-3" />
          Windows
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Visible Windows</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => rpa.listWindows.mutate(undefined, {
              onSuccess: () => setOpen(true),
            })}
            disabled={rpa.listWindows.isPending}
          >
            {rpa.listWindows.isPending ? <Spinner className="size-3" /> : null}
            Refresh
          </Button>
          <ScrollArea className="h-72 rounded-md border p-2">
            {rpa.listWindows.data?.windows.map((w) => (
              <div
                key={w.id}
                className="flex items-center justify-between py-1 text-xs font-mono border-b border-border/50 last:border-0"
              >
                <span className="truncate">{w.name}</span>
                <span className="text-muted-foreground shrink-0 ml-2">
                  {w.width}x{w.height}@{w.x},{w.y}
                </span>
              </div>
            ))}
            {rpa.listWindows.data?.windows.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-4">No windows</p>
            )}
          </ScrollArea>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Broker Search & Server Discovery ───────────────────────────────

function BrokerSearch({ rpa, name: _n }: { rpa: ReturnType<typeof useRPA>; name: string }) {
  const [searchQuery, setSearchQuery] = useState("");
  const [brokers, setBrokers] = useState<{ name: string }[]>([]);
  const [selectedBroker, setSelectedBroker] = useState("");
  const [servers, setServers] = useState<string[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);

  const handleSearch = () => {
    if (!searchQuery.trim()) return;
    rpa.searchBroker.mutate(searchQuery.trim(), {
      onSuccess: (data) => {
        const brokerData = data.brokers;
        if (brokerData?.status === "error") {
          toast.error(`Broker search failed: ${brokerData.detail || "Dialog not open — click 'Open Account' first"}`);
          return;
        }
        const brokerList = brokerData?.brokers || [];
        setBrokers(brokerList);
        setSearchOpen(true);
      },
    });
  };

  const handleSelectBroker = (broker: string) => {
    setSelectedBroker(broker);
    setSearchOpen(false);
    rpa.discoverServers.mutate(broker, {
      onSuccess: (data) => {
        if (data.servers) setServers(data.servers);
      },
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <SearchIcon className="size-4" />
          Broker Search & Servers
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex gap-2">
          <Input
            placeholder="Search broker (e.g. IC Markets, RoboForex)"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            className="flex-1"
          />
          <Button
            onClick={handleSearch}
            disabled={rpa.searchBroker.isPending || !searchQuery.trim()}
          >
            {rpa.searchBroker.isPending ? <Spinner className="size-4" /> : <SearchIcon className="size-4" />}
            Search
          </Button>
        </div>

        {/* Broker Results Dialog */}
        <Dialog open={searchOpen} onOpenChange={setSearchOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Brokers found: "{searchQuery}"</DialogTitle>
            </DialogHeader>
            <ScrollArea className="h-64 rounded-md border p-2">
              {brokers.map((b, i) => (
                <button
                  key={i}
                  type="button"
                  className="w-full text-left px-3 py-2 text-sm rounded-md hover:bg-accent transition-colors"
                  onClick={() => handleSelectBroker(b.name)}
                >
                  {b.name}
                </button>
              ))}
              {brokers.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-4">No brokers found</p>
              )}
            </ScrollArea>
          </DialogContent>
        </Dialog>

        {/* Selected Broker & Servers */}
        {selectedBroker && (
          <div className="rounded-md border p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">{selectedBroker}</span>
              <Badge variant="outline" className="text-xs">
                {servers.length} server{servers.length !== 1 ? "s" : ""}
              </Badge>
            </div>
            <ScrollArea className="h-32">
              <div className="space-y-1">
                {rpa.discoverServers.isPending ? (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
                    <Spinner className="size-3" /> Discovering servers...
                  </div>
                ) : (
                  servers.map((s, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between py-1 px-2 text-xs font-mono rounded hover:bg-accent/50"
                    >
                      <span>{s}</span>
                      <button
                        type="button"
                        className="text-primary hover:underline"
                        onClick={() => {
                          // Pre-fill server in sign-in form
                          const input = document.querySelector<HTMLInputElement>('[data-rpa-server]');
                          if (input) input.value = s;
                        }}
                      >
                        Use
                      </button>
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Sign In Panel ──────────────────────────────────────────────────

function SignInPanel({ rpa, name: _n }: { rpa: ReturnType<typeof useRPA>; name: string }) {
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [server, setServer] = useState("");

  const handleSignIn = () => {
    if (!login || !password || !server) return;
    rpa.signIn.mutate({ login, password, server });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <LogInIcon className="size-4" />
          Sign In to Trading Account
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Login</label>
            <Input
              placeholder="Login"
              value={login}
              onChange={(e) => setLogin(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Password</label>
            <Input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Server</label>
            <Input
              data-rpa-server
              placeholder="e.g. ICMarkets-Demo"
              value={server}
              onChange={(e) => setServer(e.target.value)}
            />
          </div>
        </div>

        {rpa.signIn.data && (
          <div className="text-xs text-muted-foreground space-y-1">
            <p>Status: <Badge variant="outline">{rpa.signIn.data.status}</Badge></p>
            <p className="font-mono">{rpa.signIn.data.server}</p>
          </div>
        )}

        <Button
          onClick={handleSignIn}
          disabled={rpa.signIn.isPending || !login || !password || !server}
          className="w-full"
        >
          {rpa.signIn.isPending ? <Spinner className="size-4" /> : <LogInIcon className="size-4" />}
          Sign In
        </Button>
      </CardContent>
    </Card>
  );
}
