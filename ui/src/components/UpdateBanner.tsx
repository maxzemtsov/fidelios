import { ArrowUpCircle } from "lucide-react";

interface UpdateBannerProps {
  currentVersion?: string;
  latestVersion?: string | null;
  updateAvailable?: boolean;
  deploymentMode?: string;
}

export function UpdateBanner({
  currentVersion,
  latestVersion,
  updateAvailable,
  deploymentMode,
}: UpdateBannerProps) {
  if (!updateAvailable || !latestVersion) return null;

  const isDocker = deploymentMode === "authenticated";
  const command = isDocker
    ? "docker pull fideliosai/fidelios:latest"
    : "npm install -g fidelios@latest";

  return (
    <div className="border-b border-blue-300/60 bg-blue-50 text-blue-950 dark:border-blue-500/25 dark:bg-blue-500/10 dark:text-blue-100">
      <div className="flex flex-col gap-3 px-3 py-2.5 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.18em]">
            <ArrowUpCircle className="h-3.5 w-3.5 shrink-0" />
            <span>Update Available</span>
          </div>
          <p className="mt-1 text-sm">
            A newer version of FideliOS is available:{" "}
            <span className="font-medium">
              v{currentVersion ?? "?"} &rarr; v{latestVersion}
            </span>
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2 text-xs font-medium">
          <div className="inline-flex items-center gap-2 rounded-full bg-blue-900/10 px-3 py-1.5 dark:bg-blue-100/10">
            <code className="text-[11px]">{command}</code>
          </div>
        </div>
      </div>
    </div>
  );
}
