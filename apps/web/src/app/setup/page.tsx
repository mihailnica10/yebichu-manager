"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  CheckCircle2,
  Server,
  Terminal,
  UserPlus,
  ArrowRight,
  Loader2,
  RefreshCw,
  Settings2,
} from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import Image from "next/image";

const STEPS = [
  { num: 1, label: "Account", desc: "Create admin account" },
  { num: 2, label: "Docker", desc: "Verify Docker + image" },
  { num: 3, label: "Instance", desc: "Create management instance" },
  { num: 4, label: "Ready", desc: "Start managing" },
];

function StepIndicator({ current, skipMap }: { current: number; skipMap: Record<number, boolean> }) {
  return (
    <div className="flex items-center justify-center gap-0">
      {STEPS.map((s, i) => (
        <div key={s.num} className="flex items-center">
          <div className="flex flex-col items-center gap-1">
            <div
              className={cn(
                "flex size-8 items-center justify-center rounded-full text-xs font-medium transition-all duration-300",
                current === s.num
                  ? "bg-primary text-primary-foreground ring-2 ring-primary/30"
                  : skipMap[s.num]
                    ? "bg-primary/15 text-primary"
                    : current > s.num
                      ? "bg-primary/20 text-primary"
                      : "bg-muted text-muted-foreground",
              )}
            >
              {skipMap[s.num] ? (
                <ArrowRight className="size-3.5" />
              ) : current > s.num ? (
                <CheckCircle2 className="size-4" />
              ) : (
                s.num
              )}
            </div>
            <span
              className={cn(
                "text-[10px] font-medium leading-tight text-center",
                current === s.num
                  ? "text-foreground"
                  : current > s.num
                    ? "text-primary/70"
                    : "text-muted-foreground",
              )}
            >
              {s.label}
            </span>
          </div>
          {i < STEPS.length - 1 && (
            <div
              className={cn(
                "mx-2 h-px w-10 transition-colors",
                current > s.num ? "bg-primary/40" : "bg-border",
              )}
            />
          )}
        </div>
      ))}
    </div>
  );
}

function SplashScreen() {
  return (
    <div className="flex flex-col items-center justify-center gap-6 min-h-svh w-full px-4">
      <Image
        src="/yebichu-logo.svg"
        alt="YEBICHU"
        width={96}
        height={84}
        className="opacity-80"
        priority
      />
      <div className="text-center">
        <h1 className="font-display text-3xl font-black tracking-tight">YEBICHU</h1>
        <p className="text-sm text-muted-foreground mt-1">MT5 Manager</p>
      </div>
      <div className="flex flex-col items-center gap-3">
        <Spinner className="size-6" />
        <p className="text-xs text-muted-foreground animate-pulse">Checking setup status…</p>
      </div>
    </div>
  );
}

function CreateAccountStep({ onSuccess, skip }: { onSuccess: () => void; skip: boolean }) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");

  const mutation = useMutation({
    mutationFn: (data: { email: string; name: string; password: string }) =>
      api.post("/auth/sign-up", data),
    onMutate: () => ({ toastId: toast.loading("Creating account...") }),
    onSuccess: (_data, _vars, ctx) => {
      toast.success("Account created", { id: ctx?.toastId });
      onSuccess();
    },
    onError: (err: Error, _vars, ctx) => {
      toast.error(err.message || "Failed to create account", { id: ctx?.toastId });
    },
  });

  if (skip) {
    return (
      <div className="flex items-center gap-3 py-4 text-sm text-muted-foreground">
        <CheckCircle2 className="size-4 text-primary" />
        <span>Admin account already exists</span>
      </div>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        mutation.mutate({ email, name, password });
      }}
      className="flex flex-col gap-4"
    >
      <p className="text-sm text-muted-foreground">Create your administrator account to get started.</p>
      <div className="flex flex-col gap-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="name">Name</Label>
        <Input
          id="name"
          placeholder="Your name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          type="password"
          placeholder="Min. 8 characters"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={8}
        />
      </div>
      <Button type="submit" disabled={mutation.isPending} className="mt-2 w-full">
        {mutation.isPending ? <Spinner className="size-4" /> : <UserPlus className="size-4" />}
        {mutation.isPending ? "Creating account…" : "Create Account"}
      </Button>
    </form>
  );
}

function DockerCheckStep({ onContinue, skip }: { onContinue: () => void; skip: boolean }) {
  const [building, setBuilding] = useState(false);
  const [installing, setInstalling] = useState(false);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["install-status"],
    queryFn: () => api.get("/install/status").then((r) => r.data),
    refetchInterval: building || installing ? 5000 : false,
  });

  const buildMutation = useMutation({
    mutationFn: () => api.post("/install/build-image"),
    onMutate: () => ({ toastId: toast.loading("Starting build...") }),
    onSuccess: (_data, _vars, ctx) => {
      toast.success("Build started", { id: ctx?.toastId });
      setBuilding(true);
    },
    onError: (err: Error, _vars, ctx) => {
      toast.error(err.message || "Failed to start build", { id: ctx?.toastId });
      setBuilding(false);
    },
  });

  const installMutation = useMutation({
    mutationFn: () => api.post("/install/docker"),
    onMutate: () => ({ toastId: toast.loading("Installing Docker...") }),
    onSuccess: (_data, _vars, ctx) => {
      toast.success("Docker installed", { id: ctx?.toastId });
      setInstalling(true);
    },
    onError: (err: Error, _vars, ctx) => {
      toast.error(err.message || "Failed to install Docker", { id: ctx?.toastId });
      setInstalling(false);
    },
  });

  if (skip) {
    return (
      <div className="flex items-center gap-3 py-4 text-sm text-muted-foreground">
        <CheckCircle2 className="size-4 text-primary" />
        <span>Docker is ready — image found</span>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex flex-col items-center gap-4 py-8">
        <Spinner className="size-6" />
        <p className="text-sm text-muted-foreground">Checking Docker status…</p>
      </div>
    );
  }

  const available = data?.docker?.available ?? false;
  const imageFound = data?.image?.exists ?? false;

  if (!available) {
    return (
      <div className="flex flex-col items-center gap-4 py-6 text-center">
        <Terminal className="size-10 text-destructive" />
        <p className="text-sm font-medium text-destructive">Docker is required</p>
        <p className="text-xs text-muted-foreground max-w-xs">
          Docker must be installed to run MT5 containers.
        </p>
        {installing ? (
          <div className="flex flex-col items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            <span>Installing Docker…</span>
            <span className="text-xs">This may take a minute</span>
          </div>
        ) : (
          <Button onClick={() => installMutation.mutate()} disabled={installMutation.isPending}>
            {installMutation.isPending ? <Spinner className="size-4" /> : <Terminal className="size-4" />}
            Install Docker
          </Button>
        )}
        <Button variant="link" size="sm" onClick={() => refetch()}>
          <RefreshCw className="size-3 mr-1" />
          Retry check
        </Button>
      </div>
    );
  }

  if (!imageFound) {
    return (
      <div className="flex flex-col items-center gap-4 py-6 text-center">
        <Server className="size-10 text-amber-500" />
        <p className="text-sm font-medium">Docker installed</p>
        <p className="text-xs text-muted-foreground max-w-xs">
          Docker is ready. The MT5 image needs to be built once — or continue without it.
        </p>
        <div className="flex flex-col gap-2 w-full max-w-[200px]">
          {building ? (
            <div className="flex flex-col items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              <span>Building image…</span>
              <span className="text-xs">This may take 2-5 minutes</span>
            </div>
          ) : (
            <>
              <Button onClick={() => buildMutation.mutate()} disabled={buildMutation.isPending}>
                {buildMutation.isPending ? <Spinner className="size-4" /> : <Server className="size-4" />}
                Build Image
              </Button>
              <Button variant="ghost" onClick={onContinue}>
                Continue
                <ArrowRight className="size-4 ml-1" />
              </Button>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4 py-6 text-center">
      <CheckCircle2 className="size-10 text-primary" />
      <p className="text-sm font-medium">Docker image ready</p>
      <p className="text-xs text-muted-foreground">
        Docker {data?.docker?.version} — mt5-tigervnc:latest
      </p>
      <Button onClick={onContinue} className="mt-2 w-full">
        Next Step
        <ArrowRight className="size-4 ml-1" />
      </Button>
    </div>
  );
}

function ManagementInstanceStep({ onComplete, skip }: { onComplete: (info: VncInfo) => void; skip: boolean }) {
  const [status, setStatus] = useState<"idle" | "creating" | "detecting" | "ready">("idle");
  const [autoSkipped, setAutoSkipped] = useState(false);

  const { data: setupStatus } = useQuery({
    queryKey: ["setup-status"],
    queryFn: () => api.get("/setup/status").then((r) => r.data),
  });

  const mutation = useMutation({
    mutationFn: () => api.post("/setup/management-instance"),
    onMutate: () => ({ toastId: toast.loading("Creating management instance...") }),
    onSuccess: (res, _vars, ctx) => {
      setStatus("detecting");
      toast.success("Instance created, detecting ports...", { id: ctx?.toastId });
      const poll = setInterval(async () => {
        try {
          const mgmt = await api.get("/instances/mt5-mgmt").then((r) => r.data);
          if (mgmt.wsPort) {
            clearInterval(poll);
            setStatus("ready");
            toast.success("Management instance ready");
            onComplete({ wsUrl: mgmt.wsUrl, vncPassword: mgmt.vncPassword });
          }
        } catch {}
      }, 2000);
      const timeout = setTimeout(() => {
        clearInterval(poll);
        if (status === "detecting") {
          setStatus("error");
          toast.error("Timed out waiting for management instance. Check Docker logs.");
        }
      }, 30000);
    },
    onError: (err: Error, _vars, ctx) => {
      toast.error(err.message || "Failed to create instance", { id: ctx?.toastId });
      setStatus("idle");
    },
  });

  useEffect(() => {
    if (skip && !autoSkipped) {
      setAutoSkipped(true);
      setStatus("detecting");
      const poll = setInterval(async () => {
        try {
          const mgmt = await api.get("/instances/mt5-mgmt").then((r) => r.data);
          if (mgmt.wsPort) {
            clearInterval(poll);
            setStatus("ready");
            onComplete({ wsUrl: mgmt.wsUrl, vncPassword: mgmt.vncPassword });
          }
        } catch {}
      }, 2000);
      setTimeout(() => clearInterval(poll), 30000);
    }
  }, [skip]);

  if (status === "ready") {
    return (
      <div className="flex items-center gap-3 py-4 text-sm text-muted-foreground">
        <CheckCircle2 className="size-4 text-primary" />
        <span>Management instance is running</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        Create a dedicated management instance to configure templates, charts, and EAs
        for all your trading instances.
      </p>
      <div className="rounded-lg border border-border bg-muted/50 px-4 py-3 flex items-center justify-between">
        <div>
          <span className="text-xs text-muted-foreground">Instance</span>
          <p className="font-mono text-sm font-medium">mt5-mgmt</p>
        </div>
        {status === "creating" && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="size-3 animate-spin" />
            Creating…
          </div>
        )}
        {status === "detecting" && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="size-3 animate-spin" />
            Detecting ports…
          </div>
        )}
      </div>
      <Button
        onClick={() => {
          setStatus("creating");
          mutation.mutate();
        }}
        disabled={status !== "idle"}
        className="w-full"
      >
        {status === "idle" ? (
          <>
            <Server className="size-4 mr-1" />
            Create & Start
          </>
        ) : (
          <>
            <Loader2 className="size-4 animate-spin mr-1" />
            {status === "creating" ? "Creating container…" : "Waiting for ports…"}
          </>
        )}
      </Button>
    </div>
  );
}

function ReadyStep({ vncInfo, onGoToDashboard }: { vncInfo: VncInfo | null; onGoToDashboard: () => void }) {
  const mutation = useMutation({
    mutationFn: () => api.post("/setup/complete"),
    onMutate: () => ({ toastId: toast.loading("Finalizing setup...") }),
    onSuccess: (_data, _vars, ctx) => {
      toast.success("Setup complete! Redirecting...", { id: ctx?.toastId });
      onGoToDashboard();
    },
    onError: (err: Error, _vars, ctx) => toast.error(err.message || "Failed to complete setup", { id: ctx?.toastId }),
  });

  return (
    <div className="flex flex-col items-center gap-4 py-2 text-center">
      <CheckCircle2 className="size-14 text-primary" />
      <div>
        <h2 className="text-lg font-semibold font-display">Setup complete!</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Your administrator account and management instance are ready.
        </p>
      </div>

      {vncInfo && (
        <div className="w-full rounded-lg border border-border bg-muted/50 p-4 text-left space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Management Instance
          </p>
          {vncInfo.wsUrl && (
            <div className="text-xs">
              <span className="text-muted-foreground">WebSocket:</span>
              <p className="font-mono text-foreground truncate">{vncInfo.wsUrl}</p>
            </div>
          )}
          {vncInfo.vncPassword && (
            <div className="text-xs">
              <span className="text-muted-foreground">Password:</span>
              <p className="font-mono text-foreground">{vncInfo.vncPassword}</p>
            </div>
          )}
        </div>
      )}

      <div className="flex flex-col gap-2 w-full mt-2">
        <Button onClick={() => mutation.mutate()} disabled={mutation.isPending} className="w-full">
          {mutation.isPending ? <Spinner className="size-4" /> : <ArrowRight className="size-4" />}
          {mutation.isPending ? "Finalizing…" : "Go to Dashboard"}
        </Button>
        <Button variant="outline" onClick={() => window.location.href = "/settings"} className="w-full">
          <Settings2 className="size-4 mr-1" />
          Manage Snapshots
        </Button>
      </div>
    </div>
  );
}

interface VncInfo {
  wsUrl?: string;
  vncPassword?: string;
}

export default function SetupPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [vncInfo, setVncInfo] = useState<VncInfo | null>(null);

  const statusQuery = useQuery({
    queryKey: ["setup-status"],
    queryFn: () => api.get("/setup/status").then((r) => r.data),
    retry: false,
  });

  useEffect(() => {
    if (statusQuery.data?.healthy) {
      router.replace("/instances");
    }
  }, [statusQuery.data?.healthy, router]);

  if (statusQuery.isLoading) {
    return (
      <div className="relative flex min-h-svh w-full flex-col items-center justify-center bg-background">
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_bottom_right,color-mix(in_oklch,var(--primary)_4%,transparent),transparent_40%,color-mix(in_oklch,var(--primary)_3%,transparent)_70%,transparent)]" />
        <SplashScreen />
      </div>
    );
  }
  if (statusQuery.isError) {
    return (
      <div className="relative flex min-h-svh w-full flex-col items-center justify-center bg-background p-4">
        <div className="text-center space-y-4 max-w-sm">
          <p className="text-destructive font-medium">Could not check setup status</p>
          <p className="text-sm text-muted-foreground">Make sure the server is running and reachable.</p>
          <Button variant="outline" size="sm" onClick={() => statusQuery.refetch()}>Retry</Button>
        </div>
      </div>
    );
  }

  const status = statusQuery.data;

  if (status?.healthy) return null;

  const skipMap: Record<number, boolean> = {};
  if (status?.hasUsers) skipMap[1] = true;
  if (status?.dockerAvailable && status?.imageExists) skipMap[2] = true;
  if (status?.managementInstanceRunning) skipMap[3] = true;

  const currentStep = (() => {
    if (step !== 0) {
      let s = step;
      while (s <= 4 && skipMap[s]) s++;
      return Math.min(s, 4);
    }
    if (!skipMap[1]) return 1;
    if (!skipMap[2]) return 2;
    if (!skipMap[3]) return 3;
    return 4;
  })();

  return (
    <div className="relative flex min-h-svh w-full flex-col items-center justify-center gap-6 overflow-hidden bg-background p-4 md:p-10">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_bottom_right,color-mix(in_oklch,var(--primary)_4%,transparent),transparent_40%,color-mix(in_oklch,var(--primary)_3%,transparent)_70%,transparent)]" />
      <div className="pointer-events-none absolute -top-48 -left-48 size-96 rounded-full bg-primary/5 blur-3xl max-md:hidden" />
      <div className="pointer-events-none absolute -bottom-48 -right-48 size-96 rounded-full bg-primary/5 blur-3xl max-md:hidden" />

      <div className="relative z-10 flex w-full max-w-md flex-col gap-8">
        <div className="flex flex-col items-center gap-2">
          <h1 className="font-display text-2xl tracking-tight">Setup Wizard</h1>
          <p className="text-sm text-muted-foreground">Configure your MT5 Manager</p>
        </div>

        <StepIndicator current={currentStep} skipMap={skipMap} />

        <Card>
          <CardContent className="pt-6">
            {currentStep === 1 && (
              <CreateAccountStep onSuccess={() => setStep(2)} skip={!!skipMap[1]} />
            )}
            {currentStep === 2 && (
              <DockerCheckStep onContinue={() => setStep(3)} skip={!!skipMap[2]} />
            )}
            {currentStep === 3 && (
              <ManagementInstanceStep
                onComplete={(info) => {
                  setVncInfo(info);
                  setStep(4);
                }}
                skip={!!skipMap[3]}
              />
            )}
            {currentStep === 4 && (
              <ReadyStep vncInfo={vncInfo} onGoToDashboard={() => router.replace("/instances")} />
            )}
          </CardContent>
        </Card>

        {!skipMap[1] && (
          <p className="text-center text-xs text-muted-foreground">
            &copy; {new Date().getFullYear()} YEBICHU
          </p>
        )}
      </div>
    </div>
  );
}
