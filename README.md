# Shared GitHub workflows

Reusable workflows for testing and releasing Go projects:

- [Go CI](.github/workflows/go-ci.yaml): tests, linting, security scans, and optional coverage reports.
- [Go CD](.github/workflows/go-cd.yaml): releases with GoReleaser v2 and support for publishing container images to GHCR.
- [Container CD](.github/workflows/container-cd.yaml): builds a Dockerfile, pushes the image to GHCR, and signs its build provenance.

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
| `govulncheck-fail` | boolean | `true` | Fail CI when govulncheck reports a vulnerability that has a released fix. Set to `false` to emit a warning instead. |
| `govulncheck-fail-without-fix` | boolean | `false` | Also fail for vulnerabilities that have no released fix. |
| `run-gosec` | boolean | `true` | Run gosec in `workdir`, built with the selected Go toolchain. |
| `run-trivy-scan` | boolean | `true` | Scan `workdir` with Trivy. |
| `trivy-version` | string | `v0.76.1` | Trivy version to scan with. |
| `run-coverage-report` | boolean | `false` | Report coverage on pull requests. |
| `run-free-disk-space` | boolean | `false` | Free disk space in the tests job on an Ubuntu runner. |

Tests, golangci-lint, and gosec use `GOEXPERIMENT=jsonv2`. Choose a Go version
that supports this experiment. gosec is installed from source with the project's
selected Go toolchain and scans from `workdir`. gosec v2.30.0 needs Go 1.26
or later.

govulncheck fails the build for a vulnerability that reaches your code **and
has a released fix**. One with no fix available is reported as a warning
instead, because failing on it blocks every branch in the repository without
offering an action that would clear it, and a red check nobody can clear is one
people learn to ignore. Set `govulncheck-fail-without-fix` to `true` where that
trade is not the right one, such as a repository that must not ship a known
vulnerability at all. Set `govulncheck-fail` to `false` to never fail.

The full text report is printed either way. Classification needs `jq`, which is
present on GitHub-hosted runners; where it is missing the step fails rather than
guessing.

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
  id-token: write
  attestations: write

jobs:
  release:
    uses: neticdk/shared-github-actions/.github/workflows/go-cd.yaml@main
    secrets: inherit
```

All four permissions are required, even for a release without container
images. GitHub refuses to start the workflow when the caller grants less than
its jobs ask for.

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
| `runs-on` | string | `ubuntu-latest` | Runner for the release job. The provenance jobs always run on `ubuntu-latest`. |
| `go-version` | string | Unset | Go version override. Otherwise, setup reads `go.mod` in `workdir`. |
| `go-private` | string | `github.com/containdk,github.com/neticdk,github.com/neticdk-k8s` | Value of `GOPRIVATE`. |
| `workdir` | string | `.` | Project directory containing the Go module and GoReleaser configuration. |
| `run-docker-setup` | boolean | `true` | Log in to `ghcr.io` and set up QEMU and Buildx. Set to `false` for a release that only builds binaries. |
| `run-free-disk-space` | boolean | `false` | Free disk space before the release. |

### Build provenance

Every release gets SLSA build provenance, signed through GitHub artifact
attestations:

- the files listed in GoReleaser's checksums file, such as archives and
  binaries, are attested together from that file;
- every image GoReleaser pushed is attested by digest, and the attestation is
  also pushed to the registry next to the image.

GoReleaser runs in a job that has no OIDC token, so the build cannot sign
anything. Separate jobs receive the checksums and digests from it and sign the
provenance. Because those jobs belong to this reusable workflow and not to the
calling repository, the provenance names this workflow as the builder, which
gives SLSA Build L3.

A release with no `checksum` section in its GoReleaser configuration gets no
provenance for its files. Images are attested only on `ghcr.io`.

Verify a downloaded file or an image:

```sh
gh attestation verify conductor_Linux_x86_64.tar.gz \
  --repo containdk/conductor \
  --signer-workflow neticdk/shared-github-actions/.github/workflows/go-cd.yaml

gh attestation verify oci://ghcr.io/containdk/conductor:v1.2.3 \
  --repo containdk/conductor \
  --signer-workflow neticdk/shared-github-actions/.github/workflows/go-cd.yaml
```

`--signer-workflow` is what checks the builder: it rejects provenance signed by
any other workflow, including one in the project's own repository.

The release job builds from a clean Go module cache, so nothing a previous run
cached can reach a released artifact.

## Container CD

For an image built from a Dockerfile rather than by GoReleaser, add
`.github/workflows/release.yaml`:

```yaml
name: Release

on:
  push:
    tags: ['v*']

permissions:
  contents: read
  packages: write
  id-token: write
  attestations: write

jobs:
  image:
    uses: neticdk/shared-github-actions/.github/workflows/container-cd.yaml@main
    with:
      build-args: |
        VERSION=${{ github.ref_name }}
```

The image is `ghcr.io/<owner>/<repository>` and is tagged with the Git ref name.
A tag without a pre-release suffix, such as `v1.2.3` but not `v1.3.0-rc.1`, is
also pushed as `latest`. The build runs without a cache.

The build job has no OIDC token. A separate job receives the image digest,
signs SLSA build provenance for it through GitHub artifact attestations,
pushes the attestation to the registry beside the image, and signs the image
with cosign. Since the signing job belongs to this reusable workflow, the
provenance names it as the builder, which gives SLSA Build L3. Verify with:

```sh
gh attestation verify oci://ghcr.io/containdk/kube-ovn-edge:v1.2.3 \
  --repo containdk/kube-ovn-edge \
  --signer-workflow neticdk/shared-github-actions/.github/workflows/container-cd.yaml
```

A Dockerfile that needs a secret, such as a token for private Go modules,
mounts it with `RUN --mount=type=secret,id=GITHUB_TOKEN` and gets it through
the `build-secrets` secret:

```yaml
    secrets:
      build-secrets: |
        GITHUB_TOKEN=${{ secrets.GH_NETIC_ROBOT_CLASSIC_TOKEN }}
```

The workflow outputs `image` and `digest` for later jobs, such as one that
packages a Helm chart pointing at the image.

### Container CD inputs

All inputs are optional.

| Input | Type | Default | Description |
| --- | --- | --- | --- |
| `image` | string | `ghcr.io/<owner>/<repository>` | Image to push, without a tag. Must be on `ghcr.io`. |
| `tags` | string | Ref name, plus `latest` for a release tag | Tags to push, one per line. |
| `context` | string | `.` | Build context. |
| `file` | string | `Dockerfile` | Dockerfile, relative to the repository root. |
| `target` | string | Unset | Dockerfile stage to build. |
| `platforms` | string | `linux/amd64,linux/arm64` | Platforms to build for. |
| `build-args` | string | Unset | Build arguments, one `NAME=value` per line. |
| `sbom` | boolean | `false` | Attach a BuildKit SBOM to the image. |
| `sign` | boolean | `true` | Also sign the image with cosign, keyless. |
| `runs-on` | string | `ubuntu-latest` | Runner for the build job. |

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
example grants `contents: write` for GitHub releases, `packages: write` for
GHCR publishing, and `id-token: write` and `attestations: write` for signing
the build provenance. Only the provenance jobs receive `id-token: write`. CD uses the automatic `GITHUB_TOKEN` for these operations;
`gh_token` is used for private module access.
