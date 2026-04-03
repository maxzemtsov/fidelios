import { useState } from "react";
import { Clock, X } from "lucide-react";
import type { PeakHoursConfig } from "@fideliosai/shared";

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
}

export function PeakHoursBanner({ peakHours }: PeakHoursBannerProps) {
  const [dismissed, setDismissed] = useState(false);

  if (!peakHours || !isWithinPeakHours(peakHours) || dismissed) return null;

  const windowLabels = peakHours.windows.map((w) => `${w.startUtc}–${w.endUtc} UTC`).join(", ");

  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 dark:border-amber-500/25 dark:bg-amber-950/60">
      <div className="flex items-center gap-2.5">
        <Clock className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
        <div>
          <p className="text-sm font-medium text-amber-900 dark:text-amber-100">
            Peak hours active — automated heartbeats paused
          </p>
          <p className="text-xs text-amber-700 dark:text-amber-300">
            Configured window{peakHours.windows.length > 1 ? "s" : ""}: {windowLabels}
          </p>
        </div>
      </div>
      <button
        onClick={() => setDismissed(true)}
        className="shrink-0 text-amber-600 hover:text-amber-900 dark:text-amber-400 dark:hover:text-amber-100"
        aria-label="Dismiss peak hours banner"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
