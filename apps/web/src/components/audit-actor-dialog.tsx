"use client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { UserIcon } from "lucide-react";

export function ActorDialog({ name, email, actorId }: { name?: string | null; email?: string | null; actorId?: number | null }) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="link" className="h-auto p-0 font-mono text-xs">
          {name || email || String(actorId ?? "system")}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserIcon className="size-4" />
            User Details
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <div className="flex justify-between border-b border-border/50 pb-2">
            <span className="text-muted-foreground">ID</span>
            <span className="font-mono">{actorId ?? "—"}</span>
          </div>
          <div className="flex justify-between border-b border-border/50 pb-2">
            <span className="text-muted-foreground">Name</span>
            <span>{name || "—"}</span>
          </div>
          <div className="flex justify-between border-b border-border/50 pb-2">
            <span className="text-muted-foreground">Email</span>
            <span>{email || "—"}</span>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
