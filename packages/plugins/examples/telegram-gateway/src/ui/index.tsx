import { useState, type CSSProperties } from "react";
import {
  useHostContext,
  usePluginAction,
  usePluginData,
  usePluginToast,
  type PluginSettingsPageProps,
} from "@fideliosai/plugin-sdk/ui";

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const containerStyle: CSSProperties = {
  padding: "20px",
  maxWidth: "620px",
  display: "grid",
  gap: "16px",
};

const cardStyle: CSSProperties = {
  border: "1px solid var(--border)",
  borderRadius: "12px",
  padding: "16px",
  background: "var(--card, transparent)",
};

const headingStyle: CSSProperties = {
  fontSize: "14px",
  fontWeight: 600,
  marginBottom: "12px",
};

const rowStyle: CSSProperties = {
  display: "flex",
  gap: "8px",
  alignItems: "center",
  flexWrap: "wrap",
};

const buttonStyle: CSSProperties = {
  appearance: "none",
  border: "1px solid var(--border)",
  borderRadius: "999px",
  background: "transparent",
  color: "inherit",
  padding: "6px 16px",
  fontSize: "12px",
  cursor: "pointer",
};

const primaryButtonStyle: CSSProperties = {
  ...buttonStyle,
  background: "var(--foreground)",
  color: "var(--background)",
  borderColor: "var(--foreground)",
};

const labelStyle: CSSProperties = {
  fontSize: "11px",
  opacity: 0.6,
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  marginBottom: "4px",
};

const valueStyle: CSSProperties = {
  fontSize: "13px",
  fontFamily: "monospace",
  wordBreak: "break-all",
};

const mutedStyle: CSSProperties = {
  fontSize: "12px",
  opacity: 0.6,
  marginBottom: "12px",
  lineHeight: 1.5,
};

const topicRowStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  fontSize: "13px",
  padding: "4px 0",
};

function badge(color: string): CSSProperties {
  return {
    display: "inline-block",
    padding: "2px 8px",
    borderRadius: "999px",
    fontSize: "11px",
    background: `color-mix(in srgb, ${color} 18%, transparent)`,
    border: `1px solid color-mix(in srgb, ${color} 60%, var(--border))`,
    color: color,
  };
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TelegramConfig {
  /**
   * Boolean flag reflecting whether a bot token is saved server-side. The
   * actual token value is never sent to the UI — the worker redacts it in
   * the `plugin-status` handler to avoid leaking secrets into the browser.
   */
  hasBotToken?: boolean;
  chatId?: string;
  defaultTopicId?: number;
  topicRouting?: string;
}

interface StatusData {
  config: TelegramConfig;
  topics: Record<string, number> | null;
}

interface CreateTopicsResult {
  ok: boolean;
  topics?: Record<string, number>;
  error?: string;
  newChatId?: string;
}

interface TestConnectionResult {
  ok: boolean;
  botName?: string;
  chatTitle?: string;
  forumEnabled?: boolean;
  error?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TOPIC_KEYS = ["tasks", "approvals", "hiring", "system"] as const;

const TOPIC_LABELS: Record<string, string> = {
  tasks: "Tasks",
  approvals: "Approvals",
  hiring: "Hiring",
  system: "System",
};

// ---------------------------------------------------------------------------
// Settings Page
// ---------------------------------------------------------------------------

export function TelegramGatewaySettingsPage({ context: _context }: PluginSettingsPageProps) {
  const { companyId } = useHostContext();
  const toast = usePluginToast();

  const createTopics = usePluginAction("create-topics");
  const testConnection = usePluginAction("test-connection");

  const { data, loading, error, refresh } = usePluginData<StatusData>("plugin-status", {
    companyId: companyId ?? "",
  });

  const [creating, setCreating] = useState(false);
  const [testing, setTesting] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);

  async function handleCreateTopics() {
    if (!companyId) {
      toast({ title: "No company context", tone: "error" });
      return;
    }
    setCreating(true);
    setLastError(null);
    try {
      const result = (await createTopics({ companyId })) as CreateTopicsResult;
      if (result.ok) {
        const body = result.newChatId
          ? `Routing is now active. Chat ID updated to supergroup ID: ${result.newChatId}`
          : "Routing is now active.";
        toast({ title: "Forum topics created", body, tone: "success" });
        refresh();
      } else {
        const msg = result.error ?? "Failed to create topics";
        setLastError(msg);
        toast({ title: msg, tone: "error" });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setLastError(msg);
      toast({ title: `Error: ${msg}`, tone: "error" });
    } finally {
      setCreating(false);
    }
  }

  async function handleTestConnection() {
    if (!companyId) {
      toast({ title: "No company context", tone: "error" });
      return;
    }
    setTesting(true);
    try {
      const result = (await testConnection({ companyId })) as TestConnectionResult;
      if (result.ok) {
        const forumNote = result.forumEnabled === false ? " (⚠ Forum/Topics not enabled on this group)" : "";
        toast({
          title: "Connection OK",
          body: `Bot: ${result.botName ?? "unknown"} · Chat: ${result.chatTitle ?? "unknown"}${forumNote}`,
          tone: result.forumEnabled === false ? "warn" : "success",
          ttlMs: 6000,
        });
      } else {
        toast({ title: result.error ?? "Connection test failed", tone: "error" });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast({ title: `Error: ${msg}`, tone: "error" });
    } finally {
      setTesting(false);
    }
  }

  const config = data?.config ?? null;
  const topics = data?.topics ?? null;
  const hasConfig = Boolean(config?.hasBotToken && config?.chatId);

  return (
    <div style={containerStyle}>
      {/* Connection */}
      <div style={cardStyle}>
        <div style={headingStyle}>Connection</div>
        <div style={rowStyle}>
          {loading ? (
            <span style={{ opacity: 0.5, fontSize: "13px" }}>Loading…</span>
          ) : error ? (
            <span style={badge("#ef4444")}>Error loading status</span>
          ) : hasConfig ? (
            <span style={badge("#22c55e")}>Configured</span>
          ) : (
            <span style={badge("#f97316")}>Not configured — fill in Telegram Bot Token and Chat ID in the form below, then click Save Configuration</span>
          )}
          <button
            style={buttonStyle}
            onClick={handleTestConnection}
            disabled={testing || !hasConfig || loading}
          >
            {testing ? "Testing…" : "Test Connection"}
          </button>
        </div>

        {config && (
          <div style={{ marginTop: "12px", display: "grid", gap: "8px" }}>
            {config.chatId && (
              <div>
                <div style={labelStyle}>Chat ID</div>
                <div style={valueStyle}>{config.chatId}</div>
              </div>
            )}
            <div>
              <div style={labelStyle}>Default Topic ID (fallback)</div>
              <div style={valueStyle}>{config.defaultTopicId ?? 1}</div>
            </div>
          </div>
        )}
      </div>

      {/* Forum Topics */}
      <div style={cardStyle}>
        <div style={{ ...headingStyle, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span>Forum Topics</span>
          <button
            style={primaryButtonStyle}
            onClick={handleCreateTopics}
            disabled={creating || !hasConfig || loading}
          >
            {creating ? "Creating…" : topics ? "Re-create Topics" : "Create Topics"}
          </button>
        </div>
        <p style={mutedStyle}>
          Creates named forum topics in your Telegram supergroup and saves their IDs for
          automatic event routing. Requires the group to have "Topics" enabled.
        </p>

        {topics ? (
          <div style={{ display: "grid", gap: "4px" }}>
            {TOPIC_KEYS.map((key) => (
              <div key={key} style={topicRowStyle}>
                <span>{TOPIC_LABELS[key]}</span>
                {topics[key] !== undefined ? (
                  <span style={badge("#22c55e")}>Thread ID: {topics[key]}</span>
                ) : (
                  <span style={{ opacity: 0.4 }}>not created</span>
                )}
              </div>
            ))}
          </div>
        ) : !loading ? (
          <div style={{ fontSize: "13px", opacity: 0.5 }}>
            No topics configured. Click "Create Topics" to set up forum topics in your supergroup.
          </div>
        ) : null}

        {lastError && (
          <div style={{ marginTop: "12px", fontSize: "12px", color: "#ef4444" }}>
            {lastError}
          </div>
        )}
      </div>

      {/* Routing Info */}
      {topics && (
        <div style={cardStyle}>
          <div style={headingStyle}>Event Routing</div>
          <p style={mutedStyle}>
            Events are automatically routed to the appropriate forum topic. Topic IDs from
            state take precedence over any manual topicRouting config.
          </p>
          <div style={{ display: "grid", gap: "4px", fontSize: "12px", opacity: 0.75 }}>
            <div>agent.run.finished / issue.created / issue.updated → Tasks</div>
            <div>approval.created / approval.decided → Approvals</div>
            <div>agent.created → Hiring</div>
            <div>agent.run.failed → System</div>
          </div>
        </div>
      )}
    </div>
  );
}

export default TelegramGatewaySettingsPage;
