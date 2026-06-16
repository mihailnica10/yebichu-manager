"use client";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useProfileEvents } from "@/hooks/useSocket";
import { api } from "@/lib/api";
import { formatBytes } from "@/lib/format";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  FileIcon,
  FileJsonIcon,
  FolderIcon,
  PlusIcon,
  Trash2Icon,
  UploadIcon,
  UserIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

interface Profile {
  id: string;
  name: string;
  type: string;
  metadataJson: string | null;
  createdAt: string;
}

interface TemplateFile {
  name: string;
  size: number;
}

interface SymbolSetFile {
  name: string;
  size: number;
}

export default function ProfilesPage() {
  return (
    <div className="px-4 lg:px-6">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Profiles</h1>
        <p className="text-sm text-muted-foreground">Manage trading profiles and files</p>
      </div>
      <Tabs defaultValue="db-profiles">
        <TabsList>
          <TabsTrigger value="db-profiles">DB Profiles</TabsTrigger>
          <TabsTrigger value="chart-sets">Chart Sets</TabsTrigger>
          <TabsTrigger value="templates">Templates</TabsTrigger>
          <TabsTrigger value="symbol-sets">Symbol Sets</TabsTrigger>
        </TabsList>
        <TabsContent value="db-profiles" className="mt-4">
          <DbProfilesTab />
        </TabsContent>
        <TabsContent value="chart-sets" className="mt-4">
          <ChartSetsTab />
        </TabsContent>
        <TabsContent value="templates" className="mt-4">
          <TemplatesTab />
        </TabsContent>
        <TabsContent value="symbol-sets" className="mt-4">
          <SymbolSetsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function DbProfilesTab() {
  const qc = useQueryClient();
  const profileEvent = useProfileEvents();
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState("");

  useEffect(() => {
    if (profileEvent) {
      qc.invalidateQueries({ queryKey: ["profiles"] });
    }
  }, [profileEvent, qc]);

  const {
    data: profiles,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["profiles"],
    queryFn: async () => {
      const res = await api.get<{ profiles: Profile[] }>("/profiles");
      return res.data.profiles;
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: { name: string; type: string }) => {
      await api.post("/profiles", data);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["profiles"] });
      setCreateOpen(false);
      setNewName("");
      setNewType("");
      toast.success("Profile created");
    },
    onError: () => {
      toast.error("Failed to create profile");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/profiles/${id}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["profiles"] });
      setDeleteId(null);
      toast.success("Profile deleted");
    },
    onError: () => {
      toast.error("Failed to delete profile");
    },
  });

  if (error) {
    return (
      <div className="flex justify-center p-8">
        <div className="text-center text-destructive">
          <p className="text-lg font-medium">Failed to load profiles</p>
          <p className="text-sm text-muted-foreground mt-1">{(error as Error).message}</p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex justify-center p-8">
        <Spinner />
      </div>
    );
  }

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <div />
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button>
              <PlusIcon /> Create Profile
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Profile</DialogTitle>
            </DialogHeader>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                createMutation.mutate({ name: newName, type: newType });
              }}
              className="flex flex-col gap-4"
            >
              <div>
                <Label htmlFor="name">Profile Name</Label>
                <Input
                  id="name"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="my-profile"
                  required
                />
              </div>
              <div>
                <Label htmlFor="type">Type</Label>
                <Input
                  id="type"
                  value={newType}
                  onChange={(e) => setNewType(e.target.value)}
                  placeholder="standard"
                  required
                />
              </div>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? "Creating..." : "Create"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {profiles?.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <UserIcon className="size-12 mb-4 opacity-50" />
          <p className="text-lg">No profiles yet</p>
          <p className="text-sm">Create your first profile to get started</p>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Metadata</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="w-16" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {profiles?.map((profile) => (
              <TableRow key={profile.id}>
                <TableCell className="font-medium">{profile.name}</TableCell>
                <TableCell>
                  <Badge variant="secondary">{profile.type}</Badge>
                </TableCell>
                <TableCell className="text-muted-foreground max-w-48 truncate">
                  {profile.metadataJson ?? "—"}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {new Date(profile.createdAt).toLocaleDateString()}
                </TableCell>
                <TableCell>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-destructive"
                    onClick={() => setDeleteId(profile.id)}
                  >
                    <Trash2Icon className="size-3" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Profile</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this profile? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteId && deleteMutation.mutate(deleteId)}
              className="bg-destructive text-destructive-foreground"
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function ChartSetsTab() {
  const qc = useQueryClient();
  const [uploadOpen, setUploadOpen] = useState(false);
  const [deleteName, setDeleteName] = useState<string | null>(null);
  const [uploadFile, setUploadFile] = useState<File | null>(null);

  const {
    data: charts,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["profiles", "charts"],
    queryFn: async () => {
      const res = await api.get<{
        chartSets: { name: string; files: { name: string; size: number }[] }[];
      }>("/profiles/charts");
      return (res.data.chartSets ?? []).map((s: any) => ({
        name: s.name,
        fileCount: (s.files ?? []).length,
        totalSize: (s.files ?? []).reduce((sum: number, f: any) => sum + (f.size ?? 0), 0),
      }));
    },
  });

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData();
      form.append("file", file);
      await api.post("/profiles/charts", form);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["profiles", "charts"] });
      setUploadOpen(false);
      setUploadFile(null);
      toast.success("Chart set uploaded");
    },
    onError: () => toast.error("Failed to upload chart set"),
  });

  const deleteMutation = useMutation({
    mutationFn: async (name: string) => {
      await api.delete(`/profiles/charts/${name}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["profiles", "charts"] });
      setDeleteName(null);
      toast.success("Chart set deleted");
    },
    onError: () => toast.error("Failed to delete chart set"),
  });

  if (error) {
    return (
      <div className="flex justify-center p-8">
        <div className="text-center text-destructive">
          <p className="text-lg font-medium">Failed to load chart sets</p>
          <p className="text-sm text-muted-foreground mt-1">{(error as Error).message}</p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex justify-center p-8">
        <Spinner />
      </div>
    );
  }

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <div />
        <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
          <DialogTrigger asChild>
            <Button>
              <UploadIcon /> Upload Chart Set
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Upload Chart Set</DialogTitle>
            </DialogHeader>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (uploadFile) uploadMutation.mutate(uploadFile);
              }}
              className="flex flex-col gap-4"
            >
              <div>
                <Label htmlFor="chart-file">Chart Set File</Label>
                <Input
                  id="chart-file"
                  type="file"
                  accept=".zip,.set"
                  onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)}
                  required
                />
              </div>
              <Button type="submit" disabled={!uploadFile || uploadMutation.isPending}>
                {uploadMutation.isPending ? "Uploading..." : "Upload"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {charts?.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <FolderIcon className="size-12 mb-4 opacity-50" />
          <p className="text-lg">No chart sets yet</p>
          <p className="text-sm">Upload a chart set to get started</p>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Files</TableHead>
              <TableHead>Total Size</TableHead>
              <TableHead className="w-16" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {charts?.map((set) => (
              <TableRow key={set.name}>
                <TableCell className="font-medium">{set.name}</TableCell>
                <TableCell>{set.fileCount} files</TableCell>
                <TableCell className="text-muted-foreground">
                  {formatBytes(set.totalSize)}
                </TableCell>
                <TableCell>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-destructive"
                    onClick={() => setDeleteName(set.name)}
                  >
                    <Trash2Icon className="size-3" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <AlertDialog open={!!deleteName} onOpenChange={(o) => !o && setDeleteName(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Chart Set</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {deleteName}? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteName && deleteMutation.mutate(deleteName)}
              className="bg-destructive text-destructive-foreground"
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function TemplatesTab() {
  const qc = useQueryClient();
  const [uploadOpen, setUploadOpen] = useState(false);
  const [deleteName, setDeleteName] = useState<string | null>(null);
  const [uploadFile, setUploadFile] = useState<File | null>(null);

  const {
    data: templates,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["profiles", "templates"],
    queryFn: async () => {
      const res = await api.get<{ templates: TemplateFile[] }>("/profiles/templates");
      return res.data.templates;
    },
  });

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData();
      form.append("file", file);
      await api.post("/profiles/templates", form);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["profiles", "templates"] });
      setUploadOpen(false);
      setUploadFile(null);
      toast.success("Template uploaded");
    },
    onError: () => toast.error("Failed to upload template"),
  });

  const deleteMutation = useMutation({
    mutationFn: async (name: string) => {
      await api.delete(`/profiles/templates/${name}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["profiles", "templates"] });
      setDeleteName(null);
      toast.success("Template deleted");
    },
    onError: () => toast.error("Failed to delete template"),
  });

  if (error) {
    return (
      <div className="flex justify-center p-8">
        <div className="text-center text-destructive">
          <p className="text-lg font-medium">Failed to load templates</p>
          <p className="text-sm text-muted-foreground mt-1">{(error as Error).message}</p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex justify-center p-8">
        <Spinner />
      </div>
    );
  }

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <div />
        <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
          <DialogTrigger asChild>
            <Button>
              <UploadIcon /> Upload Template
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Upload Template</DialogTitle>
            </DialogHeader>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (uploadFile) uploadMutation.mutate(uploadFile);
              }}
              className="flex flex-col gap-4"
            >
              <div>
                <Label htmlFor="template-file">Template File</Label>
                <Input
                  id="template-file"
                  type="file"
                  accept=".tpl,.json"
                  onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)}
                  required
                />
              </div>
              <Button type="submit" disabled={!uploadFile || uploadMutation.isPending}>
                {uploadMutation.isPending ? "Uploading..." : "Upload"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {templates?.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <FileIcon className="size-12 mb-4 opacity-50" />
          <p className="text-lg">No templates yet</p>
          <p className="text-sm">Upload a template to get started</p>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Size</TableHead>
              <TableHead className="w-16" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {templates?.map((file) => (
              <TableRow key={file.name}>
                <TableCell className="font-medium">{file.name}</TableCell>
                <TableCell className="text-muted-foreground">{formatBytes(file.size)}</TableCell>
                <TableCell>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-destructive"
                    onClick={() => setDeleteName(file.name)}
                  >
                    <Trash2Icon className="size-3" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <AlertDialog open={!!deleteName} onOpenChange={(o) => !o && setDeleteName(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Template</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {deleteName}? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteName && deleteMutation.mutate(deleteName)}
              className="bg-destructive text-destructive-foreground"
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function SymbolSetsTab() {
  const qc = useQueryClient();
  const [uploadOpen, setUploadOpen] = useState(false);
  const [deleteName, setDeleteName] = useState<string | null>(null);
  const [uploadFile, setUploadFile] = useState<File | null>(null);

  const {
    data: files,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["profiles", "symbol-sets"],
    queryFn: async () => {
      const res = await api.get<{ symbolSets: SymbolSetFile[] }>("/profiles/symbol-sets");
      return res.data.symbolSets;
    },
  });

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData();
      form.append("file", file);
      await api.post("/profiles/symbol-sets", form);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["profiles", "symbol-sets"] });
      setUploadOpen(false);
      setUploadFile(null);
      toast.success("Symbol set uploaded");
    },
    onError: () => toast.error("Failed to upload symbol set"),
  });

  const deleteMutation = useMutation({
    mutationFn: async (name: string) => {
      await api.delete(`/profiles/symbol-sets/${name}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["profiles", "symbol-sets"] });
      setDeleteName(null);
      toast.success("Symbol set deleted");
    },
    onError: () => toast.error("Failed to delete symbol set"),
  });

  if (error) {
    return (
      <div className="flex justify-center p-8">
        <div className="text-center text-destructive">
          <p className="text-lg font-medium">Failed to load symbol sets</p>
          <p className="text-sm text-muted-foreground mt-1">{(error as Error).message}</p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex justify-center p-8">
        <Spinner />
      </div>
    );
  }

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <div />
        <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
          <DialogTrigger asChild>
            <Button>
              <UploadIcon /> Upload Symbol Set
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Upload Symbol Set</DialogTitle>
            </DialogHeader>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (uploadFile) uploadMutation.mutate(uploadFile);
              }}
              className="flex flex-col gap-4"
            >
              <div>
                <Label htmlFor="symbol-file">Symbol Set File</Label>
                <Input
                  id="symbol-file"
                  type="file"
                  accept=".sym,.json,.txt"
                  onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)}
                  required
                />
              </div>
              <Button type="submit" disabled={!uploadFile || uploadMutation.isPending}>
                {uploadMutation.isPending ? "Uploading..." : "Upload"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {files?.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <FileJsonIcon className="size-12 mb-4 opacity-50" />
          <p className="text-lg">No symbol sets yet</p>
          <p className="text-sm">Upload a symbol set to get started</p>
        </div>
      ) : (
        <div className="space-y-2">
          {files?.map((file) => (
            <div key={file.name} className="rounded-lg border p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <FileJsonIcon className="size-4 text-muted-foreground" />
                  <span className="font-medium">{file.name}</span>
                  <span className="text-xs text-muted-foreground">{formatBytes(file.size)}</span>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-destructive"
                  onClick={() => setDeleteName(file.name)}
                >
                  <Trash2Icon className="size-3" />
                </Button>
              </div>
              {file.size > 0 && (
                <p className="mt-1 text-xs text-muted-foreground">{file.size} bytes</p>
              )}
            </div>
          ))}
        </div>
      )}

      <AlertDialog open={!!deleteName} onOpenChange={(o) => !o && setDeleteName(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Symbol Set</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {deleteName}? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteName && deleteMutation.mutate(deleteName)}
              className="bg-destructive text-destructive-foreground"
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
