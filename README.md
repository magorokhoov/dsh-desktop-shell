# Harness Desktop Shell

**Unofficial.** A native window for the [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)
web GUI. Not affiliated with or endorsed by DeepSeek.

> **Written by AI.** The code, documentation and commit history in this repository were
> produced by an AI coding agent (DeepSeek Harness) from the author's brief and reviewed by
> the author. Nothing here ships DeepSeek code or speaks for DeepSeek.

The shell does not bundle the harness. It starts the **installed** `dsh` CLI
(`dsh web --no-open`), reads the authenticated URL from its output and shows it in an
Electron window. Your normal `web` profile stays in use: sessions, plugins, models and
settings are exactly the ones the CLI already has.

## Why

- no browser toolbar and no extensions;
- no system proxy or extension interference — Electron has its own session;
- separate cookies and storage from your everyday browser;
- the microphone is allowed only for the harness origin;
- one window, one instance, Ctrl-based zoom.

## Requirements

- Linux x64 (built on Arch/EndeavourOS; any glibc distro should work);
- `dsh` installed and reachable — on `PATH` (`npm i -g @deepseek-ai/dsh`) or from the
  newest `~/.npm/_npx/*` entry;
- `libfuse2` for the AppImage (otherwise run with `--appimage-extract-and-run`).

## Install

Download `DeepSeekHarness-<version>.AppImage` from [Releases](../../releases):

```bash
chmod +x DeepSeekHarness-*.AppImage
./DeepSeekHarness-*.AppImage
```

Stop any `dsh web` running in a terminal first: the shell owns port `3080` and refuses to
start while it is busy — two hosts must not share one profile.

## Usage

| Shortcut | Action |
| --- | --- |
| `Ctrl+=` / `Ctrl+Shift+=` (numpad `+`) | zoom in |
| `Ctrl+-` | zoom out |
| `Ctrl+0` | reset zoom |

The zoom level survives restarts. Closing the window quits the app and stops the host it
started.

### Overrides

- `DSH_DESKTOP_BIN` — path to `…/@deepseek-ai/dsh/lib/bin.js` (or the `dsh` launcher);
- `DSH_DESKTOP_NODE` — Node used to run the CLI (defaults to `node` on `PATH`, then
  Electron's own Node).

## How it works

1. Checks that port 3080 is free.
2. Resolves the CLI (`DSH_DESKTOP_BIN` → `PATH` → newest npx cache entry) and spawns
   `dsh web --host 127.0.0.1 --port 3080 --no-open`.
3. Waits for the `dsh web: http://…?token=…` line on stdout.
4. Loads that URL into a `BrowserWindow`; the token mints the session cookie.
5. Grants the microphone only to the harness origin.
6. On quit sends `SIGTERM` to the child host (then `SIGKILL` after 4 s).

Releases are built by GitHub Actions on every `v*` tag.

## License

MIT — see [LICENSE](LICENSE).
