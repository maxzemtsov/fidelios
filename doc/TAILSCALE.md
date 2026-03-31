# Tailscale Remote Access

Access your FideliOS dashboard from any device (phone, tablet, laptop) over a secure private network using Tailscale.

## Why Tailscale?

FideliOS runs on `localhost:3100` — only accessible from the machine it runs on. Tailscale creates a private encrypted network between your devices, so you can access FideliOS from your phone over `https://your-machine.tail1234.ts.net:3100`.

No port forwarding, no public exposure, no VPN configuration.

## Setup (5 minutes)

### Step 1: Install Tailscale

- **Mac**: `brew install tailscale` or download from [tailscale.com/download](https://tailscale.com/download)
- **Windows**: Download from [tailscale.com/download](https://tailscale.com/download)
- **iPhone/Android**: Install from App Store / Google Play

Sign in with the same account on all devices.

### Step 2: Find your machine name

After installing Tailscale on your Mac/PC, find the hostname:

```bash
tailscale status
```

Look for your machine — it will show something like `local-server.tail1bf8f0.ts.net`.

### Step 3: Configure FideliOS

FideliOS needs two changes:

**1. Bind to all interfaces** (not just localhost):

Edit `~/.fidelios/instances/default/config.json`:
```json
{
  "server": {
    "host": "0.0.0.0"
  }
}
```

**2. Allow the Tailscale hostname:**

```bash
fidelios allowed-hostname your-machine.tail1234.ts.net
```

### Step 4: Restart and access

```bash
fidelios run
```

Now open `http://your-machine.tail1234.ts.net:3100` on your phone or any device connected to your Tailscale network.

## Security

- Tailscale traffic is end-to-end encrypted (WireGuard)
- Only devices signed into your Tailscale account can access FideliOS
- No ports are exposed to the public internet
- FideliOS `allowedHostnames` guard ensures only whitelisted hostnames are accepted

## Troubleshooting

**"Blocked request" error in browser:**
- Make sure you ran `fidelios allowed-hostname your-machine.tail1234.ts.net`
- Make sure `host` is `0.0.0.0` in config (not `127.0.0.1`)
- Restart FideliOS after config changes

**Can't connect from phone:**
- Check Tailscale is active on both devices (green icon)
- Try `ping your-machine.tail1234.ts.net` from the phone
- Make sure FideliOS is running on the host machine

**HTTPS certificate warning:**
- Tailscale can issue HTTPS certificates: `tailscale cert your-machine.tail1234.ts.net`
- Or just use `http://` — Tailscale traffic is already encrypted at the network level
