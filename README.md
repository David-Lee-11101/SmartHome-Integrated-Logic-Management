# SmartHome Integrated Logic Management

An offline-first desktop workspace for defining smart-home service logic, generating
typed local providers, and inspecting the evidence that precedes an automated action.
It is the management surface of the Smart Home Edge Computing System research project.

The application joins work that previously lived in two separate repositories. The
catalog and rule composer remain here; the service generator is now maintained under
`services/code-generator` with exact source-commit and file-hash provenance. The
historical generator repository remains readable.

## What is implemented

- a sandboxed Electron renderer with context isolation, denied navigation, local-only
  assets, an IPC allowlist, and a strict Content Security Policy;
- an honest empty-workspace state with network adapters disabled by default;
- bounded local composition and explicitly opt-in catalog import/IFTTT adapters;
- a root-confined Java generator that accepts typed service definitions, rejects
  traversal, symlink escape, invalid identifiers, arbitrary Java bodies, conflicting
  writes, and partial output;
- a local pipeline that generates and compiles a provider, starts it on an assigned
  loopback port, writes an atomic local catalog, and invokes it through the Logic
  Engine and TinyRPC adapter;
- an allowlisted stateful boolean-device template whose provider owns synchronized
  state and an action counter, exposed through typed `setEnabled`, `readEnabled`, and
  `readActionCount` operations;
- a Node-built-in unpacked packaging path that preserves Electron and Chromium
  notices and starts the copied native runtime from `resources/app`;
- production `--self-check --offline --report` diagnostics generated only after the
  real BrowserWindow, preload, IPC, and renderer reach the ready state.

## System role

```mermaid
flowchart LR
    UI[Management workspace] --> Definition[Typed service and logic definition]
    Definition --> Generator[Confined code generator]
    Generator --> Build[Maven compile and runtime closure]
    Build --> Provider[Generated TinyRPC provider]
    Provider --> Catalog[Deterministic local catalog]
    Catalog --> Logic[SmartHome Logic Engine]
    Logic --> Communication[Smart Home Communication / TinyRPC]
    Communication --> Profile[Traffic ProfileEvidence]
    Profile --> Decision[Thread-safe SchedulingDecision]
    Decision --> Timeline[ExecutionEvent timeline]
```

The generator-to-provider-to-Logic-Engine edge is executable local code. Profiling and
scheduling are separate components connected by the system contract catalog and the
cold-source integration runner; this repository does not claim to capture physical
home traffic or control real devices by default.

## Local verification

Prerequisites are explicit: Node.js 22, npm, JDK 21 (Java 8 bytecode target), Maven, the sibling Communication
and Logic Engine artifacts installed at their pinned component commits, and a clean
Maven Central settings file. No Python, Java, or Maven runtime is downloaded silently
by the application.

```bash
python3 -m unittest discover -s tests -v

cd services/code-generator
mvn test

cd ../../electron_gui
npm ci
node node_modules/electron/install.js
npm test
npm audit --audit-level=high
```

For the full local provider proof, set `MANAGEMENT_JAVA`, `MANAGEMENT_MAVEN`,
`MANAGEMENT_MAVEN_SETTINGS`, and `MANAGEMENT_MAVEN_REPOSITORY` (plus `MANAGEMENT_MAVEN_HOME` on Windows), then run:

```bash
npm run verify:pipeline -- --output pipeline-proof.json --descriptor-output service-descriptor.json
```

The mandatory release gate runs the same candidate commit on macOS ARM64, Linux X64,
and Windows X64. Every job builds the generator, runs the real local provider pipeline,
starts the native development runtime, packages the complete host Electron runtime,
and opens the packaged production window with the normal platform sandbox. A failure
on any host leaves the cross-platform claim incomplete.

## Security and external boundaries

Cloud catalog import, scraping, uploads, IFTTT mutations, database integrations, and
device writes are external adapters. They remain disabled until a user deliberately
enables and configures them. The packaged offline self-check blocks HTTP, HTTPS, WS,
and WSS at the Electron session layer; it does not claim to sandbox the privileged
main process from every raw socket API.

Generated processes use argument arrays, bounded output, startup deadlines, loopback
addresses, assigned ports, and deterministic cleanup. Renderer input cannot supply
shell text, Java source bodies, classpaths, or arbitrary adapter class names.
The stateful template is fixed: callers cannot add operations or executable logic.
Wrong-arity and unknown-operation calls fail without increasing the provider-owned
action counter.

## Research and evidence limits

This repository is research software. Historical experiments are documented as
historical and are not presented as newly reproduced measurements. Cross-platform
evidence applies only to the exact tested OS, architecture, Electron version, and Git
commit. Installers, code signing, notarization, automatic updates, and app-store
distribution are outside the current evidence boundary.

See [architecture](docs/architecture/overview.md), [evidence boundaries](docs/research/evidence-boundaries.md),
[dependency decisions](docs/research/dependency-decisions.md), [security policy](SECURITY.md), and [rights](RIGHTS.md).

## Rights

Source is visible for inspection. No reuse license is granted for owner-authored
material. GitHub platform permissions and third-party licenses continue to apply as
described in `RIGHTS.md`.
