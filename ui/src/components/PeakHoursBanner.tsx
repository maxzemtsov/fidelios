import { useState } from "react";
import { Clock, X, ChevronDown, ChevronUp } from "lucide-react";
import type { PeakHoursConfig, Agent } from "@fideliosai/shared";
import { Link } from "@/lib/router";

function currentUtcMinutes(): number {
  const now = new Date();
  return now.getUTCHours() * 60 + now.getUTCMinutes();
}

function parseUtcMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

export function isWithinPeakHours(config: PeakHoursConfig): boolean {
  if (!config.enabled || config.windows.length === 0) return false;
  const nowMin = currentUtcMinutes();
  return config.windows.some(({ startUtc, endUtc }) => {
    const start = parseUtcMinutes(startUtc);
    const end = parseUtcMinutes(endUtc);
    if (start <= end) {
      return nowMin >= start && nowMin < end;
    }
    // overnight window, e.g. 22:00–06:00
    return nowMin >= start || nowMin < end;
  });
}

interface PeakHoursBannerProps {
  peakHours: PeakHoursConfig | null | undefined;
  agents?: Agent[];
}

export function PeakHoursBanner({ peakHours, agents }: PeakHoursBannerProps) {
  const [dismissed, setDismissed] = useState(false);
  const [expanded, setExpanded] = useState(false);

  if (!peakHours || !isWithinPeakHours(peakHours) || dismissed) return null;

  const windowLabels = peakHours.windows.map((w) => `${w.startUtc}–${w.endUtc} UTC`).join(", ");
  const affectedAgents = (agents ?? []).filter((a) => a.adapterType === "claude_local");

  return (
    <div className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 dark:border-amber-500/25 dark:bg-amber-950/60">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <Clock className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <p className="text-sm font-medium text-amber-900 dark:text-amber-100">
            Peak hours active ({windowLabels}) — automated heartbeats paused
            {affectedAgents.length > 0 ? (
              <button
                onClick={() => setExpanded((v) => !v)}
                className="ml-1 inline-flex items-center gap-0.5 font-medium underline underline-offset-2 hover:text-amber-700 dark:hover:text-amber-200"
              >
                for Agents
                {expanded ? (
                  <ChevronUp className="h-3.5 w-3.5" />
                ) : (
                  <ChevronDown className="h-3.5 w-3.5" />
                )}
              </button>
            ) : (
              <span className="ml-1 text-xs font-normal text-amber-700 dark:text-amber-300">
                (Claude local adapter)
              </span>
            )}
          </p>
        </div>
        <button
          onClick={() => setDismissed(true)}
          className="shrink-0 text-amber-600 hover:text-amber-900 dark:text-amber-400 dark:hover:text-amber-100"
          aria-label="Dismiss peak hours banner"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      {expanded && affectedAgents.length > 0 && (
        <ul className="mt-2 ml-6 flex flex-col gap-0.5">
          {affectedAgents.map((a) => (
            <li key={a.id}>
              <Link
                to={`/agents/${a.urlKey}`}
                className="text-sm text-amber-800 underline underline-offset-2 hover:text-amber-600 dark:text-amber-200 dark:hover:text-amber-100"
              >
                {a.name}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
