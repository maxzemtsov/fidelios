import { useQuery } from "@tanstack/react-query";
import { Download, ExternalLink, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ApiError } from "../api/client";
import { issueFileDownloadUrl, readIssueFile } from "../api/issueFiles";
import { queryKeys } from "../lib/queryKeys";
import { MarkdownBody } from "./MarkdownBody";

interface FileViewerDialogProps {
  companyId: string;
  issueId: string;
  path: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const NOT_FOUND_MESSAGE = "File not found in this issue's workspace";

function isMarkdownPath(filePath: string) {
  const lower = filePath.toLowerCase();
  return lower.endsWith(".md") || lower.endsWith(".markdown");
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function FileViewerDialog({
  companyId,
  issueId,
  path,
  open,
  onOpenChange,
}: FileViewerDialogProps) {
  const fileQuery = useQuery({
    queryKey: queryKeys.issues.file(companyId, issueId, path),
    queryFn: () => readIssueFile(companyId, issueId, path),
    enabled: open,
  });

  const file = fileQuery.data;
  const errorMessage =
    fileQuery.error instanceof ApiError && fileQuery.error.status === 404
      ? NOT_FOUND_MESSAGE
      : fileQuery.error instanceof Error
        ? fileQuery.error.message
        : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[80vh] w-full flex-col sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="break-all font-mono text-sm">
            {file ? file.path : path}
          </DialogTitle>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {fileQuery.isLoading ? (
            <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading file...
            </div>
          ) : errorMessage ? (
            <p className="py-8 text-sm text-muted-foreground">{errorMessage}</p>
          ) : file ? (
            file.kind === "missing" ? (
              <div className="flex flex-col items-start gap-3 py-6">
                <p className="text-sm text-muted-foreground">
                  Couldn't find <span className="font-mono text-foreground">{file.path}</span> in
                  this issue's workspace — it may be on a branch that isn't checked out, or in a
                  different workspace.
                </p>
                {file.workspaceDir ? (
                  <p className="break-all font-mono text-xs text-muted-foreground">
                    Searched: {file.workspaceDir}
                  </p>
                ) : null}
                {file.repoUrl ? (
                  <Button asChild size="sm" variant="outline">
                    <a href={file.repoUrl} target="_blank" rel="noreferrer">
                      <ExternalLink className="h-4 w-4" />
                      Open repository
                    </a>
                  </Button>
                ) : null}
              </div>
            ) : file.kind === "binary" ? (
              <div className="flex flex-col items-start gap-3 py-6">
                <p className="text-sm text-muted-foreground">
                  This file can't be previewed inline. Download it to open it on your machine.
                </p>
                <p className="font-mono text-xs text-muted-foreground">
                  {formatFileSize(file.size)}
                </p>
                <Button asChild size="sm">
                  <a href={issueFileDownloadUrl(companyId, issueId, file.path)} download>
                    <Download className="h-4 w-4" />
                    Download
                  </a>
                </Button>
              </div>
            ) : isMarkdownPath(file.path) ? (
              <MarkdownBody className="text-sm">{file.content}</MarkdownBody>
            ) : (
              <pre className="overflow-x-auto whitespace-pre-wrap break-words rounded-md bg-muted p-3 font-mono text-xs text-foreground">
                <code>{file.content}</code>
              </pre>
            )
          ) : null}
        </div>

        {file && (file.truncated || file.multipleMatches) ? (
          <div className="space-y-1 border-t border-border pt-3 text-xs text-muted-foreground">
            {file.truncated ? <p>Showing the first 512 KB of this file.</p> : null}
            {file.multipleMatches ? <p>Multiple files matched — showing the first.</p> : null}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
