# ACSL Toolkit

A complete Simplified Chinese edition is available in
[README.zh-CN.md](README.zh-CN.md).

ACSL Toolkit adds lightweight editing support for the ANSI/ISO C Specification
Language (ACSL) inside existing C and C++ documents. It provides syntax
highlighting, native line-comment support, annotation-aware lexical completion,
declared-name completion, and practical snippets without requiring Frama-C,
OCaml, a language server, or a native executable.

The extension augments the existing `c` and `cpp` language modes. It does not
take ownership of C/C++ files or replace a C/C++ language extension.

```c
/*@
  requires length > 0;
  requires \valid(buffer + (0 .. length - 1));
  ensures \result >= 0;
*/
int inspect(const int *buffer, int length);

//@ assert index < length;
```

> ACSL Toolkit is currently a preview. It provides lexical editing assistance,
> not parsing, verification, or a guarantee that a particular Frama-C version
> implements every catalog entry.

## Features

- Highlights `/*@ ... */` and `//@ ...` annotations in C and C++ documents.
- Offers ACSL completions only while the cursor is inside an ACSL annotation.
- Completes clauses, keywords, logic types, multi-word constructs, and commonly
  used backslash constructs from a versioned ACSL 1.24 vocabulary catalog.
- Replaces the complete prefix for entries such as `\va` and `loop inv`, avoiding
  duplicate backslashes or partially replaced phrases.
- Inserts tab-navigable snippets for clauses such as `requires`, `ensures`, and
  `loop invariant` without guessing predicate contents.
- Provides structured snippets for declarations including `axiomatic`,
  `predicate`, `logic`, `lemma`, `axiom`, `behavior`, and `inductive`.
- Inserts argument placeholders for all 48 callable built-in entries in the
  bundled ACSL 1.24 catalog.
- Completes declared parameters of `predicate` and `logic`
  definitions, plus local names bound by `\let`, `\forall`, `\exists`, and
  `\lambda` within their lexical scope, including tuple bindings and typed
  set comprehensions.
- Completes user-defined `predicate` and `logic` names declared in the current
  or a preceding annotation, and inserts
  editable argument placeholders from their declarations.
- Uses multiline declaration templates in block annotations and safe single-line
  forms in `//@` annotations.
- Supports VS Code's normal **Toggle Line Comment** action for clause lines
  inside block annotations.
- Does not change the document's existing `c` or `cpp` language ID, allowing
  other C/C++ highlighting, completion, navigation, and formatting providers to
  continue operating.

## Installation

### Visual Studio Marketplace

Open the Extensions view in VS Code, search for **ACSL Toolkit**, and select
**Install**.

### Install a VSIX

Download the `.vsix` file from the project's [GitHub Releases page](https://github.com/aiaiai-czh/acsl-toolkit/releases), then run
**Extensions: Install from VSIX...** from the Command Palette and select the
downloaded file.

The command-line equivalent is:

```sh
code --install-extension acsl-toolkit-<version>.vsix
```

ACSL Toolkit requires VS Code 1.85.0 or later. It has no runtime dependency on
Node.js, Frama-C, OCaml, or the Microsoft C/C++ extension.

## Usage

Open a document whose language mode is **C** or **C++**, then write an ACSL
annotation. Common completion examples include:

| Typed prefix | Example results |
|---|---|
| `req` | `requires` |
| `ens` | `ensures` |
| `\va` | `\valid`, `\valid_read` |
| `\res` | `\result` |
| `\fo` | `\forall` |
| `loop inv` | `loop invariant` |

Typing `\` explicitly triggers ACSL completion. Alphabetic suggestions also
follow the user's normal suggestion settings. Use **Trigger Suggest** whenever
you want to open the completion list explicitly.

Completion is intentionally unavailable in ordinary source code, strings, and
ordinary comments:

```c
// ordinary comment
/* ordinary comment */
const char *text = "/*@ not an annotation */";
int requires = 1;
```

### Complete declared parameters and local names

Names declared in the current annotation are offered alongside ACSL vocabulary
entries while they are in scope. For example:

```c
/*@
  predicate positive(integer value) = value > 0;
  logic integer doubled(integer value) = value * 2;
  predicate nonnegative_elements(integer *values, integer length) =
    \forall integer index; 0 <= index < length ==> values[index] >= 0;
*/
```

When writing either definition's body, typing `v` offers its `value` parameter;
inside the quantified expression, `i` offers `index`. The same completion works
for local `\let`, `\exists`, and `\lambda` bindings. Local candidates use the
variable icon and an ACSL detail label. A closer binding shadows an outer name,
and names disappear after their declaration or expression scope ends.

Inductive `case` bodies also offer their own local bindings. Names written in
an `inductive` header are not case parameters; introduce case variables with
quantifiers or `\let` inside each case.

Local completion reads explicit bindings in the current annotation. It does not
look up C/C++ parameters or infer types or validate expressions.
Backslash-prefixed suggestions continue to show ACSL constructs rather than
local variable names. Automatic
display follows your normal suggestion settings; **Trigger Suggest** also
offers these names explicitly.

### Reference user-defined logic and predicates

Completed declarations in the current annotation or a preceding annotation can
be completed when writing another specification in the same document. For
example:

```c
/*@
  predicate positive(integer value) = value > 0;
  logic integer doubled(integer value) = value * 2;
*/

/*@
  requires positive(input);
  ensures doubled(input) > input;
*/
int inspect_positive(int input);
```

Typing `po` in the contract offers `positive`, with the call template
`positive(${1:value})`; typing `dou` offers `doubled(${1:value})`. Argument
names come from the declaration, not from inferred values at the call site.
Declared logic labels also receive editable placeholders; no concrete label is
selected automatically.
Existing parentheses and arguments are left unchanged. Declarations without a
parameter list insert their name (plus declared label placeholders, if any); explicit empty parameter lists insert
`name()`.

Overloaded declarations show separate signatures without choosing an overload
by type. A visible local variable with the same name takes precedence. A
completed definition header enables recursive references, and completed
declarations later in the same annotation support mutually recursive calls.
This also covers predicates defined with `inductive`. Declarations in later annotations and names from other documents or included
files are not looked up. Commented-out declarations and marker-like text in
ordinary C/C++ comments or strings are ignored.

### Comment ACSL clauses

Inside a `/*@ ... */` annotation, place the cursor on a clause line or select
several clause lines, then run VS Code's built-in **Toggle Line Comment** action
(`Ctrl+/` on Windows/Linux or `Cmd+/` on macOS). VS Code inserts `//` while
preserving the surrounding ACSL annotation:

```c
/*@
  // requires old_condition;
  ensures new_condition;
*/
```

The commented clause receives an ordinary comment scope, uses the theme's normal
comment styling, and does not receive ACSL completion. Run **Toggle Line
Comment** again to restore the clause. ACSL Toolkit intentionally provides only
`//` line comments inside annotations: nested `/* ... */` block comments are not
supported because C and C++ block comments do not nest.

## Snippets

Completion entries and snippets are presented as one candidate rather than as
duplicate keyword and snippet entries. For example, accepting `requires`
inserts a predicate placeholder:

```acsl
requires ${1:predicate};
```

Block-shaped declarations create the corresponding lines and braces:

```acsl
axiomatic ${1:name} {
  ${2:declarations}
}
```

All 48 callable built-in entries in the bundled ACSL 1.24 catalog include
argument placeholders. This category includes logic functions as well as
special callable constructs such as `\old` and `\at`. For example, accepting
`\max` inserts:

```acsl
\max(${1:x}, ${2:y})
```

Other examples include `\at(expression, label)`,
`\sum(lower, upper, function)`, `\base_addr(pointer)`,
`\nth(sequence, index)`, `\atan2(y, x)`, and `real_of_float(value)`.
Variadic functions such as `\union` use a single list placeholder. Optional
logic labels are not guessed. The two-argument form is the default for `\max`
and `\min`; ACSL's three-argument bounded higher-order form remains available
by editing the inserted call. If an argument list already follows the
completion prefix, the extension completes only the built-in name and leaves
those arguments intact, including calls with an existing `{label}` or `<type>`
argument.

The extension supplies editable placeholders only. It never infers predicates,
types, variables, function contracts, or program semantics.

## Compatibility and current scope

- The completion provider is registered for the VS Code language IDs `c` and
  `cpp`. Header files work when VS Code classifies them as either language.
- C++ documents receive the shared ACSL 1.24 vocabulary. This is not a claim of
  complete ACSL++ support.
- The vocabulary catalog covers the core clauses, declarations, logic types,
  multi-word constructs, and built-ins used by the editor features. It does not
  yet claim exhaustive coverage of every ACSL 1.24 production. Known lexical
  gaps include module/import constructs, `\as`, and special pattern wildcard
  completion.
- The active color theme decides the final colors of TextMate scopes. ACSL
  Toolkit does not override theme colors.
- VS Code may merge results from multiple completion providers. This extension
  controls only its own ACSL candidates.
- Extensions or user settings that remap C/C++ files to another language ID can
  prevent ACSL Toolkit from activating for those files.

The extension is designed as one platform-neutral Web Extension bundle for
desktop VS Code, Remote/Codespaces, and browser-based VS Code hosts. See the
[compatibility guide](docs/compatibility.md) for the detailed support boundary.

## What this extension does not do

ACSL Toolkit does not provide an ACSL parser, AST, semantic type inference,
diagnostics, proof obligations, WP integration, Frama-C execution, navigation,
or automatic contract generation. It also does not implement C/C++ IntelliSense.

## Privacy and workspace safety

The extension does not collect telemetry, make network requests, start external
processes, or enumerate or open other workspace files. Completion processes
only the active document text supplied by VS Code locally and in memory. Clause
commenting is performed by VS Code's built-in editor action and supports normal
undo. The extension supports untrusted and virtual workspaces without requesting
additional trust.

## Support and development

Troubleshooting and responsible issue-reporting guidance is provided in
[SUPPORT.md](SUPPORT.md). Contributor setup, tests, and maintenance procedures
are kept separately in [CONTRIBUTING.md](CONTRIBUTING.md).

## License

Original implementation code is available under the MIT License. The versioned
ACSL vocabulary is independently selected and reorganized from the ACSL 1.24
specification, whose source material is licensed under CC BY 4.0. Attribution,
source details, and modification notices are recorded in
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
