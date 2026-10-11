# Release procedure

This document is for maintainers. Never commit Marketplace credentials,
publisher account details, local paths, or private test data.

## External identity setup

The source repository is `aiaiai-czh/acsl-toolkit`. The following external
values must still be created or confirmed by the repository owner before the
first public release:

- the Visual Studio Marketplace publisher ID;
- optionally, an Open VSX namespace;
- a protected GitHub `release` environment;
- a GitHub environment variable named `VSCODE_PUBLISHER` containing only the
  public Marketplace publisher ID.

Before release, confirm that `package.json` still contains the registered
publisher and accurate `repository`, `homepage`, and `bugs` URLs. Do not commit
placeholder URLs or a publisher ID that has not been registered and verified by
the owner.

Use a normal branch push for the initial publication. Do not upload the working
directory as an archive, include `.git`, or use `git push --mirror`; development
environments can contain local tool refs that are unrelated to the public
project.

## Release prerequisites

- The public README describes shipped user features rather than build history.
- `CHANGELOG.md` contains a heading for the manifest version with the real
  release date instead of `Unreleased`.
- The Marketplace publisher and repository metadata pass
  `npm run validate:release`.
- The icon and all user-facing notices are present in the VSIX.
- Source validation, unit tests, grammar tests, and the extended integration
  workflow pass for the release commit.
- The exact candidate VSIX completes the applicable manual checklist.
- No ignored local directory, log, environment file, credential, private source
  fixture, or editor profile is staged.

## Build one artifact

From a clean checkout with Node.js 22:

```sh
npm ci
npm run check
npm run test
npm run bundle
npm run package
```

Inspect the package before installation:

```sh
npx @vscode/vsce ls --no-dependencies
```

Install the resulting VSIX with `code --install-extension <file>.vsix` or
**Extensions: Install from VSIX...**. Do not rebuild separately for an operating
system or registry: the extension is a platform-neutral browser bundle.

## Validate release metadata

Run the release-only checks with the confirmed public publisher ID:

```sh
EXPECTED_VSCODE_PUBLISHER=<publisher-id> npm run validate:release
```

This check intentionally fails when repository metadata is invalid, the current
version remains marked `Unreleased`, the icon is missing, or the supplied
publisher differs from `package.json`. Those failures are release gates, not
values to bypass with placeholders.

## Automated GitHub release

Create and push a protected `v<version>` tag only after the release validation
passes. The workflow:

1. verifies that tag and manifest versions match;
2. validates release metadata against the protected environment variable;
3. validates, tests, and packages the tagged source;
4. requires exactly one VSIX;
5. creates a SHA-256 checksum; and
6. publishes both files as a GitHub Release and workflow artifact.

The current workflow creates a GitHub Release but does not upload to an extension
registry. Registry authority remains a separately configured deployment step.

## Visual Studio Marketplace

For the first release, the lowest-risk path is to download the exact VSIX from
the GitHub Release and upload it through the Marketplace publisher management
portal. This keeps the tested artifact identical to the published artifact.

For later automation, configure a Marketplace trusted-publishing policy for the
repository and protected environment. Use a separate GitHub Actions publish job
with only `contents: read` and `id-token: write`, download the already-built
VSIX, and publish it with:

```sh
npx @vscode/vsce publish --packagePath <file>.vsix --oidc
```

Do not add a long-lived Marketplace token or PAT to the repository, workflow
variables, npm configuration, logs, or artifacts. Trusted-publishing setup is
external account state and must not be represented by invented IDs in source.

Official guidance:

- <https://code.visualstudio.com/api/working-with-extensions/publishing-extension>
- <https://github.com/microsoft/vscode-vsce#trusted-publishing>

## Open VSX

Open VSX is optional for the initial release. Once its namespace and publishing
policy are configured, publish the exact VSIX attached to the GitHub Release
rather than rebuilding it. Keep registry credentials and identity configuration
in a protected deployment environment, never in the repository.

## Post-release verification

Install from each public listing rather than from the local build. Confirm the
published version, publisher, checksum provenance, README rendering, icon,
language-ID coexistence, highlighting, completion, snippets, and browser-host
behavior. Record only non-sensitive environment information in the manual
checklist or release notes.
