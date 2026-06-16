"use client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { api } from "@/lib/api";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { PlusIcon, RefreshCwIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

interface CreateInstanceDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export function CreateInstanceDialog({ open, onOpenChange }: CreateInstanceDialogProps) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [password, setPassword] = useState(() => Math.random().toString(36).slice(2, 10));

  const createMutation = useMutation({
    mutationFn: async (data: { name: string; password: string }) => {
      await api.post("/instances", data);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["instances"] });
      onOpenChange(false);
      reset();
      toast.success("Instance created");
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  function reset() {
    setName("");
    setPassword(Math.random().toString(36).slice(2, 10));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    createMutation.mutate({
      name: name.trim(),
      password,
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create Instance</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <Label htmlFor="name">Instance Name</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value.replace(/[^a-zA-Z0-9_-]/g, ""))}
              placeholder="mt5-prod-1"
              pattern="^[-a-zA-Z0-9_]+$"
              required
            />
            <p className="text-xs text-muted-foreground mt-1">
              Alphanumeric, hyphens and underscores only
            </p>
          </div>

          <div>
            <Label>VNC Password</Label>
            <div className="flex gap-2">
              <Input value={password} readOnly className="font-mono" />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => setPassword(Math.random().toString(36).slice(2, 10))}
              >
                <RefreshCwIcon className="size-3" />
              </Button>
            </div>
          </div>

          <Button type="submit" disabled={createMutation.isPending} className="w-full">
            {createMutation.isPending ? (
              <>
                <Spinner className="size-4 mr-2" /> Creating...
              </>
            ) : (
              <>
                <PlusIcon className="size-4 mr-2" /> Create Instance
              </>
            )}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
