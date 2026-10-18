$ErrorActionPreference = 'Stop'
$nodePath = (Get-Command node.exe -ErrorAction SilentlyContinue).Source
if ($nodePath) { $major = & $nodePath -p 'parseInt(process.versions.node)'; if ([int]$major -lt 22) { $nodePath = $null } }
if (-not $nodePath) { $nodePath = (Get-ChildItem -Path (Join-Path $PSScriptRoot '.local-data\runtime\node\node-v*-win-*\node.exe') -ErrorAction SilentlyContinue | Select-Object -First 1).FullName }
if (-not $nodePath) { throw 'Node.js 22 이상을 설치한 뒤 다시 실행하세요.' }
& $nodePath (Join-Path $PSScriptRoot 'tools\local.mjs')
exit $LASTEXITCODE
