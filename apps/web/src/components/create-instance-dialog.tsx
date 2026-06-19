"use client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldContent, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { api } from "@/lib/api";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { PlusIcon, RefreshCwIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useRandomPassword } from "@/hooks/useRandomPassword";

interface CreateInstanceDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export function CreateInstanceDialog({ open, onOpenChange }: CreateInstanceDialogProps) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [password, regenerate] = useRandomPassword(8);

  const createMutation = useMutation({
    mutationFn: async (data: { name: string; password: string }) => {
      await api.post("/instances", data);
    },
    onMutate: () => ({ toastId: toast.loading("Creating instance...") }),
    onSuccess: (_data, _vars, ctx) => {
      qc.invalidateQueries({ queryKey: ["instances"] });
      onOpenChange(false);
      reset();
      toast.success("Instance created", { id: ctx?.toastId });
    },
    onError: (err: Error, _vars, ctx) => {
      toast.error(err.message, { id: ctx?.toastId });
    },
  });

  function reset() {
    setName("");
    regenerate();
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
          <Field>
            <FieldLabel htmlFor="name">Instance Name</FieldLabel>
            <FieldContent>
              <Input
                id="name"
                value={name}
                onChange={(e) => {
                  const raw = e.target.value;
                  const cleaned = raw.replace(/[^a-zA-Z0-9_-]/g, "");
                  if (raw !== cleaned) {
                    toast.warning("Only letters, numbers, hyphens, and underscores allowed");
                  }
                  setName(cleaned);
                }}
                placeholder="mt5-prod-1"
                pattern="^[-a-zA-Z0-9_]+$"
                required
              />
            </FieldContent>
            <p className="text-xs text-muted-foreground mt-1">
              Alphanumeric, hyphens and underscores only
            </p>
          </Field>

          <Field>
            <FieldLabel>VNC Password</FieldLabel>
            <FieldContent>
              <div className="flex gap-2">
                <Input value={password} readOnly className="font-mono" />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => regenerate()}
                >
                  <RefreshCwIcon className="size-3" />
                </Button>
              </div>
            </FieldContent>
          </Field>

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
