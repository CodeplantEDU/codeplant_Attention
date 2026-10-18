#!/bin/bash
cd "$(dirname "$0")" || exit 1
if ! command -v node >/dev/null 2>&1; then
  echo 'Node.js 22+ is required: https://nodejs.org/'
  exit 1
fi
exec node tools/local.mjs
