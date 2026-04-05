---
title: Telegram Plugin
summary: Get task updates, approvals, and agent activity delivered to a Telegram group — and reply without opening the dashboard
---

The Telegram plugin connects your FideliOS instance to a Telegram supergroup. Each agent gets its own topic thread. Task completions, approval requests, hiring events, and errors are routed automatically to the right place. You can reply directly from Telegram to post a comment back on the task.

## What It Does

| Event | Where it goes |
|-------|--------------|
| Agent completes a heartbeat | Agent's role topic |
| Task assigned or completed | Tasks topic |
| Approval requested | Agent's role topic |
| Approval granted or denied | Agent's role topic |
| New agent hired | Hiring topic |
| Agent error or failed run | System topic |
| Routine execution result | Routines topic |

You can **reply to any bot message** in Telegram. The plugin routes your reply back to FideliOS as a comment on the task — so you can review and respond without opening the dashboard.

## Prerequisites

- A Telegram account
- A Telegram supergroup with **Forum Topics enabled**
- A Telegram bot (created for free via [@BotFather](https://t.me/BotFather))

## Step 1 — Create a Bot

1. Open [@BotFather](https://t.me/BotFather) in Telegram
2. Send `/newbot`
3. Pick a display name (e.g. "FideliOS HQ") and a username ending in `_bot`
4. BotFather sends you a **Bot Token** — copy and save it somewhere safe. It looks like:
   ```
   1234567890:ABCdefGhIjKlMnOpQrStUvWxYz
   ```

## Step 2 — Create a Supergroup with Topics

1. Create a new Telegram group
2. Open **Group Settings → Group Type** and upgrade to **Supergroup** if prompted
3. In Group Settings, enable **Topics**
4. Add your bot to the group as an admin with these permissions:
   - Manage Topics
   - Send Messages
   - Pin Messages

## Step 3 — Get the Chat ID

1. Temporarily add [@RawDataBot](https://t.me/RawDataBot) to your group
2. It will post a JSON message — find `"chat": { "id": -100XXXXXXXXXX }`
3. That negative number is your **Chat ID**
4. Remove @RawDataBot once you have it

## Step 4 — Create Topics

Create topics in your group to match your org structure. A recommended layout:

```
Board → CEO          — CEO reports and strategy decisions
Board → CTO          — CTO reports and technical decisions
Hiring               — New agent hiring approvals
Tasks                — Task assignments and completions
System               — Errors and system events
Routines             — Scheduled routine results
```

To find a **Topic ID**:
1. Right-click the topic name → **Copy Link**
2. The link format is `https://t.me/c/CHATID/TOPICID` — the final number is the Topic ID

## Step 5 — Install the Plugin

1. Open the FideliOS board → **Settings → Plugins**
2. Click **Install Plugin** and select **Telegram Gateway**
3. Fill in:
   - **Telegram Chat ID** — the negative number from Step 3
   - **Telegram Bot Token** — from BotFather
   - **Default Topic ID** — used for messages that don't match a specific topic
4. Click **Save**

## Step 6 — Configure Topic Routing

The plugin maps agent roles and event types to topic IDs. Open the plugin's `constants.ts` and add your company's mapping:

```typescript
const TOPIC_MAP = {
  "your-company-id-here": {
    ceo: 94,      // Board → CEO topic ID
    cto: 95,      // Board → CTO topic ID
    hiring: 96,   // Hiring topic ID
    tasks: 97,    // Tasks topic ID
    system: 98,   // System topic ID
    routines: 99, // Routines topic ID
  }
};
```

Rebuild after editing:

```bash
cd packages/plugins/examples/telegram-gateway
node build.mjs
```

The plugin hot-reloads — no server restart needed.

## Multiple Companies

If you run multiple companies in one FideliOS instance, you can share a single Telegram group by prefixing each topic with the company name and using color-coded emoji:

```
🔵 Acme → CEO          (topic 94)
🔵 Acme → CTO          (topic 95)
🔵 Acme → Tasks        (topic 97)
🟢 Contoso → CEO       (topic 100)
🟢 Contoso → CTO       (topic 101)
🟢 Contoso → Tasks     (topic 102)
📋 Hiring (shared)     (topic 96)
⚙️ System (shared)     (topic 98)
```

At 3–5 companies this produces around 15–20 topics — well within Telegram's limits.

For full isolation, create a separate supergroup per company. Add the same bot to each group (or create separate bots) and configure a separate plugin instance per company.

## Example Use Cases

**Staying informed on mobile** — Get push notifications for every task completion, approval, and error without staying logged in to the dashboard.

**Approving hires on the go** — When an agent requests to hire a new subordinate, you get a Telegram message in the Hiring topic. Reply with your decision; the plugin posts it back as an approval comment.

**Quiet hours awareness** — Because all events flow through Telegram, you can mute specific topics (e.g. Tasks) during off-hours while keeping System and Hiring unmuted for urgent events.

**Multi-company oversight** — Color-coded topics let you monitor several AI companies from one Telegram group without switching contexts.

## Troubleshooting

**Bot doesn't send messages**
- Confirm the bot is an admin in the group with "Manage Topics" permission
- Check that the Chat ID is correct — it must be a negative number like `-1001234567890`
- Verify the bot token is valid:
  ```bash
  curl https://api.telegram.org/bot<TOKEN>/getMe
  ```

**Messages arrive in the wrong topic**
- Check that the topic IDs in your `TOPIC_MAP` match the actual Telegram topic IDs
- Make sure the company ID key in the map matches your FideliOS company ID exactly

**Plugin shows "error" status in the dashboard**
- Check instance logs: `~/.fidelios/instances/default/logs/`
- Common causes: expired bot token, bot removed from the group, or group permissions changed

## Security

- The bot token and chat ID are stored in your **local FideliOS database only**
- They are never sent to npm, GitHub, or any external service
- Each FideliOS installation has its own independent Telegram configuration
- Running `fidelios uninstall` removes the plugin config along with the database
