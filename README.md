# shared github workflows

## Usage

In your workflow do something like:

```yaml
jobs:
  the-job:
    uses: neticdk/shared-github-actions/.github/workflows/the-flow.yml@main
    with:
      my-input: my-value
```
