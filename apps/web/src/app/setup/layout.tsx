import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Setup – MT5 Manager",
  description: "First-time setup",
};

export default function SetupLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
