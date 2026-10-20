#!/bin/sh
cd "$(dirname "$0")" || exit 1
if ! command -v node >/dev/null 2>&1; then
  echo 'Node.js 22 이상이 필요합니다. https://nodejs.org/en/download 에서 설치하세요.'
  exit 1
fi
node tools/local.mjs
