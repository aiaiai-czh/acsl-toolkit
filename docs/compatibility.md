# Compatibility

## Host design targets

ACSL Toolkit is a browser-only VS Code extension. It is designed for:

| Host | Design status | Notes |
|---|---|---|
| VS Code desktop | Supported target | Web extension runs in the desktop web worker host |
| VS Code Remote / Codespaces | Supported target | No remote binary is installed or executed |
| vscode.dev / github.dev | Supported target | Uses no Node.js or filesystem-only runtime API |
| VSCodium / compatible Open VSX clients | Best effort | Open VSX distribution and host behavior require separate validation |

The minimum declared VS Code engine is `^1.85.0`. The automated workflows are
configured to exercise the desktop suite against both 1.85.0 and current stable
and the browser suite against the current stable web build. A release should not
describe a host as manually verified until the corresponding checklist item has
actually been completed for the candidate VSIX.

## Languages and files

The completion provider registers for VS Code language ids `c` and `cpp`.
Filename extensions are intentionally not registered by this project. Files
such as `.h` are supported whenever VS Code currently classifies the document
as C or C++. A user-defined language association that changes the language id
to something else is outside this provider's scope.

The injection grammar targets the host scopes `source.c` and `source.cpp`.
Initial annotation support is limited to:

- `/*@ ... */`, including an unfinished block extending to EOF;
- `//@ ...`, ending at CR, LF, or EOF.

CUDA, Objective-C, independent `.acsl` files, and other host grammar scopes are
not part of version 0.1.x.

## ACSL versions

Version 0.1.x exposes a single ACSL 1.24 profile. C++ documents receive the same
shared profile; this is not a claim of complete ACSL++ support. The extension
does not report whether a selected Frama-C release implements a catalog entry.

The profile version identifies the specification used for provenance. It is not
an exhaustive-coverage claim. The 0.1 preview does not yet provide dedicated
catalog entries for module/import constructs, `\as`, or the pattern wildcard
`_`; see `docs/acsl-data-sources.md` for the maintenance policy.

Future language versions can coexist as versioned catalog directories. No
version setting is exposed until more than one complete, tested profile exists.

## Target platforms

The VSIX contains JavaScript and JSON only, so it has no target-platform suffix.
The same artifact is intended for:

- Windows x64 and ARM64;
- Linux x64 and ARM64;
- macOS Intel and Apple Silicon.

Platform-neutral packaging follows from the absence of native runtime code; it
does not replace installation and editor-host testing. The exact candidate VSIX
must pass the automated workflows and the applicable items in
`test/manual/checklist.md` before a platform is recorded as release-verified.

## Known interoperability constraints

- VS Code merges results from all matching completion providers. ACSL Toolkit
  cannot hide candidates returned by another extension inside annotations.
- Extensions that remap C/C++ files to another language id can disable both
  this provider and Microsoft C/C++ language features.
- A theme decides the final colors for TextMate scopes. ACSL Toolkit contributes
  semantic scope names but no theme overrides.
- Microsoft C/C++ semantic highlighting can take precedence for some host C/C++
  tokens; annotation scopes are covered by grammar and manual coexistence tests.
- Alphabetic suggestions follow the user's editor settings. The backslash
  trigger and explicit `Trigger Suggest` command remain available.

