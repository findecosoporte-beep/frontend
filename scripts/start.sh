#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

exec npx serve -s dist -p "${PORT:-3000}"
