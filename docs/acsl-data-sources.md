# ACSL vocabulary sources and maintenance

## Baseline

The initial catalog targets the official stable ACSL 1.24 release:

| Field | Value |
|---|---|
| Specification | *ACSL: ANSI/ISO C Specification Language* |
| Version/tag | `1.24` |
| Commit | `585d28a` |
| Release page | <https://github.com/acsl-language/acsl/releases/tag/1.24> |
| Source repository | <https://github.com/acsl-language/acsl> |
| Source license | CC BY 4.0 |

The catalog does not follow the specification repository's moving default
branch. `data/acsl/versions.json` is the authoritative record of the selected
release and default profile.

The version is a provenance baseline, not a claim that the current catalog
exhaustively represents every production in the specification. Confirmed gaps
in the 0.1 preview include the module/import constructs, `\as`, and dedicated
completion/highlighting for the pattern wildcard `_`. Additions should be based
on an exact specification review rather than on keyword lists from another
editor extension.

## Clean-room collection procedure

For every catalog update:

1. Select a released tag and record its immutable commit.
2. Review the specification's lexical grammar, annotation grammar, logic types,
   built-in terms/functions/predicates, function contracts, statement
   annotations, loop annotations, and behavior clauses.
3. Record individual spellings and their section references. Do not copy prose,
   examples, regular expressions, or implementation source.
4. Write a short original editor-facing description and assign the narrowest
   catalog category.
5. Exclude ordinary C/C++ tokens already owned by the host language service.
6. Exclude Frama-C plugin-specific constructs unless a future catalog explicitly
   names and versions that vendor profile.
7. Run the schema/semantic validator, regenerate the grammar, and review the
   diff against the specification sections below.
8. Update `THIRD_PARTY_NOTICES.md` when the source version, authorship, license,
   or transformation changes.

This process produces a structured derivative vocabulary. Its attribution and
change statement are retained under CC BY 4.0; the extension's independently
written implementation remains MIT licensed.

## Review map

The 1.24 audit groups entries by language role rather than by which existing
editor extension happens to list them:

| Catalog group | Specification material to review | Examples |
|---|---|---|
| Clauses | Function contracts, behaviors, allocation, termination | `requires`, `ensures`, `assigns` |
| Statement/loop annotations | Assertions, loop annotations, variants | `assert`, `loop invariant` |
| Logic declarations and types | Logic/predicate/axiomatic declarations and mathematical types | `logic`, `predicate`, `integer` |
| Built-in terms/functions | State labels, result, ranges, memory/value operations | `\result`, `\old`, `\at` |
| Built-in predicates/binders | Memory predicates and quantification | `\valid`, `\separated`, `\forall` |
| Behavior combinations | Complete/disjoint behavior forms | `complete behaviors` |

An entry is considered reviewed only when it has a stable identifier, exact
label, category, original short description, priority, version, specification
section, and source URL. `introducedIn` and `removedIn` are populated only when
release history provides evidence; absence must not be interpreted as “present
in every ACSL version.”

## Validation requirements

The catalog validator must reject:

- duplicate IDs or labels across files;
- an unknown category or insertion mode;
- a backslash category whose label does not begin with `\`;
- malformed or missing specification provenance;
- snippets with invalid, missing, or conflicting placeholders;
- a snippet attached to a label that would create a second visible candidate.

The generated grammar is checked into source control so reviewers and packaged
extensions do not require generation at runtime. CI runs the generator and then
requires a clean diff.

## Reference-project policy

`ThalesGroup/frama-c-lsp`, `MisterZurg/acsl-lite`, and
`MisterZurg/acsl-ansi-iso-c-specification-language` were reviewed for
interoperability and product comparison only. No source, grammar, artwork,
documentation, examples, or keyword list from those repositories is included.
Their licenses therefore do not govern ACSL Toolkit. They are documented here
only to make the clean-room review history explicit and are not listed as
dependencies or redistributed materials in `THIRD_PARTY_NOTICES.md`.

