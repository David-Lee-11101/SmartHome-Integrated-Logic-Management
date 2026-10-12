# Dependency and runner decisions

## Electron

The desktop package pins Electron `44.7.0`. On 2026-10-12, the official release
dashboard identified that patch as the latest stable release, and the official release
schedule placed major 44 inside its support period. Electron's published policy covers
the latest three stable major versions. The upgrade from the historical Electron 41
line was followed by TypeScript, unit, native BrowserWindow, preload/IPC, and unpacked
production-window checks.

- [Electron 44.7.0 release](https://releases.electronjs.org/release/v44.7.0)
- [Electron release schedule](https://releases.electronjs.org/schedule)
- [Electron support timeline](https://www.electronjs.org/docs/latest/tutorial/electron-timelines)

## GitHub-hosted runners

The release gate uses `macos-15`, `ubuntu-24.04`, and `windows-2022`, then asserts the
runtime architecture before doing any build work. GitHub's runner-image announcement
identifies `macos-15` as the Apple Silicon label for GitHub Actions; the assertion keeps
the gate closed if routing changes. Linux enables Electron's setuid Chromium sandbox
and does not pass `--no-sandbox`.

- [macOS 15 runner announcement](https://github.com/actions/runner-images/issues/11486)

All action dependencies are pinned by immutable commit SHA. The workflow checks the
Management, Communication, and Logic Engine heads before compiling from source.
