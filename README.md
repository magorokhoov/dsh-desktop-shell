# Harness Desktop Shell

**Unofficial** native window for the [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) web GUI. It is not affiliated with or endorsed by DeepSeek.

The shell does not bundle the harness. It starts the **installed** `dsh` CLI
(`dsh web --no-open`), reads the authenticated URL from its output and shows it in an
Electron window. You keep your normal `web` profile: sessions, plugins, models and
settings are exactly the ones the CLI already uses.

## Why

- no browser toolbar and no browser extensions;
- no system proxy or extension interference — Electron has its own session;
- separate cookies and storage from your everyday browser;
- the microphone is allowed only for the harness origin;
- one window, one instance, Ctrl-based zoom.

## Requirements

- Linux x64 (built and tested on Arch/EndeavourOS; any glibc distro should work);
- `dsh` installed and reachable:
  - on `PATH` (`npm i -g @deepseek-ai/dsh`), or
  - the newest `~/.npm/_npx/*` entry is picked automatically;
- `libfuse2` for the AppImage (otherwise run with `--appimage-extract-and-run`).

## Install

Download `DeepSeekHarness-<version>.AppImage` from [Releases](../../releases):

```bash
chmod +x DeepSeekHarness-*.AppImage
./DeepSeekHarness-*.AppImage
```

Stop any `dsh web` running in a terminal first: the shell owns port `3080` and refuses to
start while it is busy (two hosts must not share one profile).

## Usage

| Shortcut | Action |
| --- | --- |
| `Ctrl+=` / `Ctrl+Shift+=` (numpad `+`) | zoom in |
| `Ctrl+-` | zoom out |
| `Ctrl+0` | reset zoom |

The zoom level is stored in the Electron user-data directory and survives restarts.
Closing the window quits the app and stops the host it started.

### Overrides

- `DSH_DESKTOP_BIN` — path to `…/@deepseek-ai/dsh/lib/bin.js` (or the `dsh` launcher);
- `DSH_DESKTOP_NODE` — Node used to run the CLI (defaults to `node` on `PATH`, then
  Electron's own Node).

## Build

```bash
npm ci
npx electron-builder --linux AppImage
```

The result lands in `dist/`. On CI, pushes to a `v*` tag build the AppImage and attach it
to a GitHub release (`.github/workflows/release.yml`).

## Test

```bash
npm run test:zoom
```

Runs an Electron smoke test that synthesizes `Ctrl+=`, `Ctrl+-` and `Ctrl+0` on a data URL
and asserts the resulting zoom levels.

## How it works

1. `app.whenReady()` checks that port 3080 is free.
2. The shell resolves the CLI (`DSH_DESKTOP_BIN` → `PATH` → newest npx cache entry) and
   spawns `dsh web --host 127.0.0.1 --port 3080 --no-open` with the user's Node.
3. It waits for the `dsh web: http://…?token=…` line on stdout.
4. `BrowserWindow` loads that URL; the token mints the browser session cookie.
5. Permission requests are granted only for `media` on the harness origin.
6. On quit the child host receives `SIGTERM` (then `SIGKILL` after 4 s).

## Notes

- The harness itself updates independently: `npm i -g @deepseek-ai/dsh@latest`.
  Rebuilding the shell is only needed when its own code changes.
- `DeepSeek` and `DeepSeek Harness` are trademarks of their owner; this repository is an
  independent wrapper and does not ship any DeepSeek code.

## License

MIT — see [LICENSE](LICENSE).
