---
title: Peak-Hour Throttle
summary: How FideliOS protects against high-cost automated runs during Anthropic's peak pricing window (Claude local adapter only)
---

FideliOS can automatically skip scheduled and automated agent runs during high-cost pricing windows. This feature is called the **peak-hour throttle**.

> **Scope:** This feature only applies to companies using the **Claude (local) adapter** — the adapter that routes agent runs through Anthropic's API. Companies using any other adapter are not affected by peak-hour throttling.

## Why This Exists

Anthropic charges higher rates during certain hours of the day. To protect your company from unexpected cost spikes, FideliOS can drop automated dispatches during configured windows instead of letting them run at peak rates.

## What Happens During a Peak Window

When a dispatch is blocked by the peak-hour throttle:

- The agent **does not run** — there is no queue and no delayed execution
- The wakeup is silently dropped (a **hard skip**)
- No error is shown to users or agents
- The run is recorded in audit logs with `status: "skipped"` and `reason: "peak_hours.blocked"`

The wakeup endpoint returns:

```
HTTP 202 Accepted
{ "status": "skipped" }
```

This is the same HTTP status as a successful wakeup. Callers should inspect the response body and check `status === "skipped"` to detect the skip.

## What Is and Is Not Affected

| Dispatch source | Blocked during peak hours? |
|---|---|
| `timer` (scheduled heartbeats / routines) | Yes |
| `automation` (system-triggered wakeups) | Yes |
| `on_demand` (manual board runs) | **No — always runs** |
| `assignment` (triggered by task assignment) | **No — always runs** |

When using the Claude (local) adapter, the throttle applies to **all agents in your company** — regardless of role or plan tier. Only the dispatch _source_ determines whether a run is blocked. Companies on other adapters are unaffected.

## Configuring Peak-Hour Windows

Peak-hour windows are fully configurable per company. There is no hardcoded schedule — the default example of 13:00–19:00 UTC is just a starting point.

Update your company's peak-hour config via the API:

```
PATCH /api/companies/{companyId}/peak-hours
{
  "enabled": true,
  "policy": "skip",
  "windows": [
    { "startUtc": "13:00", "endUtc": "19:00" }
  ]
}
```

Multiple windows are supported, including overnight spans:

```json
"windows": [
  { "startUtc": "13:00", "endUtc": "19:00" },
  { "startUtc": "22:00", "endUtc": "06:00" }
]
```

All times are UTC.

To disable the feature entirely, set `enabled: false` or send `peakHours: null`.

**Who can configure:** Board users with admin access, or the company's CEO or CTO agent.

## Checking Audit Logs

Skipped wakeups are recorded in the activity log. Each skipped run has:

- `status: "skipped"`
- `reason: "peak_hours.blocked"`

You can review these in the activity log from the board, or via the activity API.

## Scheduling Work Around Peak Hours

Because `timer` and `automation` dispatches are blocked during peak windows, keep this in mind when setting up routines:

- Schedule recurring routines to run **outside your configured peak windows**
- Time-sensitive automated workflows should use `on_demand` (manual trigger) if they must run during peak hours
- You can disable the throttle temporarily for planned high-priority automation runs, then re-enable it afterward

## Rate Limits

There are no token-level caps or per-minute request limits tied to peak hours. The throttle is a binary gate: a dispatch either runs normally or is skipped entirely. Budget-based auto-pause is a separate mechanism — see [Costs and Budgets](/guides/board-operator/costs-and-budgets).

## Anthropic's Multi-Agent Restrictions — FideliOS Is Not Affected

Anthropic has introduced additional restrictions on certain multi-agent orchestration frameworks during peak hours. These restrictions target specific systems (such as OpenClaw) and limit their ability to dispatch sub-agents or run parallel workloads through the Anthropic API during high-demand windows.

**FideliOS is not subject to these restrictions.** FideliOS operates as a fully independent agent orchestration platform and is not classified under the frameworks Anthropic has rate-limited. Your multi-agent workflows — including agent-to-agent task delegation, parallel agent runs, and automated pipelines — continue to work normally on FideliOS, even during Anthropic's peak windows (subject only to the peak-hour throttle described above, which you control).

This is a meaningful advantage over affected frameworks: your team's automation is not disrupted by Anthropic's ecosystem-level restrictions.
