"use client";
import { LoginForm } from "@/components/login-form";
import { useAuthSession } from "@/hooks/useAuth";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function LoginPage() {
  const { data: user, isLoading } = useAuthSession();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && user) {
      router.push("/instances");
    }
  }, [user, isLoading, router]);

  if (isLoading) return null;
  if (user) return null;

  return (
    <div className="relative flex w-full min-h-svh flex-col items-center justify-center gap-6 overflow-hidden bg-background p-4 md:p-10">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_bottom_right,color-mix(in_oklch,var(--primary)_4%,transparent),transparent_40%,color-mix(in_oklch,var(--primary)_3%,transparent)_70%,transparent)]" />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(0,0,0,0.015)_1px,transparent_1px),linear-gradient(90deg,rgba(0,0,0,0.015)_1px,transparent_1px)] bg-[length:48px_48px] dark:bg-[linear-gradient(rgba(255,255,255,0.015)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.015)_1px,transparent_1px)]" />
      <div className="pointer-events-none absolute -top-48 -left-48 size-96 rounded-full bg-primary/5 blur-3xl max-md:hidden" />
      <div className="pointer-events-none absolute -bottom-48 -right-48 size-96 rounded-full bg-primary/5 blur-3xl max-md:hidden" />
      <div className="relative z-10 flex w-full max-w-sm flex-col gap-6">
        <LoginForm />
      </div>
      <p className="relative z-10 text-xs text-muted-foreground">&copy; {new Date().getFullYear()} YEBICHU</p>
    </div>
  );
}
