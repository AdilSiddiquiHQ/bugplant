# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-10-29

Initial release. Diff-scoped, sampled mutation testing for JavaScript and TypeScript.

### Added

- **Diff-scoped mutations:** Targets only added lines extracted from `git diff -U0 <base>`, keeping mutation testing fast and focused on the code under review.
- **6 mutation operator families:** Deliberate bug planting across `relational` (`<`, `<=`, `>`, `>=`, `===`, `!==`, `==`, `!=`), `arithmetic` (`+`, `-`, `*`, `/`, `%`), `logical` (`&&`, `||`), `boolean` (`true`, `false`), `literal` (numbers by ±1, non-empty strings to `""`), and `increment` (`++`, `--`).
- **Deterministic seeded sampling:** Uses a 32-bit `mulberry32` PRNG so runs are fully reproducible in CI and locally given the same `--seed`.
- **Reverse import dependency graph:** Statically discovers which test files import the mutated code to run only relevant tests, with graceful fallback to the entire test suite when graph resolution is ambiguous.
- **Baseline gate:** Verifies the test suite passes before mutating anything; halts cleanly with exit code 2 if baseline is red.
- **Safe rollback:** Always restores files to their original state in a `finally` block and under `SIGINT`/`SIGTERM` process interruptions.
- **Child process isolation:** Cleans child environment variables (such as `NODE_TEST_CONTEXT`) to ensure nested test runner accuracy.
- **Comprehensive reporting:** Clear terminal output with ASCII bar charts, survivor line citations, and structured `--json` output.
- **Zero runtime dependencies:** Built entirely with Node.js built-in modules (`node:fs`, `node:child_process`, `node:path`, `node:test`).
- **Composite GitHub Action:** Ready-to-use GitHub Action (`action.yml`) with strict POSIX shell runner (`scripts/bugplant.sh`).
- **Interactive initialization:** `bugplant --init` creates a starter `.bugplant.json` without overwriting existing configuration.
- **Runnable examples:** `examples/shop` (weak suite producing 44% score with 5 survivors) and `examples/shop-strict` (strict assertions producing 92% score with 1 survivor).
