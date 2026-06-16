"use client";
import { SectionCards } from "@/components/section-cards";
import { SystemChart } from "@/components/system-chart";

export default function SystemPage() {
  return (
    <>
      <SectionCards />
      <div className="px-4 lg:px-6">
        <SystemChart />
      </div>
    </>
  );
}
