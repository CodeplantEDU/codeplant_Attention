$ErrorActionPreference = 'Stop'
$appDir = $PSScriptRoot
$url = 'http://127.0.0.1:49321'
$healthy = $false
try { $result = Invoke-RestMethod -Uri "$url/api/health" -TimeoutSec 2; $healthy = $result.service -eq 'codeplant-ai-dialogue' } catch {}
if (-not $healthy) {
    $nodePath = (Get-Command node.exe -ErrorAction SilentlyContinue).Source
    if (-not $nodePath) { throw 'Node.js 22 이상을 설치한 뒤 다시 실행하세요.' }
    $logDir = Join-Path $appDir 'data'
    New-Item -ItemType Directory -Path $logDir -Force | Out-Null
    Start-Process -FilePath $nodePath -ArgumentList @('"' + (Join-Path $appDir 'server.mjs') + '"') -WorkingDirectory $appDir -WindowStyle Hidden -RedirectStandardOutput (Join-Path $logDir 'server.log') -RedirectStandardError (Join-Path $logDir 'server-error.log')
    for ($attempt = 0; $attempt -lt 30; $attempt++) {
        Start-Sleep -Milliseconds 300
        try { $result = Invoke-RestMethod -Uri "$url/api/health" -TimeoutSec 1; if ($result.service -eq 'codeplant-ai-dialogue') { $healthy = $true; break } } catch {}
    }
    if (-not $healthy) { throw '서비스를 시작하지 못했습니다. data 폴더의 서버 로그를 확인하세요.' }
}
Start-Process $url
