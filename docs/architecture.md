# Architecture

## Goals and boundaries

ACSL Toolkit adds editor assistance to documents that remain owned by VS Code's
existing C and C++ language services. The extension recognizes annotation
boundaries, offers lexical data, and colors ACSL tokens. It does not build a C
or ACSL syntax tree and does not execute verification tools.

The design has three independent layers:

```text
C/C++ TextDocument (languageId: c or cpp)
├── TextMate engine
│   └── ACSL injection grammar
├── Embedded ACSL language configuration
│   └── `//` line-comment token
└── Web Extension Host
    └── Completion provider
        ├── C/C++ lexical context scanner
        ├── ACSL prefix extractor
        ├── annotation-local binding scanner
        ├── current-document declaration index
        └── versioned completion catalog
```

Keeping the grammar and completion context scanner independent is intentional.
VS Code extensions cannot reliably query TextMate scopes through the public API,
and either implementation can therefore be tested without the editor process.
Their regression suites exercise the same annotation, comment, and literal
boundaries so reviews can detect behavioral drift.

## Extension boundary

`src/extension.ts` registers one completion provider for the `c` and `cpp`
language ids with `\` as its only trigger character. It does not register file
extensions, change language associations, launch a child process, or read a
workspace. The manifest exposes only a `browser` entry point, so the same bundle
runs in desktop and browser extension hosts.

The internal `acsl` language id exists solely for embedded-language token
classification. It has no filename association and therefore cannot take
ownership of a C/C++ document.

## Highlighting pipeline

The injection grammar targets `source.c` and `source.cpp` and recognizes:

- block annotations beginning with `/*@` and ending with `*/` or EOF;
- line annotations beginning with `//@` and ending at CR/LF or EOF.

The selector excludes existing comment and string scopes. Annotation contents
are assigned `meta.embedded.block.acsl` or `meta.embedded.inline.acsl`; those
scopes include the small `source.acsl` grammar. Standard TextMate names such as
`keyword.control`, `storage.type`, and `support.function` let the active theme
choose colors. No theme is bundled and no colors are hard-coded.

The embedded scopes are classified as token type `other`, not `comment`. This
allows normal word suggestions inside ACSL without changing the user's global
`editor.quickSuggestions.comments` setting. A more specific mapping assigns an
inner `//` region both a standard line-comment scope and the `comment` token
type, so its highlighting and editor behavior match an ordinary comment.

## Embedded line comments

The embedded `acsl` language configuration declares `//` as its line-comment
token. When the cursor or selection is inside a block annotation, VS Code's
built-in **Toggle Line Comment** action therefore inserts or removes `//`; the
extension does not register a custom editing command or keybinding. The ACSL
grammar recognizes the inserted text as a line comment, and the completion
scanner excludes it from ACSL context until the physical line ends.

Only line comments are declared. Nested `/* ... */` comments are intentionally
unsupported because the surrounding annotation is already a C/C++ block
comment and C/C++ block comments do not nest. The outer `*/` delimiter always
retains control of the annotation boundary.

## Context detection

Completion first scans document text from the beginning through the cursor. The
pure TypeScript scanner tracks these states:

```text
code
├── lineComment
├── blockComment
├── string
├── char
├── rawString
├── acslLine
├── acslBlock
├── acslInnerLineComment
├── acslString
└── acslChar
```

Only markers encountered in `code` can enter an ACSL state. Escape sequences,
line continuations, and C++ raw-string delimiters are handled so marker-like
text inside literals cannot enable completion. A block annotation that has not
yet been closed remains valid through the cursor, which is essential during
editing. Inside an annotation, `//` enters `acslInnerLineComment`; completion is
disabled there and resumes on the next line. ACSL string and character states
prevent `//` contained in a literal from being treated as a comment. Ordinary
C/C++ block comments are not nested.

The scanner returns the annotation kind and offsets of the marker, content, and
cursor. If it returns no context, the provider returns `undefined` immediately.
Context detection uses an O(n) forward scan; a benchmark guards the target
of less than 20 ms for a 1 MiB fixture on the supported Node development
runtime. Line-state caching can be added later without changing the public
provider contract.

## Local binding completion

The provider supplements the static catalog with explicitly declared names from
the annotation containing the cursor. A browser-safe lexical scanner identifies
parameters in `predicate` and `logic` definitions and names bound
by `\let`, `\forall`, `\exists`, and `\lambda`. It skips comments and
literals and tracks declaration and expression boundaries so local names do not
leak into following clauses or out of parenthesized expressions. The innermost
visible declaration wins when names are shadowed.

`src/symbols/acslTokens.ts` retains document offsets for annotation tokens;
`src/symbols/localSymbols.ts` walks delimiters and binding headers without an
AST. Tuple `\let` bindings and typed set comprehensions are recognized as well.
Comprehension names are visible in both the projection and condition, even when
their declarations occur after the cursor in the projection. Unicode `∀` and
`∃` spellings use the same quantifier rules.

An `inductive` header contributes no parameter bindings to its `case` bodies.
Each case obtains local names from its own quantifiers and `\let` bindings,
following ACSL's inductive typing environment.

These candidates use `CompletionItemKind.Variable`, plain-name insertion, and
an explicit identifier replacement range that includes any suffix after a
mid-word cursor. They preserve following punctuation, including semicolons.
They share the completion list with matching catalog entries for ordinary word
prefixes. Local names have a separate single-word replacement range; backslash
prefixes remain reserved for catalog constructs. Local matches are refreshed
with an incomplete completion list, so typing updates the collected names.

This scanner is intentionally limited to annotation-local lexical bindings.
User-defined callable names are supplied separately by the document declaration
index. Neither component resolves C/C++ parameters or infers types. Incomplete
declarations are handled conservatively during editing. The context scanner
remains the gatekeeper, so no ACSL candidates are returned inside comments or
literals.

## User-defined declaration completion

A document-local lexical index recognizes `predicate` and `logic` declarations
inside genuine ACSL annotations, including `inductive` predicates. It records names, declaration offsets,
explicit parameter names and types, and whether the declaration has a parameter
list. The C/C++ lexical scanner excludes marker-like text in ordinary comments,
quoted literals, and raw strings; annotation tokenization excludes disabled
`//` lines and ACSL literals. No workspace traversal or file loading is needed.
`src/symbols/documentSymbols.ts` uses annotation ranges from the same C/C++
scanner as context detection. `src/symbols/typedNames.ts` shares typed-name
extraction with local bindings. The provider caches the index per document and
version, invalidating it when the text changes. A benchmark covers a fresh
index plus context and local-binding scans in a 1 MiB buffer.

Completed declarations in the current annotation and preceding annotations are
offered. A completed header permits recursive references from its own definition
body; later declarations in the same annotation permit mutually recursive
references. Declarations in later annotations are excluded. This is lexical
assistance rather than module, visibility, or type resolution. Included files
and declarations in other documents are outside the index.

Candidates carry an `ACSL document` detail and their declared signature. Calls
insert `SnippetString` label and argument placeholders named after the declared
binders. An explicit empty parameter list inserts `name()`, while a declaration without
one inserts the name (plus any explicit label placeholders). Existing argument lists, including optional label
and type arguments, are preserved by name-only insertion. Local bindings win
same-name collisions. Distinct overload signatures remain separate candidates,
without inferred overload selection; repeated declarations of the same
signature do not create duplicate candidates.

## Completion pipeline

For a valid context, the prefix extractor determines one of three modes:

- ordinary word (`req`);
- backslash identifier (`\va`), including the slash in the replacement range;
- multi-word construct (`loop inv`), including the full phrase in the range.

Catalog entries are filtered by prefix/alias and sorted by explicit priority,
label length, and label. An empty prefix or a lone backslash returns a bounded
set of high-priority entries and marks the list incomplete. Typed prefixes
return the complete matching set.

Each catalog label produces exactly one completion item. Entries with a
configured template use `SnippetString`; a separate duplicate snippet candidate
is not created. The item builder avoids inserting a second semicolon when one
already follows the cursor. Callable built-in snippets preserve that semicolon. If an
opening parenthesis—or an optional `{label}` or `<type>` argument followed by
one—already follows the completed name, they insert only the canonical label so
the user's existing call remains unchanged.
Every entry categorized as `builtin-function` has a callable snippet whose
placeholder order follows its audited ACSL 1.24 signature. Variadic arguments
are represented by one list placeholder, optional labels are omitted, and a
single conservative overload is used where one label has several signatures.
Declaration templates expose editable names, types, parameters, terms, and
predicates. Constructs defined as blocks by ACSL, such as `axiomatic` and
`inductive`, insert newline-delimited braces; a named `behavior` instead follows
its grammar's colon-and-body form. The provider never invents any placeholder
value. Because a physical newline terminates a `//@` annotation, snippets
containing newlines are folded to an equivalent single-line form in that
context. Their multiline form is retained in block annotations.

## Vocabulary and generated artifacts

Files below `data/acsl/<version>/` are the reviewable source of truth. Each entry
records category, documentation, priority, and specification provenance. The
catalog loader supplies completion, while `scripts/generate-grammar.mjs`
generates the corresponding keyword patterns in
`syntaxes/acsl.tmLanguage.json`.

Generation is deterministic. CI regenerates the grammar and fails if the
working tree changes, ensuring syntax highlighting and completion cannot drift
silently. Adding a future ACSL profile means adding a version record and data
directory; a user-facing version selector should not be exposed until at least
two validated profiles exist.

## Trust, remote, and web behavior

The extension has no workspace-dependent behavior and is safe in untrusted and
virtual workspaces. It processes the active document text supplied by VS Code
but does not enumerate or open other workspace files. Clause commenting is
performed by VS Code's built-in editor action and remains normally undoable. The
extension uses only browser-compatible VS Code APIs and bundled data. There are
no Node built-ins, native modules, external processes, telemetry, network
requests, or platform-dependent code at runtime.

