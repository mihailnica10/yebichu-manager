"use client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Spinner } from "@/components/ui/spinner";
import { Skeleton } from "@/components/ui/skeleton";
import { useQuery, useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  UploadIcon,
  FolderPlusIcon,
  ArrowUpIcon,
  FolderIcon,
  FileIcon,
  Trash2Icon,
  AlertCircleIcon,
  RefreshCwIcon,
} from "lucide-react";
import { useState, useCallback, useRef } from "react";
import { toast } from "sonner";
import { formatSize } from "@/lib/format";

interface FileEntry {
  name: string;
  type: "file" | "dir";
  size?: number;
  modifiedAt?: number;
}

function ConfirmDeleteButton({ onConfirm, disabled }: { onConfirm: () => void; disabled?: boolean }) {
  const [confirming, setConfirming] = useState(false);
  return (
    <button
      type="button"
      className="text-muted-foreground hover:text-destructive transition-colors p-0.5"
      onClick={(e) => {
        e.stopPropagation();
        if (confirming) {
          onConfirm();
          setConfirming(false);
        } else {
          setConfirming(true);
          setTimeout(() => setConfirming(false), 3000);
        }
      }}
      disabled={disabled}
    >
      {confirming ? (
        <span className="text-[10px] text-destructive font-medium">Confirm?</span>
      ) : (
        <Trash2Icon className="size-4" />
      )}
    </button>
  );
}

export function FilesTab() {
  const [currentPath, setCurrentPath] = useState("");
  const [showFolderDialog, setShowFolderDialog] = useState(false);
  const [folderName, setFolderName] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: files, isLoading: filesLoading, isError: filesError, refetch: refetchFiles } = useQuery({
    queryKey: ["mgmt-files", currentPath],
    queryFn: () => api.get("/mgmt/files", { params: { path: currentPath } }).then((r) => r.data),
  });

  const uploadMutation = useMutation({
    mutationFn: (formData: FormData) =>
      api.post("/mgmt/files/upload", {
        params: { path: currentPath },
        data: formData,
        headers: { "Content-Type": "multipart/form-data" },
      }),
    onMutate: () => ({ toastId: toast.loading("Uploading files...") }),
    onSuccess: (_data, _vars, ctx) => {
      refetchFiles();
      toast.success("Files uploaded", { id: ctx?.toastId });
    },
    onError: (err: Error, _vars, ctx) => toast.error(err.message, { id: ctx?.toastId }),
  });

  const deleteMutation = useMutation({
    mutationFn: (filePath: string) => api.delete("/mgmt/files", { params: { path: filePath } }),
    onMutate: () => ({ toastId: toast.loading("Deleting file...") }),
    onSuccess: (_data, _vars, ctx) => {
      refetchFiles();
      toast.success("File deleted", { id: ctx?.toastId });
    },
    onError: (err: Error, _vars, ctx) => toast.error(err.message, { id: ctx?.toastId }),
  });

  const mkdirMutation = useMutation({
    mutationFn: (dirPath: string) => api.post("/mgmt/files/mkdir", { params: { path: dirPath } }),
    onMutate: () => ({ toastId: toast.loading("Creating directory...") }),
    onSuccess: (_data, _vars, ctx) => {
      refetchFiles();
      toast.success("Directory created", { id: ctx?.toastId });
    },
    onError: (err: Error, _vars, ctx) => toast.error(err.message, { id: ctx?.toastId }),
  });

  const pathSegments = currentPath.split("/").filter(Boolean);

  const goUp = useCallback(() => {
    setCurrentPath((prev) => {
      const parts = prev.split("/").filter(Boolean);
      parts.pop();
      return parts.join("/");
    });
  }, []);

  const handleUpload = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files_list = e.target.files;
      if (!files_list || files_list.length === 0) return;
      const formData = new FormData();
      for (const file of Array.from(files_list)) {
        formData.append("files", file);
      }
      uploadMutation.mutate(formData);
      e.target.value = "";
    },
    [currentPath, uploadMutation],
  );

  const handleNewFolder = useCallback(() => {
    setShowFolderDialog(true);
    setFolderName("");
  }, []);

  const handleCreateFolder = useCallback(() => {
    const name = folderName.trim();
    if (!name) return;
    const dirPath = currentPath ? `${currentPath}/${name}` : name;
    mkdirMutation.mutate(dirPath);
    setShowFolderDialog(false);
    setFolderName("");
  }, [currentPath, folderName, mkdirMutation]);

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-2 mb-3 shrink-0">
        <input
          ref={fileInputRef}
          type="file"
          multiple
          hidden
          onChange={handleUpload}
        />
        <Button
          size="xs"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploadMutation.isPending}
        >
          {uploadMutation.isPending ? (
            <Spinner className="size-3 mr-1" />
          ) : (
            <UploadIcon className="size-3.5 mr-1" />
          )}
          {uploadMutation.isPending ? "Uploading..." : "Upload"}
        </Button>
        <Button
          size="xs"
          variant="outline"
          onClick={handleNewFolder}
          disabled={mkdirMutation.isPending}
        >
          {mkdirMutation.isPending ? (
            <Spinner className="size-3 mr-1" />
          ) : (
            <FolderPlusIcon className="size-3.5 mr-1" />
          )}
          New Folder
        </Button>
        {pathSegments.length > 0 && (
          <Button size="xs" variant="ghost" onClick={goUp}>
            <ArrowUpIcon className="size-3.5" />
          </Button>
        )}
      </div>

      {/* Breadcrumb */}
      <div className="flex items-center gap-1 text-sm mb-3 shrink-0 text-muted-foreground">
        <button
          className="hover:text-foreground transition-colors font-medium"
          onClick={() => setCurrentPath("")}
        >
          MQL5
        </button>
        {pathSegments.map((segment, i) => (
          <span key={i} className="flex items-center gap-1">
            <span className="text-muted-foreground/40">/</span>
            <button
              className="hover:text-foreground transition-colors"
              onClick={() => setCurrentPath(pathSegments.slice(0, i + 1).join("/"))}
            >
              {segment}
            </button>
          </span>
        ))}
      </div>

      {/* File list */}
      <div className="flex-1 min-h-0">
        {filesLoading ? (
          <div className="space-y-1">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full rounded-lg" />
            ))}
          </div>
        ) : filesError ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
            <AlertCircleIcon className="size-8 mb-2 text-destructive/60" />
            <p className="text-sm font-medium">Failed to load files</p>
            <Button
              variant="outline"
              size="xs"
              className="mt-3"
              onClick={() => refetchFiles()}
            >
              <RefreshCwIcon className="size-3 mr-1" />
              Retry
            </Button>
          </div>
        ) : !files?.entries || files.entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
            <FolderIcon className="size-10 mb-3 opacity-30" />
            <p className="text-sm font-medium">This directory is empty</p>
          </div>
        ) : (
          <ScrollArea className="h-full">
            <div className="space-y-0.5 pr-3">
              {/* Table header */}
              <div className="flex items-center gap-3 px-3 py-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                <span className="w-[32px]" />
                <span className="flex-1">Name</span>
                <span className="w-[80px] text-right">Size</span>
                <span className="w-[80px]">Type</span>
                <span className="w-[100px]">Modified</span>
                <span className="w-[40px]" />
              </div>

              {(files.entries as FileEntry[]).map((entry) => (
                <div
                  key={entry.name}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors hover:bg-muted/50 cursor-pointer",
                  )}
                  onClick={() => {
                    if (entry.type === "dir") {
                      const newPath = currentPath
                        ? `${currentPath}/${entry.name}`
                        : entry.name;
                      setCurrentPath(newPath);
                    }
                  }}
                >
                  <span className="w-[32px] shrink-0 text-muted-foreground">
                    {entry.type === "dir" ? (
                      <FolderIcon className="size-4" />
                    ) : (
                      <FileIcon className="size-4" />
                    )}
                  </span>
                  <span className="flex-1 truncate font-medium">
                    {entry.name}
                  </span>
                  <span className="w-[80px] text-right text-xs text-muted-foreground shrink-0 font-mono">
                    {entry.type === "file" && entry.size != null
                      ? formatSize(entry.size)
                      : "-"}
                  </span>
                  <span className="w-[80px] text-xs text-muted-foreground shrink-0">
                    {entry.type === "dir" ? "folder" : "file"}
                  </span>
                  <span className="w-[100px] text-xs text-muted-foreground shrink-0">
                    {entry.type === "file" && entry.modifiedAt
                      ? new Date(entry.modifiedAt).toLocaleDateString()
                      : "-"}
                  </span>
                  <span className="w-[40px] shrink-0 flex justify-end">
                    {entry.type === "file" && (
                      <ConfirmDeleteButton
                        onConfirm={() => {
                          const fullPath = currentPath
                            ? `${currentPath}/${entry.name}`
                            : entry.name;
                          deleteMutation.mutate(fullPath);
                        }}
                        disabled={deleteMutation.isPending}
                      />
                    )}
                  </span>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </div>

      <Dialog open={showFolderDialog} onOpenChange={setShowFolderDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New Folder</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <Input
              value={folderName}
              onChange={(e) => setFolderName(e.target.value)}
              placeholder="Folder name"
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreateFolder();
              }}
            />
            <Button onClick={handleCreateFolder} disabled={mkdirMutation.isPending}>
              {mkdirMutation.isPending ? "Creating..." : "Create"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
