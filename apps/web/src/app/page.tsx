import { redirect } from "next/navigation";

export default async function Home() {
  let completed = false;
  try {
    const apiUrl = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:3556";
    const res = await fetch(`${apiUrl}/api/setup/status`, {
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) {
      const data = await res.json();
      completed = data.completed;
    }
  } catch {
    // Network error — fall through to redirect below
  }

  if (!completed) redirect("/setup");
  redirect("/instances");
}
