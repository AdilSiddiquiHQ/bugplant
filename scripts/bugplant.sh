#!/usr/bin/env bash
# The GitHub Action entry point.
#
# All logic lives here, not in action.yml. An action that inlines shell in YAML
# cannot be tested, reviewed, or run locally, and this repository's whole claim
# is that things are tested.
set -euo pipefail

since="${INPUT_SINCE:-origin/main}"
max="${INPUT_MAX:-12}"
min_score="${INPUT_MIN_SCORE:-0}"
test_command="${INPUT_TEST_COMMAND:-}"
timeout="${INPUT_TIMEOUT:-30000}"
seed="${INPUT_SEED:-1}"

args=(--since "$since" --max "$max" --min-score "$min_score" --timeout "$timeout" --seed "$seed")

if [ -n "$test_command" ]; then
  args+=(--test-command "$test_command")
fi

if [ "${INPUT_ALL:-false}" = "true" ]; then
  args+=(--all)
fi

echo "bugplant --since $since --max $max --min-score $min_score"
node "$(dirname "$0")/../bin/bugplant.js" "${args[@]}"
