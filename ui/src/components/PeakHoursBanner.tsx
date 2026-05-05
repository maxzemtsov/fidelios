import { useState } from "react";
import { Clock, X, ChevronDown, ChevronUp, ShieldOff } from "lucide-react";
import type { PeakHoursConfig, Agent } from "@fideliosai/shared";
import { Link } from "@/lib/router";
import { useCompany } from "@/context/CompanyContext";
import { companiesApi } from "@/api/companies";

function currentUtcMinutes(): number {
  const now = new Date();
  return now.getUTCHours() * 60 + now.getUTCMinutes();
}

function parseUtcMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

/** Convert a UTC "HH:MM" time string to the host's local time string (e.g. "15:00"). */
function utcHhmmToLocal(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const now = new Date();
  const d = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), h, m));
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/** Format an ISO timestamp to local HH:MM for display. */
function isoToLocalHhmm(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/** Get host timezone abbreviation, e.g. "CET", "EST". */
function localTzAbbr(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

export function isWithinPeakHours(config: PeakHoursConfig): boolean {
  if (!config.enabled || config.windows.length === 0) return false;
  if (config.bypassUntil && new Date(config.bypassUntil) > new Date()) return false;
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

const BYPASS_HOURS = [1, 2, 3, 4, 5, 6] as const;

interface PeakHoursBannerProps {
  peakHours: PeakHoursConfig | null | undefined;
  agents?: Agent[];
}

export function PeakHoursBanner({ peakHours, agents }: PeakHoursBannerProps) {
  const { selectedCompanyId, reloadCompanies } = useCompany();
  const [dismissed, setDismissed] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [bypassing, setBypassing] = useState(false);

  if (!peakHours || !peakHours.enabled || peakHours.windows.length === 0 || dismissed) return null;

  const bypassActive = !!peakHours.bypassUntil && new Date(peakHours.bypassUntil) > new Date();
  const isActive = !bypassActive && isWithinPeakHours(peakHours);

  const tz = localTzAbbr();
  const windowLabels = peakHours.windows
    .map((w) => `${w.startUtc}–${w.endUtc} UTC (${utcHhmmToLocal(w.startUtc)}–${utcHhmmToLocal(w.endUtc)} ${tz})`)
    .join(", ");

  const affectedAgents = (agents ?? []).filter((a) => a.adapterType === "claude_local");

  async function applyBypass(hours: number) {
    if (!selectedCompanyId || !peakHours || bypassing) return;
    setBypassing(true);
    try {
      const bypassUntil = new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
      await companiesApi.updatePeakHours(selectedCompanyId, {
        peakHours: { ...peakHours, bypassUntil },
      });
      await reloadCompanies();
    } finally {
      setBypassing(false);
    }
  }

  async function cancelBypass() {
    if (!selectedCompanyId || !peakHours || bypassing) return;
    setBypassing(true);
    try {
      await companiesApi.updatePeakHours(selectedCompanyId, {
        peakHours: { ...peakHours, bypassUntil: null },
      });
      await reloadCompanies();
    } finally {
      setBypassing(false);
    }
  }

  // Style variants
  const containerClass = bypassActive
    ? "rounded-md border border-green-300 bg-green-50 px-4 py-3 dark:border-green-500/25 dark:bg-green-950/40"
    : isActive
      ? "rounded-md border border-amber-300 bg-amber-50 px-4 py-3 dark:border-amber-500/25 dark:bg-amber-950/60"
      : "rounded-md border border-blue-200 bg-blue-50 px-4 py-3 dark:border-blue-500/25 dark:bg-blue-950/40";

  const iconClass = bypassActive
    ? "h-4 w-4 shrink-0 text-green-600 dark:text-green-400"
    : isActive
      ? "h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400"
      : "h-4 w-4 shrink-0 text-blue-500 dark:text-blue-400";

  const textClass = bypassActive
    ? "text-sm font-medium text-green-900 dark:text-green-100"
    : isActive
      ? "text-sm font-medium text-amber-900 dark:text-amber-100"
      : "text-sm font-medium text-blue-800 dark:text-blue-200";

  const expandClass = bypassActive
    ? "ml-1 inline-flex items-center gap-0.5 font-medium underline underline-offset-2 hover:text-green-700 dark:hover:text-green-200"
    : isActive
      ? "ml-1 inline-flex items-center gap-0.5 font-medium underline underline-offset-2 hover:text-amber-700 dark:hover:text-amber-200"
      : "ml-1 inline-flex items-center gap-0.5 font-medium underline underline-offset-2 hover:text-blue-600 dark:hover:text-blue-300";

  const subtextClass = bypassActive
    ? "ml-1 text-xs font-normal text-green-700 dark:text-green-300"
    : isActive
      ? "ml-1 text-xs font-normal text-amber-700 dark:text-amber-300"
      : "ml-1 text-xs font-normal text-blue-600 dark:text-blue-400";

  const dismissClass = bypassActive
    ? "shrink-0 text-green-600 hover:text-green-900 dark:text-green-400 dark:hover:text-green-100"
    : isActive
      ? "shrink-0 text-amber-600 hover:text-amber-900 dark:text-amber-400 dark:hover:text-amber-100"
      : "shrink-0 text-blue-500 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-100";

  const listLinkClass = bypassActive
    ? "text-sm text-green-800 underline underline-offset-2 hover:text-green-600 dark:text-green-200 dark:hover:text-green-100"
    : isActive
      ? "text-sm text-amber-800 underline underline-offset-2 hover:text-amber-600 dark:text-amber-200 dark:hover:text-amber-100"
      : "text-sm text-blue-700 underline underline-offset-2 hover:text-blue-500 dark:text-blue-300 dark:hover:text-blue-100";

  const bypassBtnBase = isActive
    ? "rounded px-2 py-0.5 text-xs font-semibold border border-amber-400 bg-amber-100 text-amber-800 hover:bg-amber-200 dark:border-amber-500/40 dark:bg-amber-900/40 dark:text-amber-200 dark:hover:bg-amber-800/60 disabled:opacity-50"
    : "rounded px-2 py-0.5 text-xs font-semibold border border-blue-300 bg-blue-100 text-blue-800 hover:bg-blue-200 dark:border-blue-500/40 dark:bg-blue-900/40 dark:text-blue-200 dark:hover:bg-blue-800/60 disabled:opacity-50";

  const message = bypassActive
    ? `Peak hours bypassed until ${isoToLocalHhmm(peakHours.bypassUntil!)} — heartbeats running`
    : isActive
      ? `Peak hours active (${windowLabels}) — automated heartbeats paused`
      : `Peak hours scheduled (${windowLabels}) — heartbeats will pause during this window`;

  return (
    <div className={containerClass}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5 flex-1 min-w-0">
          {bypassActive ? (
            <ShieldOff className={iconClass + " mt-0.5"} />
          ) : (
            <Clock className={iconClass + " mt-0.5"} />
          )}
          <div className="flex-1 min-w-0">
            <p className={textClass}>
              {message}
              {!bypassActive && affectedAgents.length > 0 ? (
                <button
                  onClick={() => setExpanded((v) => !v)}
                  className={expandClass}
                >
                  for Agents
                  {expanded ? (
                    <ChevronUp className="h-3.5 w-3.5" />
                  ) : (
                    <ChevronDown className="h-3.5 w-3.5" />
                  )}
                </button>
              ) : !bypassActive ? (
                <span className={subtextClass}>
                  (Claude local adapter)
                </span>
              ) : null}
            </p>

            {/* Bypass controls */}
            {bypassActive ? (
              <div className="mt-1.5 flex items-center gap-2">
                <span className="text-xs text-green-700 dark:text-green-300">Bypass active.</span>
                <button
                  onClick={cancelBypass}
                  disabled={bypassing}
                  className="text-xs font-medium text-green-700 underline underline-offset-2 hover:text-green-900 dark:text-green-400 dark:hover:text-green-200 disabled:opacity-50"
                >
                  Cancel bypass
                </button>
              </div>
            ) : (
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                <span className="text-xs text-gray-500 dark:text-gray-400">Bypass for:</span>
                {BYPASS_HOURS.map((h) => (
                  <button
                    key={h}
                    onClick={() => applyBypass(h)}
                    disabled={bypassing}
                    className={bypassBtnBase}
                  >
                    {h}h
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <button
          onClick={() => setDismissed(true)}
          className={dismissClass + " mt-0.5"}
          aria-label="Dismiss peak hours banner"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {expanded && !bypassActive && affectedAgents.length > 0 && (
        <ul className="mt-2 ml-6 flex flex-col gap-0.5">
          {affectedAgents.map((a) => (
            <li key={a.id}>
              <Link
                to={`/agents/${a.urlKey}`}
                className={listLinkClass}
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
