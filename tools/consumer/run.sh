#!/usr/bin/env bash
# Copyright Dokimasia B.V. 2026
# SPDX-License-Identifier: MIT

# Installs the packed library into an empty project beside one runner, as a
# consumer installs it, and checks the project: tsc compiles the type probes
# of the runner with skipLibCheck off, and the runner runs one test file
# that registers the matchers in its setup file.
#
# Usage: tools/consumer/run.sh vitest4|vitest5|jest29|jest30 [dir]
#
# The project is created in dir, a new temporary directory by default. The
# library must be built first.
set -euo pipefail

kind="${1:?usage: tools/consumer/run.sh vitest4|vitest5|jest29|jest30 [dir]}"
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
probes="$root/tools/consumer"
dir="${2:-$(mktemp -d)}"

case "$kind" in
  vitest4) runner="vitest@^4.1.11"; extra=() ;;
  vitest5) runner="vitest@^5.0.3"; extra=() ;;
  jest29) runner="jest@^29.7.0"; extra=("@types/jest@^29.5.14") ;;
  jest30) runner="jest@^30.5.2"; extra=("@types/jest@^30.0.0") ;;
  *) echo "run.sh: no consumer named $kind" >&2; exit 2 ;;
esac

mkdir -p "$dir"
tarball="$(cd "$root" && npm pack --silent --pack-destination "$dir")"
cd "$dir"
npm init -y --silent > /dev/null
npm pkg set type=module
npm install --silent --no-audit --no-fund "./$tarball" "$runner" "${extra[@]}" \
  "typescript@^7.0.2" "@types/node@^26.4.0"

case "$kind" in
  vitest*)
    cp "$probes/vitest/vitest.config.ts" "$probes/vitest/probe.test.ts" \
      "$probes/vitest/types.ts" "$probes/vitest/tsconfig.json" .
    cp "$probes/vitest/$kind.setup.ts" vitest.setup.ts
    # The binaries of the project run on the node of the PATH, as a
    # consumer's scripts run them.
    node_modules/.bin/tsc -p tsconfig.json
    node_modules/.bin/vitest run
    ;;
  jest*)
    cp "$probes/jest/jest.config.cjs" "$probes/jest/jest.setup.cjs" \
      "$probes/jest/probe.test.cjs" "$probes/jest/globals.types.ts" \
      "$probes/jest/global.types.ts" "$probes/jest/tsconfig.json" .
    node_modules/.bin/tsc -p tsconfig.json
    node_modules/.bin/jest
    ;;
esac
echo "run.sh: $kind installs, compiles and runs in $dir"
