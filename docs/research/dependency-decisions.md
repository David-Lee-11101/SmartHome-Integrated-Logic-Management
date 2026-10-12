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
the gate closed if routing changes. Electron 44 exposes an explicit binary installer instead of an npm postinstall script.
CI runs the pinned package's `install.js` after `npm ci`, then checks and enables the
normal Linux setuid Chromium sandbox helper. The copied unpacked helper is also
assigned root ownership and mode 4755 before the package smoke check. No global AppArmor or kernel restriction
is changed, and no sandbox-disabling switch is passed.

JDK 21 supplies a native ARM64 runtime on macOS; generators retain Java 8 source/target
compatibility. The workflow does not claim to execute a Java 8 ARM64 runtime.

- [macOS 15 runner announcement](https://github.com/actions/runner-images/issues/11486)

All action dependencies are pinned by immutable commit SHA. The workflow checks the
Management, Communication, and Logic Engine heads before compiling from source.

## Runtime dependency closure

Management's host matrix builds `tiny-rpc-netty` with its core/codec/telemetry
reactor prerequisites and `logic-engine-tiny-rpc-adapter` with its core prerequisite.
Every selected module runs its tests. Historical Consumer/Provider examples and
registry adapters are not in generated providers' runtime closure; full component
governance and legacy regression checks belong to the component repositories.
This gate proves the management application and its current dependencies only.
