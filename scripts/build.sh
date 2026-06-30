#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

export NPM_CONFIG_CACHE="/tmp/npm-cache"

# Instalación limpia en Linux: evita caché de node_modules con bindings de otra plataforma (rolldown/vite).
rm -rf node_modules
npm ci --include=dev
npm run build
