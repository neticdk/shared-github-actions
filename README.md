# Shared GitHub workflows

Reusable workflows for testing and releasing Go projects:

- [Go CI](.github/workflows/go-ci.yaml): tests, linting, security scans, and optional coverage reports.
- [Go CD](.github/workflows/go-cd.yaml): releases with GoReleaser v2 and support for publishing container images to GHCR.

## Go CI

Add `.github/workflows/ci.yaml` to your repository:

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

permissions:
  contents: read
  actions: read
  pull-requests: write

jobs:
  ci:
    uses: neticdk/shared-github-actions/.github/workflows/go-ci.yaml@main
    secrets: inherit
```

By default, CI downloads and verifies dependencies, runs tests with coverage,
uploads a `code-coverage` artifact, and runs golangci-lint, gosec, govulncheck,
and Trivy. Security scan failures fail CI. Trivy ignores vulnerabilities
without a fix.

For a module in a subdirectory, or to enable optional checks, add `with` to the
calling job:

```yaml
jobs:
  ci:
    uses: neticdk/shared-github-actions/.github/workflows/go-ci.yaml@main
    secrets: inherit
    with:
      workdir: services/api
      run-benchmarks: true
      run-coverage-report: true
      run-release-test: true
```

Coverage reports run only on pull requests. The coverage artifact is uploaded
regardless of `run-coverage-report`. Despite its name, `run-release-test` runs
`goreleaser check` to validate configuration; it does not build a release dry-run.

### CI inputs

All inputs are optional.

| Input | Type | Default | Description |
| --- | --- | --- | --- |
| `runs-on` | string | `ubuntu-latest` | Runner for CI jobs, except coverage reporting, which always uses `ubuntu-latest`. |
| `go-version` | string | Unset | Go version override. Otherwise, setup reads `go.mod` in `workdir`. |
| `go-private` | string | `github.com/containdk,github.com/neticdk,github.com/neticdk-k8s` | Value of `GOPRIVATE`. |
| `workdir` | string | `.` | Project directory relative to the repository root. |
| `run-benchmarks` | boolean | `false` | Run Go benchmarks after tests. |
| `run-release-test` | boolean | `false` | Validate GoReleaser configuration in `workdir`. |
| `run-govulncheck` | boolean | `true` | Run govulncheck. |
| `govulncheck-fail` | boolean | `true` | Fail CI when govulncheck exits unsuccessfully. Set to `false` to emit a warning instead. |
| `run-gosec` | boolean | `true` | Run gosec in `workdir`, built with the selected Go toolchain. |
| `run-trivy-scan` | boolean | `true` | Scan `workdir` with Trivy. |
| `run-coverage-report` | boolean | `false` | Report coverage on pull requests. |
| `run-free-disk-space` | boolean | `false` | Free disk space in the tests job on an Ubuntu runner. |

Tests, golangci-lint, and gosec use `GOEXPERIMENT=jsonv2`. Choose a Go version
that supports this experiment. gosec is installed from source with the project's
selected Go toolchain and scans from `workdir`.

## Go CD

Add `.github/workflows/release.yaml` to release when a version tag is pushed:

```yaml
name: Release

on:
  push:
    tags: ['v*']

permissions:
  contents: write
  packages: write

jobs:
  release:
    uses: neticdk/shared-github-actions/.github/workflows/go-cd.yaml@main
    secrets: inherit
```

The project needs a GoReleaser v2 configuration in `workdir`. Configure its
builds, release artifacts, container images, and Homebrew publishing as needed.
The workflow checks out the full Git history, logs in to `ghcr.io`, sets up QEMU
and Docker Buildx, and runs `goreleaser release --clean --verbose`.

Releases run on `ubuntu-latest` with `GOEXPERIMENT=jsonv2`. For a project in a
subdirectory, set `with.workdir` on the calling job, as in the CI example.

### CD inputs

All inputs are optional.

| Input | Type | Default | Description |
| --- | --- | --- | --- |
| `go-version` | string | Unset | Go version override. Otherwise, setup reads `go.mod` in `workdir`. |
| `go-private` | string | `github.com/containdk,github.com/neticdk,github.com/neticdk-k8s` | Value of `GOPRIVATE`. |
| `workdir` | string | `.` | Project directory containing the Go module and GoReleaser configuration. |
| `run-free-disk-space` | boolean | `false` | Free disk space before the release. |

## Secrets and permissions

Both workflows accept the following optional secrets. Pass them explicitly or
use `secrets: inherit`, as in the examples above.

| Secret | Purpose | Fallback |
| --- | --- | --- |
| `gh_username` | GitHub username for private module access over HTTPS. | `gh-netic-robot` |
| `gh_token` | Token with read access to private dependency repositories. | `GH_NETIC_ROBOT_CLASSIC_TOKEN` |
| `GH_NETIC_ROBOT_CLASSIC_TOKEN` | Shared fallback token for private modules and Homebrew publishing. | None |
| `homebrew_token` | CD only: token with write access to the Homebrew tap repository. Passed to GoReleaser as `HOMEBREW_TOKEN`. | `GH_NETIC_ROBOT_CLASSIC_TOKEN` |

For example, replace `secrets: inherit` with an explicit mapping:

```yaml
    secrets:
      gh_username: ${{ secrets.PRIVATE_MODULE_USERNAME }}
      gh_token: ${{ secrets.PRIVATE_MODULE_TOKEN }}
```

Private Git credentials are configured only when both `go-private` and a token
are nonempty. Public projects can omit these secrets. Set `go-private: ''` if
the default private module prefixes do not apply to your project.

The CI example grants `contents: read`, `actions: read`, and
`pull-requests: write` to allow the optional coverage report job. The release
example grants `contents: write` for GitHub releases and `packages: write` for
GHCR publishing. CD uses the automatic `GITHUB_TOKEN` for these operations;
`gh_token` is used for private module access.
