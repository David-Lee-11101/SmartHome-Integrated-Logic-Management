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

Numeric boundary review: preserve parsed numeric values in Java source. Canonicalize
INT/LONG/DOUBLE after validation to prevent octal interpretation and float suffix
rounding; lock signs, leading zero, negative zero, bounds and overflow with unit tests
and compile/start/invoke a real generated INT service returning decimal 12 for "012".

Identifier boundary review: reject reserved Java words in method names and every
package segment before generation, in both renderer request validation and Java model
validation. Preserve valid contextual names such as the method name "record".

Object method signature review: constant operation templates emit public no-argument
methods. Reproduce inherited final/incompatible return signatures with the actual
generated method and JavaCompiler before repair; reject these at Java and desktop
request boundaries before publication. Preserve toString/STRING, hashCode/INT,
clone/STRING covariant return, and nonconflicting equals() no-argument overload.
