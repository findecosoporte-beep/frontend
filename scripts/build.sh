#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

# Dependencies (including devDependencies) are installed by Nixpacks install phase.
# See nixpacks.toml [phases.install] for the install command.
npm run build
