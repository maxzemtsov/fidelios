import { api } from "./client";

export interface IssueFileResult {
  path: string;
  kind: "text" | "binary" | "missing";
  /** UTF-8 content for text files; empty for binary or missing files. */
  content: string;
  size: number;
  truncated: boolean;
  multipleMatches: boolean;
  /** For `missing`: the workspace directory that was searched. */
  workspaceDir?: string;
  /** For `missing`: the project's git remote URL, when known. */
  repoUrl?: string | null;
  /** For `missing`: a deep link to the file on the git host, when derivable. */
  repoFileUrl?: string | null;
}

/** Read a file from the on-disk workspace of an issue's project. */
export function readIssueFile(companyId: string, issueId: string, filePath: string) {
  return api.get<IssueFileResult>(
    `/companies/${encodeURIComponent(companyId)}/issues/${encodeURIComponent(issueId)}/files` +
      `?path=${encodeURIComponent(filePath)}`,
  );
}

/** Same-origin URL that streams the raw file as a browser download. */
export function issueFileDownloadUrl(companyId: string, issueId: string, filePath: string): string {
  return (
    `/api/companies/${encodeURIComponent(companyId)}/issues/${encodeURIComponent(issueId)}/files` +
    `?path=${encodeURIComponent(filePath)}&download=1`
  );
}

/** Ask the host to reveal the file in its file manager (macOS Finder). Local mode only. */
export function revealIssueFileOnHost(companyId: string, issueId: string, filePath: string) {
  return api.post<{ revealed: boolean; path: string }>(
    `/companies/${encodeURIComponent(companyId)}/issues/${encodeURIComponent(issueId)}/files/reveal`,
    { path: filePath },
  );
}
