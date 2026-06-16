"use client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { Field, FieldContent, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { useSignIn } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { EyeIcon, EyeOffIcon } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function LoginForm({ className, ...props }: React.ComponentProps<"div">) {
  const router = useRouter();
  const signIn = useSignIn();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [formError, setFormError] = useState("");
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});

  function validate() {
    const next: { email?: string; password?: string } = {};
    if (!email.trim()) next.email = "Email is required";
    if (!password) next.password = "Password is required";
    setErrors(next);
    return !next.email && !next.password;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError("");
    if (!validate()) return;
    try {
      await signIn.mutateAsync({ email, password });
      router.push("/instances");
    } catch (err: unknown) {
      const message =
        err && typeof err === "object" && "response" in err
          ? ((err as { response?: { data?: { error?: string } } }).response?.data?.error ?? "")
          : "";
      setFormError(message || (err instanceof Error ? err.message : "Sign in failed"));
    }
  }

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card
        size="sm"
        className="animate-[fadeSlideUp_0.5s_ease-out] border-0 shadow-none md:border md:shadow-sm md:shadow-black/5"
      >
        <CardHeader className="text-center pt-6 md:pt-4">
          <div className="flex flex-col items-center gap-2">
            <Image
              src="/yebichu-logo.svg"
              alt="YEBICHU"
              width={48}
              height={44}
              className="size-12"
              priority
            />
            <h1 className="font-display text-3xl font-black label-text tracking-tight">
              YEBICHU
            </h1>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-muted-foreground">
              TRADING CONTROL PLATFORM
            </p>
          </div>
          <CardDescription>Sign in to manage your instances</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} noValidate>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="email">Email</FieldLabel>
                <FieldContent>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      if (errors.email) setErrors((p) => ({ ...p, email: undefined }));
                    }}
                    placeholder="admin@yebichu.com"
                    className="h-11 text-base md:h-10"
                    aria-invalid={!!errors.email || undefined}
                    autoComplete="email"
                  />
                  {errors.email && <FieldError>{errors.email}</FieldError>}
                </FieldContent>
              </Field>
              <Field>
                <FieldLabel htmlFor="password">Password</FieldLabel>
                <FieldContent>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        if (errors.password) setErrors((p) => ({ ...p, password: undefined }));
                      }}
                      className="h-11 pr-10 text-base md:h-10"
                      aria-invalid={!!errors.password || undefined}
                      autoComplete="current-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((p) => !p)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
                      tabIndex={-1}
                      aria-label={showPassword ? "Hide password" : "Show password"}
                    >
                      {showPassword ? (
                        <EyeOffIcon className="size-4" />
                      ) : (
                        <EyeIcon className="size-4" />
                      )}
                    </button>
                  </div>
                  {errors.password && <FieldError>{errors.password}</FieldError>}
                </FieldContent>
              </Field>
              {formError && (
                <FieldError className="text-center">{formError}</FieldError>
              )}
              <Field>
                <Button
                  type="submit"
                  disabled={signIn.isPending}
                  className="h-11 w-full text-base transition-transform active:scale-[0.98] hover:scale-[1.01] md:h-10 md:text-sm"
                >
                  {signIn.isPending ? (
                    <span className="flex items-center gap-2">
                      <Spinner className="size-4" />
                      Signing in...
                    </span>
                  ) : (
                    "Sign in"
                  )}
                </Button>
              </Field>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>
      <style>{`
        @keyframes fadeSlideUp {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
