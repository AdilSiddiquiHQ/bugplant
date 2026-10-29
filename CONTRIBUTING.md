# Contributing to bugplant

Thank you for helping make test suites honest.

`bugplant` has a single purpose: measure whether tests notice when bugs are planted in changed code.

## Getting started

```bash
git clone https://github.com/AdilSiddiquiHQ/bugplant.git
cd bugplant
npm test
```

There are zero dependencies, no build step, and no compilation. Node 20 or newer.

## Project layout

```
bin/bugplant.js        CLI argument parsing, help, and exit codes
lib/tokenize.js        JS/TS tokenizer (skips strings, comments, regex, templates)
lib/mutate.js          Mutation operators, PRNG (mulberry32), and deterministic sampling
lib/gitdiff.js         git diff -U0 parser for added line ranges
lib/graph.js           Reverse import dependency graph and test selector
lib/runner.js          Test execution and pass / fail / timeout / invalid classification
lib/engine.js          Orchestrator: baseline gate, test runner loop, safe restore
lib/report.js          Terminal and JSON formatters, score calculation
lib/config.js          .bugplant.json loader and generator
lib/color.js           Zero-dep ANSI terminal styling
action.yml             Composite GitHub Action entry point
scripts/bugplant.sh    Strict shell entry point for the GitHub Action
scripts/demo.mjs       Isolated test repo generator that produces the README demo
scripts/make-gifs.mjs  macOS Quick Look + ffmpeg animation generator
test/*.test.js         node:test test suites
examples/shop          Deliberately weak test suite demo (scores 44%)
examples/shop-strict   Tight test suite demo (scores 92%)
```

## Adding or updating a mutation operator

Every operator must represent a **deliberate, named defect** that any reviewer would consider a real bug. We do not generate arbitrary syntax permutations.

If you propose a new operator:
1. It must produce a valid change in code that cannot be caught simply by standard linting.
2. It must be added to `lib/mutate.js` under an appropriate family.
3. Every family must be listed in `README.md` (enforced by `test/package.test.js`).
4. Unit tests must be added to `test/mutate.test.js`.

## Invariants that must never regress

The test suite enforces several hard invariants:

- **Zero dependencies:** `dependencies` and `devDependencies` in `package.json` must remain empty objects.
- **Measured reality:** Never claim a number in documentation that is not produced by code. The README demo block is executed and compared byte-for-byte in `test/readme.test.js`.
- **Badge count:** Exactly 8 badges in `README.md`. A wall of badges is noise.
- **Strict shell:** The GitHub Action delegates to `scripts/bugplant.sh` with `set -euo pipefail`. No inline multi-line scripts in `action.yml`.
- **Determinism:** Seeded sampling must always return identical mutants for the same input and seed.

## Running tests

```bash
npm test        # Run all 72+ unit and end-to-end tests
npm run check   # Fast invariant checks (package, README, assets)
npm run demo    # Run the demo example
```

## Pull requests

- One focused change per PR.
- Ensure all tests pass with `npm test`.
- Keep diffs minimal and preserve zero-dependency architecture.
