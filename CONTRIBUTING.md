# Contributing to ACSL Toolkit

Thank you for helping improve ACSL Toolkit. This document is for contributors;
the product overview and installation instructions remain in `README.md`.

## Project scope

Contributions should preserve the extension's deliberately small boundary:

- ACSL syntax highlighting inside existing C/C++ documents;
- lexical, annotation-aware completion;
- editor snippets backed by versioned catalog data;
- browser-compatible, platform-neutral implementation.

An ACSL parser, semantic analysis, diagnostics, proof tooling, Frama-C execution,
and replacement C/C++ language services are outside the current scope. Discuss a
large scope change before implementing it.

## Prerequisites

- Node.js 22
- npm
- VS Code 1.85.0 or later for extension-host testing

Install the exact development dependencies recorded in the lockfile:

```sh
npm ci
```

## Common commands

| Command | Purpose |
|---|---|
| `npm run check` | Validate catalog data and generated grammar, lint, and type-check |
| `npm run test:unit` | Run context, prefix, catalog, and completion unit tests |
| `npm run test:coverage` | Run instrumented unit tests and enforce coverage thresholds |
| `npm run test:performance` | Check the 1 MiB scanner performance budget |
| `npm run test:grammar` | Tokenize C/C++ fixtures and verify TextMate scopes |
| `npm run bundle` | Build the browser extension and integration-test bundles |
| `npm run test:integration:desktop` | Run the desktop Extension Host suite |
| `npm run test:integration:web` | Run the browser Extension Host suite |
| `npm run package` | Validate, test, and create a local VSIX |
| `npm run validate:release` | Check metadata and documentation required for a tagged release |

The desktop and browser integration suites launch graphical test hosts. They are
optional during a small local edit and run in the extended CI workflow. On
headless Linux, run them through one correctly configured Xvfb session rather
than changing `DISPLAY` repeatedly.

## Debugging the extension

Run `npm run bundle`, then press **F5** and select **Run Web Extension in VS
Code**. The checked-in `.vscode/launch.json` and `.vscode/tasks.json` contain only
workspace-relative paths and can be shared safely.

## Repository layout

```text
data/acsl/             Versioned vocabulary and snippet source data
docs/                  Architecture, compatibility, provenance, and release docs
scripts/               Catalog, grammar, test-runner, and release validation tools
src/context/           Lightweight C/C++ lexical context scanner
src/completion/        Catalog loading, prefix extraction, and completion items
syntaxes/              Injection grammar, generated ACSL grammar, language config
test/unit/             Pure TypeScript unit and performance tests
test/grammar/          TextMate tokenization tests and fixtures
test/integration/      Desktop and browser Extension Host tests
test/manual/           Release-candidate checklist
```

See `docs/architecture.md` for the runtime design and
`docs/acsl-data-sources.md` for vocabulary provenance and maintenance rules.

## Changing the ACSL catalog

The JSON files under `data/acsl/<version>/` are the source of truth for
completion and generated highlighting patterns.

1. Work from an immutable official ACSL release and recorded commit.
2. Add or update entries with their category, original short documentation,
   priority, specification section, and source URL.
3. Do not copy prose, examples, grammars, or source code from unrelated editor
   extensions.
4. Attach snippets to existing catalog entry IDs instead of creating duplicate
   visible candidates.
5. Run `npm run validate:catalog`.
6. Run `npm run generate:grammar` and review the generated grammar diff.
7. Add catalog, completion, and grammar tests for the change.

A catalog version identifies the specification source; it does not by itself
claim exhaustive coverage. Record confirmed omissions in
`docs/acsl-data-sources.md` and the user-visible compatibility notes.

## Testing expectations

Before opening a pull request, run at least:

```sh
npm run check
npm run test
npm run bundle
```

Changes to activation, provider registration, or browser compatibility should
also run the relevant desktop and web integration suites. Theme appearance,
snippet Tab traversal, multi-cursor behavior, and coexistence with a C/C++
extension remain release-checklist items because they require a real editor UI.

## Documentation boundaries

- `README.md`, `CHANGELOG.md`, `SUPPORT.md`, and third-party notices are
  user-facing and are included in or linked from the Marketplace package.
- `CONTRIBUTING.md`, `docs/`, tests, scripts, and CI files explain development
  and maintenance and are excluded from the VSIX.
- `AGENTS.md` is local working guidance. It is intentionally ignored and must
  not be committed.

Keep user documentation focused on shipped behavior. Do not advertise planned
work as available functionality or describe the ACSL 1.24 catalog as exhaustive
unless an exact specification audit proves it.

## Public-repository hygiene

Never commit credentials, environment files, private source examples, editor
logs, downloaded test hosts, dependency directories, coverage output, bundles,
or locally built VSIX files. Before committing, inspect both normal and ignored
state:

```sh
git status --short
git status --short --ignored
```

Do not paste proprietary source code into issue reports or fixtures. Reduce a
problem to a small, newly written example. Use a normal branch push; do not
publish the working directory as an archive and do not use `git push --mirror`
from a development environment containing tool-specific Git refs.

## Pull requests

Keep changes focused, explain user-visible behavior, add proportionate tests,
and update documentation when the supported behavior or boundary changes.
Generated grammar changes must be committed together with their catalog source.
