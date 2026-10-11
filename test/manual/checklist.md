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
