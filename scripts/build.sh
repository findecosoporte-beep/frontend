#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

export NPM_CONFIG_CACHE="/tmp/npm-cache"

# Dependencias instaladas en la fase install de nixpacks.toml (npm ci).
npm run build
