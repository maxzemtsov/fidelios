# Plugin Authoring Smoke Example

A FideliOS plugin

## Development

```bash
pnpm install
pnpm dev            # watch builds
pnpm dev:ui         # local dev server with hot-reload events
pnpm test
```

## Install Into FideliOS

```bash
pnpm fidelios plugin install ./
```

## Build Options

- `pnpm build` uses esbuild presets from `@fidelios/plugin-sdk/bundlers`.
- `pnpm build:rollup` uses rollup presets from the same SDK.
