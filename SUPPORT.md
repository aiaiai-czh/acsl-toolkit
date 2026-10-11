# Support

## Before reporting a problem

1. Confirm that the document's VS Code language mode is **C** or **C++**.
2. Confirm that the cursor is inside `/*@ ... */` or `//@ ...` rather than an
   ordinary comment or string.
3. Run **Trigger Suggest** to distinguish completion behavior from automatic
   suggestion settings.
4. Temporarily disable extensions that remap C/C++ files to another language
   mode.
5. Check the current limitations in `README.md` and `docs/compatibility.md`.

## Reporting a bug

Use the repository's [new issue
form](https://github.com/aiaiai-czh/acsl-toolkit/issues/new/choose) and include:

- ACSL Toolkit version;
- VS Code version and host type (desktop, remote, or browser);
- operating system and architecture when relevant;
- document language mode (`c` or `cpp`);
- a minimal, newly written C/C++ example;
- expected and actual behavior;
- whether **Trigger Suggest** works.

Do not attach proprietary source files, credentials, access tokens, personal
paths, full editor profiles, or unrelated logs. Remove names and internal paths
from screenshots and diagnostic output.

## Feature requests

Feature requests are welcome when they fit syntax highlighting, lexical
completion, snippets, compatibility, or catalog maintenance. Parser, semantic
analysis, proof, diagnostics, and automatic contract generation requests are
outside the current project scope.

## Security reports

Do not disclose a suspected vulnerability or credential in a public issue. Use
the private reporting process described in `SECURITY.md` in the source
repository.
