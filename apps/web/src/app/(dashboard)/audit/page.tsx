"use client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { Spinner } from "@/components/ui/spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAuditEntry } from "@/hooks/useSocket";
import { api } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";
import { ClipboardListIcon } from "lucide-react";
import { useState } from "react";
import { ActorDialog } from "@/components/audit-actor-dialog";
import { DetailsDialog } from "@/components/audit-details-dialog";

interface AuditEntry {
  id: string;
  action: string;
  actorId: string;
  actorName?: string | null;
  actorEmail?: string | null;
  targetType: string;
  targetId: string;
  detailsJson: string | null;
  createdAt: string;
}

interface AuditResponse {
  entries: AuditEntry[];
  total: number;
}

const PAGE_SIZE = 20;

function actionBadge(action: string) {
  if (action === "sign_in") return "default";
  if (action === "sign_out") return "secondary";
  if (action.startsWith("instance_")) return "secondary";
  if (action.startsWith("profile_")) return "outline";
  if (action.includes("delete")) return "destructive";
  return "secondary";
}

export default function AuditPage() {
  const [offset, setOffset] = useState(0);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["audit-log", offset],
    queryFn: async () => {
      const res = await api.get<AuditResponse>("/audit-log", {
        params: { limit: PAGE_SIZE, offset },
      });
      return res.data;
    },
  });

  const { entries: liveEntries } = useAuditEntry();
  const entries = data?.entries ?? [];
  const seenIds = new Set<string | number>();
  const allEntries = ([...liveEntries, ...entries] as AuditEntry[]).filter((entry) => {
    if (seenIds.has(entry.id)) return false;
    seenIds.add(entry.id);
    return true;
  });
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;

  if (error) {
    return (
      <div className="flex flex-col items-center gap-4 py-16">
        <p className="text-destructive">Failed to load audit log</p>
        <Button variant="outline" onClick={() => refetch()}>Retry</Button>
      </div>
    );
  }

  if (isLoading)
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between mb-6">
          <div className="space-y-1">
            <div className="h-7 w-24 bg-muted rounded animate-pulse" />
            <div className="h-4 w-40 bg-muted rounded animate-pulse" />
          </div>
        </div>
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (<div key={i} className="h-10 w-full bg-muted rounded animate-pulse" />))}
        </div>
      </div>
    );

  return (
    <div className="px-4 lg:px-6">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Audit Log</h1>
        <p className="text-sm text-muted-foreground">Track system activity and changes</p>
      </div>

      {allEntries.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <ClipboardListIcon className="size-12 mb-4 opacity-50" />
          <p className="text-lg">No audit entries yet</p>
          <p className="text-sm">Activity will appear here as actions are performed</p>
        </div>
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Action</TableHead>
                <TableHead>Actor</TableHead>
                <TableHead>Target</TableHead>
                <TableHead>Details</TableHead>
                <TableHead>Timestamp</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {allEntries.map((entry: AuditEntry) => (
                <TableRow key={entry.id}>
                  <TableCell>
                    <Badge variant={actionBadge(entry.action) as any}>{entry.action}</Badge>
                  </TableCell>
                  <TableCell>
                    <ActorDialog name={entry.actorName} email={entry.actorEmail} actorId={Number(entry.actorId)} />
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {entry.targetType}/{entry.targetId}
                  </TableCell>
                  <TableCell>
                    <DetailsDialog detailsJson={entry.detailsJson} />
                  </TableCell>
                  <TableCell className="text-muted-foreground whitespace-nowrap">
                    {new Date(entry.createdAt).toLocaleString()}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {totalPages > 1 && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-2 mt-4 text-sm text-muted-foreground">
              <span>
                Page {currentPage} of {totalPages}
              </span>
              <Pagination>
                <PaginationContent>
                  <PaginationItem>
                    <PaginationPrevious
                      onClick={(e) => {
                        e.preventDefault();
                        setOffset(Math.max(0, offset - PAGE_SIZE));
                      }}
                      className={offset === 0 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                    />
                  </PaginationItem>
                  <PaginationItem>
                    <PaginationNext
                      onClick={(e) => {
                        e.preventDefault();
                        if (offset + PAGE_SIZE < total) {
                          setOffset(offset + PAGE_SIZE);
                        }
                      }}
                      className={
                        offset + PAGE_SIZE >= total
                          ? "pointer-events-none opacity-50"
                          : "cursor-pointer"
                      }
                    />
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            </div>
          )}
        </>
      )}
    </div>
  );
}
