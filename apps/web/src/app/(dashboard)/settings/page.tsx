"use client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MgmtVncTab } from "@/components/settings/mgmt-vnc-tab";
import { SnapshotsTab } from "@/components/settings/snapshots-tab";
import { FilesTab } from "@/components/settings/files-tab";
import { LogsTab } from "@/components/settings/logs-tab";
import { MonitorIcon, CameraIcon, FolderIcon, TerminalIcon } from "lucide-react";
import { useState } from "react";

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState("vnc");

  return (
    <div className="flex flex-col px-4 lg:px-6 h-[calc(100vh-8rem)]">
      <div className="flex items-center justify-between mb-6 shrink-0">
        <div>
          <h1 className="text-2xl font-semibold font-display">Settings</h1>
          <p className="text-sm text-muted-foreground">
            Manage config snapshots via the management instance
          </p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 min-h-0 flex flex-col">
        <TabsList className="mb-4 shrink-0">
          <TabsTrigger value="vnc">
            <MonitorIcon className="size-3.5" />
            VNC
          </TabsTrigger>
          <TabsTrigger value="snapshots">
            <CameraIcon className="size-3.5" />
            Snapshots
          </TabsTrigger>
          <TabsTrigger value="files">
            <FolderIcon className="size-3.5" />
            Files
          </TabsTrigger>
          <TabsTrigger value="logs">
            <TerminalIcon className="size-3.5" />
            Logs
          </TabsTrigger>
        </TabsList>

        <TabsContent value="vnc" className="flex-1 min-h-0">
          <MgmtVncTab />
        </TabsContent>

        <TabsContent value="snapshots" className="flex-1 min-h-0">
          <SnapshotsTab />
        </TabsContent>

        <TabsContent value="files" className="flex-1 min-h-0">
          <FilesTab />
        </TabsContent>

        <TabsContent value="logs" className="flex-1 min-h-0">
          <LogsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
