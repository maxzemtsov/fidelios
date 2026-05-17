import { api } from "./client";

export interface IssueFileResult {
  path: string;
  kind: "text" | "binary";
  /** UTF-8 content for text files; empty for binary files. */
  content: string;
  size: number;
  truncated: boolean;
  multipleMatches: boolean;
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
