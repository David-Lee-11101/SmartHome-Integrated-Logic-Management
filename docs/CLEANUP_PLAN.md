# Bounded integration and platform repair

Scope: Python schema regression fixture, CI runtime setup, generated-service lifecycle.

Behavior lock: six offline Python tests, Electron security/IPC/request validation tests,
and the generator JUnit regressions before editing. Preserve schema rejection without
migration, shell-free subprocess arguments, bounded process shutdown, renderer sandbox,
and independent RPC reads of provider-owned state/action count.

1. Close SQLite fixture connections explicitly: transaction context exit is not close.
2. Use JDK 21 on every host while preserving Java 8 bytecode targets.
3. Install the pinned Electron runtime explicitly: Electron 44 removed its npm
   postinstall script. Preserve normal setuid helper and all host restrictions.
4. Expose the existing provider startup as a lifecycle API and reuse it for the proof.

Fallback inventory: implicit CONSTANT_V1 compatibility is bounded and tested; packaged
versus source generator location is an existing explicit deployment boundary. No masking
fallback, skipped host, global sandbox relaxation, or fabricated success is accepted.

Verify Python, generator Maven tests, TypeScript/security tests, real provider pipeline,
native/package windows locally, then immutable-head Linux/Windows/macOS CI.

Final review repair: remove ordinary-move fallback from provider publication; require
atomic filesystem support. Inject an unsupported publisher in a package-private test
seam and prove staging cleanup plus absent destination. Concurrent destination conflicts
are normalized only after confirming the destination actually exists; unsupported moves
and other filesystem errors retain their original evidence. Preserve inherited ISC
author attribution and terms from immutable historical Electron baseline in RIGHTS.md.
