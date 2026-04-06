---
title: Updating FideliOS
summary: Keep FideliOS up to date with the latest release
---

Keep FideliOS up to date to get new features, bug fixes, and security patches.

## Check your current version

```sh
fidelios --version
```

Compare the output against the [latest release on GitHub](https://github.com/fideliosai/fidelios/releases).

## Update to the latest release

FideliOS is distributed as an npm package. Update it with:

```sh
npm update -g fidelios
```

To install a specific version:

```sh
npm install -g fidelios@<version>
```

For example:

```sh
npm install -g fidelios@0.0.27
```

## Update when running as a background service

If you have installed FideliOS as a background service with `fidelios service install`, stop the service before updating:

```sh
fidelios service uninstall
npm update -g fidelios
fidelios service install
```

Reinstalling the service after the update ensures the launchd plist or systemd unit file references the new binary path.

<Tip>
  Your data in `~/.fidelios/` is never touched during an npm update. Companies, agents, tasks, and settings are preserved.
</Tip>

## Verify the update

After updating, confirm the version and that the server starts correctly:

```sh
fidelios --version
fidelios service status
```

If the service was stopped manually (not via `service uninstall`), restart it:

```sh
fidelios service install
```

Or start it in the foreground to check for errors:

```sh
fidelios run
```

## Update via the install script

You can also re-run the original install script — it will upgrade to the latest version in place:

```sh
curl -fsSL https://fidelios.nl/install.sh | bash
```

This is equivalent to `npm update -g fidelios` and is safe to run on an existing installation.

## Rollback to a previous version

If a new release causes problems, pin back to the previous version:

```sh
npm install -g fidelios@<previous-version>
fidelios service install   # if using the background service
```

Previous releases are listed on the [GitHub releases page](https://github.com/fideliosai/fidelios/releases).
