# Manual release checklist

Record the VS Code version, operating system/architecture, extension version,
theme, and C/C++ extension version with each run. Complete this checklist using
the exact VSIX proposed for release.

## Package integrity

- [ ] `npm ci` succeeds from a clean checkout with Node.js 22.
- [ ] `npm run check`, unit tests, grammar tests, and bundle all pass.
- [ ] `npm run package` produces one platform-neutral VSIX.
- [ ] `npm run validate:package-contents` accepts the exact package allowlist.
- [ ] The VSIX contains the extension bundle, grammars, icon, manifest, README,
      support guide, changelog, license, and third-party notice.
- [ ] The VSIX does not contain source, tests, `.github`, catalog source data,
      development configuration, native modules, credentials, or source maps.
- [ ] The SHA-256 digest matches the release checksum after download.

## Public repository hygiene

- [ ] `AGENTS.md`, `.agents/`, `.aws/`, `.codex/`, environment files, logs,
      dependencies, test hosts, coverage, bundles, and local VSIX files are not
      staged.
- [ ] Public documentation contains no local absolute path, username, private
      email address, credential, token, or proprietary source sample.
- [ ] `README.md` describes shipped user behavior; build and release procedures
      remain in contributor and maintainer documentation.
- [ ] The public repository was pushed as a normal branch, not as a workspace
      archive or a mirror of local tool refs.

## Language ownership and coexistence

- [ ] A `.c` file remains language id `c`.
- [ ] A `.cpp` file remains language id `cpp`.
- [ ] A `.h` file works when its selected language mode is C.
- [ ] A `.h` file works when its selected language mode is C++.
- [ ] Microsoft C/C++ completion still works in a function body.
- [ ] Include, member-access, definition, and hover behavior from C/C++ remains
      available outside annotations.
- [ ] An ordinary line comment returns no ACSL completion.
- [ ] An ordinary block comment returns no ACSL completion.
- [ ] Normal source code returns no ACSL completion.

## Highlighting

- [ ] `/*@ requires x > 0; */` injects ACSL scopes in C.
- [ ] The same block injects ACSL scopes in C++.
- [ ] A multi-line block highlights until `*/`.
- [ ] An unfinished block highlights through EOF.
- [ ] `//@ assert x > 0;` highlights only to line end.
- [ ] A `// requires x > 0;` clause inside `/*@ ... */` uses the same comment
      styling as an ordinary line comment; `requires` is not highlighted as an
      ACSL keyword.
- [ ] A marker inside an ordinary string, raw string, character literal, or
      ordinary comment does not begin an annotation.
- [ ] Keywords, logic types, built-ins, operators, and punctuation remain
      readable in built-in Dark+ and Light+ themes.
- [ ] Repeat the theme check with one widely used third-party theme.

## Completion and snippets

- [ ] `req` offers `requires` in a block annotation.
- [ ] `ens` offers `ensures` in a line annotation.
- [ ] `\va` offers `\valid` and `\valid_read` without inserting `\\`.
- [ ] `\res` offers `\result`.
- [ ] `\fo` offers `\forall`.
- [ ] `\ma` offers one `\max` candidate and inserts `\max(x, y)` with two Tab
      stops; `\mi` behaves equivalently for `\min`.
- [ ] Representative state, aggregate, memory, list, mathematical, and
      floating-point functions insert their audited arguments: `\at`, `\sum`,
      `\base_addr`, `\nth`, `\atan2`, and `\round_float`.
- [ ] Unary functions such as `\abs` insert one Tab stop in block and line
      annotations.
- [ ] Plain-word functions such as `pow` and `real_of_float` insert parameter
      snippets without requiring a leading backslash.
- [ ] Variadic `\union` and `\inter` snippets expose one editable set-list
      placeholder rather than guessing the number of arguments.
- [ ] A callable built-in completion preserves a following semicolon.
- [ ] If `\max` is followed by an existing argument list, completion replaces
      only the name and does not duplicate parentheses or parameters.
- [ ] Existing optional arguments such as `\base_addr{Old}(p)` and
      `\Cons<A>(head, tail)` are preserved without inserting a second call.
- [ ] `\valid` sorts before `\valid_read` for the shared prefix.
- [ ] `loop inv` replaces the entire partial phrase.
- [ ] A clause with a snippet appears once, not as duplicate keyword/snippet
      candidates.
- [ ] `axiomatic` inserts a name placeholder and a newline-delimited `{ ... }`
      block.
- [ ] `predicate` and `logic` expose name, parameter, type/term, and predicate
      placeholders in Tab order.
- [ ] `lemma` and `axiom` expose name and predicate placeholders and end with
      one semicolon.
- [ ] `behavior` inserts its name and starts its clauses on the following line
      without adding non-standard braces.
- [ ] `inductive` inserts a newline-delimited block containing a `case`
      template.
- [ ] In `//@`, block templates remain available but fold to one physical line
      so no snippet content escapes the annotation.
- [ ] Snippet placeholders can be traversed with Tab and undone in one action.
- [ ] A semicolon already following the cursor is not duplicated.
- [ ] Typing `\` triggers suggestions.
- [ ] Explicit `Trigger Suggest` works for alphabetic prefixes.
- [ ] Empty-prefix suggestions are bounded and remain responsive.
- [ ] Multi-cursor insertion has predictable replacement ranges.

## Parameters and local names

- [ ] In a `predicate` or `logic` body with parameter `value`, typing `v`
      offers an ACSL variable candidate; explicit **Trigger Suggest** does too.
- [ ] `inductive` header parameter names do not appear in its `case` bodies;
      variables bound by a case's own quantifiers or `\let` do appear.
- [ ] `\let`, `\forall`, `\exists`, and `\lambda` names are available only
      in their respective bodies, including nested binders.
- [ ] Multiple typed names and pointer parameters retain their declared names.
- [ ] A closer same-name binding shadows the outer one without duplicate ACSL
      variable candidates; the outer name is restored after leaving the scope.
- [ ] Local names disappear after a definition, clause, parenthesized binder
      expression, or annotation ends.
- [ ] Local candidates coexist with matching catalog candidates and do not
      appear for backslash-prefixed requests.
- [ ] Accepting a local completion mid-word replaces the whole identifier and
      preserves a following semicolon.
- [ ] No local candidates appear inside strings or commented-out clause lines.
- [ ] Repeat parameter and binding checks in C, C++, block annotations, and
      `//@` annotations.

## User-defined logic and predicates

- [ ] A `predicate` or `logic` declared in an earlier annotation is offered from
      its first matching letter in later contracts and assertions.
- [ ] Accepting a callable name inserts declaration-based argument placeholders
      in the declared order; Tab moves through the placeholders normally.
- [ ] Declared logic labels receive editable placeholders without guessing
      which program state should be passed at the call site.
- [ ] A completed header enables recursive references from its own body; later
      complete declarations in the same annotation allow mutual recursion.
- [ ] Declarations in later annotations and incomplete headers are not offered.
- [ ] Distinct overloads display separate signatures; a repeated declaration
      and definition of one signature do not create duplicate candidates.
- [ ] A visible same-name local variable takes precedence over a callable.
- [ ] Existing call parentheses, arguments, labels, types, and following
      punctuation are preserved when completing a name, including mid-word.
- [ ] Declarations without a parameter list insert a plain name; declarations
      with an explicit empty parameter list insert `name()`.
- [ ] Names from ordinary code, ordinary comments, strings, raw strings, and
      disabled `//` declarations are not indexed.
- [ ] Editing or removing a declaration updates suggestions; other open
      documents and included files do not contribute ACSL document candidates.
- [ ] Repeat document-name checks in C, C++, untitled documents, block
      annotations, and line annotations.

## Editing boundaries

- [ ] Completion works before the closing delimiter of an annotation and stops
      immediately after it.
- [ ] Completion works in an unfinished block annotation.
- [ ] A `//@` annotation does not continue onto the next physical line.
- [ ] LF and CRLF documents behave identically.
- [ ] Multiple annotations in one file use the annotation containing the cursor.
- [ ] Escaped quotes and C++ raw-string custom delimiters do not confuse context
      detection.
- [ ] Inside `/*@ ... */`, VS Code's **Toggle Line Comment** (`Ctrl+/` on
      Windows/Linux, `Cmd+/` on macOS) inserts `//` on the selected clause
      line or lines without changing the outer annotation delimiters.
- [ ] A clause commented with `//` uses ordinary comment colors and receives no
      ACSL completion in Dark+, Light+, and the selected third-party theme.
- [ ] Running **Toggle Line Comment** again restores the clause and ACSL
      highlighting/completion.
- [ ] Multi-line and multi-cursor line-comment edits can be reverted normally
      with Undo.
- [ ] The extension does not offer nested `/* ... */` comments inside a block
      annotation, and `*/` still closes the outer annotation.
- [ ] VS Code's normal C/C++ **Toggle Line Comment** behavior remains unchanged
      outside ACSL annotations.
- [ ] A representative 1 MiB source file has no perceptible suggestion delay.

## Host and platform coverage

- [ ] Install and smoke-test on Windows x64.
- [ ] Install and smoke-test on Windows ARM64.
- [ ] Install and smoke-test on Linux x64.
- [ ] Install and smoke-test on Linux ARM64.
- [ ] Install and smoke-test on macOS Intel.
- [ ] Install and smoke-test on macOS Apple Silicon.
- [ ] Test in a browser Extension Host.
- [ ] Test a virtual workspace in vscode.dev or github.dev.
- [ ] Test a Codespace or equivalent remote workspace.
- [ ] Confirm the extension neither requests workspace trust nor starts a
      process or network connection.

## Publication

- [ ] `package.json` version equals the `v*` tag without the leading `v`.
- [ ] `package.json` contains the confirmed publisher and accurate repository,
      homepage, and issue-tracker URLs.
- [ ] `CHANGELOG.md` has a dated heading for the released version.
- [ ] `npm run validate:release` passes with the protected publisher value.
- [ ] README and changelog describe the shipped behavior and known limits.
- [ ] `LICENSE` and `THIRD_PARTY_NOTICES.md` are included in the VSIX.
- [ ] Marketplace publisher/identity configuration targets the intended
      publisher and uses a protected release environment.
- [ ] Upload exactly the tested VSIX to Visual Studio Marketplace.
- [ ] If Open VSX is enabled, upload that same VSIX rather than rebuilding it.
- [ ] Install the public listing once and repeat a minimal C/C++ coexistence test.
