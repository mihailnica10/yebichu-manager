import { redirect } from "next/navigation";

export default async function HomePage() {
  let healthy = false;
  try {
    const apiUrl = process.env.API_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3556");
    const res = await fetch(`${apiUrl}/api/setup/status`, {
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) {
      const data = await res.json();
      healthy = data.healthy;
    }
  } catch {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center space-y-4">
          <h1 className="text-xl font-semibold">API Unreachable</h1>
          <p className="text-muted-foreground">Could not connect to the backend. Make sure the server is running.</p>
          <a href="/" className="text-primary underline">Retry</a>
        </div>
      </div>
    );
  }
  if (healthy) redirect("/instances");
  redirect("/setup");
}
