# Release Manager

MeteorVoice uses `Release Manager` to turn the release flow into one manual GitHub Actions run.

## Entry Point

Open:

```text
GitHub -> Actions -> Release Manager -> Run workflow
```

Inputs:

- `version`: semantic version without the `v` prefix, for example `1.3.1`.
- `action`:
  - `full`: prepare version files, promote `main` to `release`, wait for Tencent deployment, verify URLs, and create the GitHub Release.
  - `prepare`: only create and merge the version/release-note PR into `main`.
  - `promote`: only create and merge the `main` -> `release` PR, deploy, and create the GitHub Release.
  - `verify`: only check the production and preview URLs.

## Required Secret

For true one-click releases, configure repository secret `RELEASE_MANAGER_TOKEN` with a fine-grained GitHub token that can read/write contents, issues, pull requests, actions, and releases for this repository.

The workflow falls back to `GITHUB_TOKEN` if the secret is missing, but GitHub may not trigger follow-up CI checks for branches pushed by `GITHUB_TOKEN`. In that fallback mode, use `prepare` and `promote` as recovery steps instead of expecting a fully unattended release.

## What Full Release Does

1. Checks that tag `v<version>` does not already exist.
2. Creates or reuses a release tracking issue.
3. Creates a release preparation branch from `origin/main`.
4. Updates package versions and creates `docs/releases/v<version>.md` when needed.
5. Opens a PR into `main`, waits for checks, and merges it.
6. Opens a PR from `main` into `release`, waits for checks, and merges it.
7. Waits for the Tencent release deployment workflow.
8. Creates GitHub Release `v<version>`.
9. Verifies the public URLs.

The workflow keeps the existing branch protection model. It does not push directly to `main` or `release`.

## Local Recovery

If a run stops after one phase, continue locally or from Actions:

```bash
node scripts/release-manager.mjs prepare --version 1.3.1
node scripts/release-manager.mjs promote --version 1.3.1
node scripts/release-manager.mjs verify --version 1.3.1
```
