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
