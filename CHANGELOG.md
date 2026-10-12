# Changelog

All notable changes to ACSL Toolkit are documented in this file. This project
follows [Semantic Versioning](https://semver.org/).

## [0.2.0] - 2026-10-12

### Added

- Added argument-aware snippets for all 48 entries categorized as callable
  built-ins in the ACSL 1.24 catalog, including state, set, aggregate, memory,
  list, mathematical, and floating-point constructs.

### Fixed

- Callable snippets preserve an existing argument list instead of inserting a
  second pair of parentheses.
- A semicolon following a callable snippet prefix is no longer consumed.

## [0.1.1] - 2026-10-11

### Added

- Added support for VS Code's built-in **Toggle Line Comment** action inside
  `/*@ ... */` annotations. Clause lines are commented with `//` and can be
  restored by running the same action again.

### Fixed

- Commented ACSL clauses now use an ordinary line-comment scope and no longer
  receive ACSL completion.
- The outer `*/` delimiter remains authoritative when an annotation contains a
  `//` comment; nested block comments are intentionally unsupported.

## [0.1.0] - 2026-10-11

### Added

- Browser-compatible VS Code extension entry point for desktop, remote, and web
  extension hosts.
- ACSL TextMate grammar injection for `/*@ ... */` and `//@ ...` annotations in
  C and C++ documents.
- Annotation-aware lexical completion for ACSL clauses, keywords, logic types,
  multi-word constructs, and backslash constructs.
- Context-sensitive snippet insertion for common clauses without attempting to
  infer predicates.
- Structured declaration snippets for axiomatic blocks, logic definitions,
  predicates, lemmas, axioms, named behaviors, inductive predicates, cases,
  and logic types; block-shaped constructs expand across multiple lines in
  block annotations.
- Versioned ACSL 1.24 catalog provenance and explicit compatibility boundaries.
- Desktop and Web Extension Host support through one platform-neutral browser
  bundle.

