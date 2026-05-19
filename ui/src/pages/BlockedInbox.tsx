import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Ban } from "lucide-react";
import type { Issue, IssueBlockedReason } from "@fideliosai/shared";
import { issuesApi } from "../api/issues";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { queryKeys } from "../lib/queryKeys";
import { issueUrl } from "../lib/utils";
import { StatusIcon } from "../components/StatusIcon";
import { EntityRow } from "../components/EntityRow";
import { EmptyState } from "../components/EmptyState";
import { PageSkeleton } from "../components/PageSkeleton";
import { Badge } from "@/components/ui/badge";

type ReasonSection = {
  reason: IssueBlockedReason;
  label: string;
  hint: string;
  badgeVariant: "secondary" | "destructive" | "outline";
};

// Ordered actionable-first: stale blockers can be cleared now, manually blocked
// needs a decision, dependency-blocked is legitimately waiting.
const REASON_SECTIONS: ReasonSection[] = [
  {
    reason: "stale_dependency",
    label: "Ready to unblock",
    hint: "Every tracked blocker is resolved — these can move back to todo.",
    badgeVariant: "outline",
  },
  {
    reason: "manually_blocked",
    label: "Manually blocked",
    hint: "Marked blocked with no tracked dependency — needs a human decision.",
    badgeVariant: "destructive",
  },
  {
    reason: "blocked_by_dependency",
    label: "Waiting on dependencies",
    hint: "Cannot proceed until a blocker issue is done.",
    badgeVariant: "secondary",
  },
];

function blockedSubtitle(issue: Issue): string | undefined {
  const blockedBy = issue.blockedInbox?.blockedBy ?? [];
  if (blockedBy.length === 0) return undefined;
  const shown = blockedBy.slice(0, 5).map((blocker) => blocker.identifier ?? blocker.title);
  const remaining = blockedBy.length - shown.length;
  return `Blocked by ${shown.join(", ")}${remaining > 0 ? ` +${remaining} more` : ""}`;
}

export function BlockedInbox() {
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();

  useEffect(() => {
    setBreadcrumbs([{ label: "Blocked" }]);
  }, [setBreadcrumbs]);

  const { data: issues, isLoading, error } = useQuery({
    queryKey: queryKeys.issues.listBlocked(selectedCompanyId!),
    queryFn: () => issuesApi.list(selectedCompanyId!, { attention: "blocked" }),
    enabled: !!selectedCompanyId,
  });

  const grouped = useMemo(() => {
    const groups = new Map<IssueBlockedReason, Issue[]>();
    for (const issue of issues ?? []) {
      const reason = issue.blockedInbox?.reason;
      if (!reason) continue;
      const list = groups.get(reason) ?? [];
      list.push(issue);
      groups.set(reason, list);
    }
    return groups;
  }, [issues]);

  if (!selectedCompanyId) {
    return <EmptyState icon={Ban} message="Select a company to view blocked work." />;
  }

  if (isLoading) {
    return <PageSkeleton variant="list" />;
  }

  const totalBlocked = issues?.length ?? 0;

  return (
    <div className="space-y-6">
      {error && <p className="text-sm text-destructive">{error.message}</p>}

      {totalBlocked === 0 && !error && (
        <EmptyState icon={Ban} message="Nothing is blocked — every issue can move." />
      )}

      {REASON_SECTIONS.map((section) => {
        const sectionIssues = grouped.get(section.reason) ?? [];
        if (sectionIssues.length === 0) return null;
        return (
          <section key={section.reason} className="space-y-2">
            <div>
              <h2 className="text-sm font-medium flex items-center gap-2">
                {section.label}
                <Badge variant={section.badgeVariant}>{sectionIssues.length}</Badge>
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">{section.hint}</p>
            </div>
            <div className="border border-border">
              {sectionIssues.map((issue) => (
                <EntityRow
                  key={issue.id}
                  identifier={issue.identifier ?? issue.id.slice(0, 8)}
                  title={issue.title}
                  subtitle={blockedSubtitle(issue)}
                  to={issueUrl(issue)}
                  leading={<StatusIcon status={issue.status} />}
                />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
