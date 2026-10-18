$ErrorActionPreference = 'Stop'
$nodePath = (Get-Command node.exe -ErrorAction SilentlyContinue).Source
if (-not $nodePath) { throw 'Node.js 22 이상을 설치한 뒤 다시 실행하세요.' }
& $nodePath (Join-Path $PSScriptRoot 'tools\local.mjs')
exit $LASTEXITCODE
