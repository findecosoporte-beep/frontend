#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

# Nixpacks monta caché en node_modules/.cache; npm ci falla con EBUSY si usa esa ruta.
export NPM_CONFIG_CACHE="${NPM_CONFIG_CACHE:-/tmp/npm-cache}"
mkdir -p "$NPM_CONFIG_CACHE"

# Vite está en devDependencies; en Railway NODE_ENV=production hay que incluirlas.
npm ci --include=dev
npm run build
