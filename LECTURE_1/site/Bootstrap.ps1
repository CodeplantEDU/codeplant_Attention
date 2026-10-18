param([string]$Providers='claude,gemini',[switch]$SkipDocuments,[switch]$NoStart,[switch]$NoBrowser,[switch]$CheckOnly)
$ErrorActionPreference='Stop'
$nodePath=(Get-Command node.exe -ErrorAction SilentlyContinue).Source
if($nodePath){$major=& $nodePath -p 'parseInt(process.versions.node)';if([int]$major -lt 22){$nodePath=$null}}
if(-not $nodePath){
  $managed=Get-ChildItem -Path (Join-Path $PSScriptRoot '.local-data\runtime\node\node-v*-win-*\node.exe') -ErrorAction SilentlyContinue | Select-Object -First 1
  if($managed){$nodePath=$managed.FullName}
}
if(-not $nodePath){
  if($CheckOnly){throw 'Node.js 22 이상이 없습니다. 자동준비.cmd를 실행하세요.'}
  [Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12
  $architecture=if($env:PROCESSOR_ARCHITECTURE -eq 'ARM64'){'arm64'}else{'x64'}
  $baseUrl='https://nodejs.org/dist/latest-v22.x/'
  $sums=(Invoke-WebRequest -UseBasicParsing -Uri ($baseUrl+'SHASUMS256.txt')).Content
  $pattern='(?m)^([a-f0-9]{64})\s+(node-v22\.[0-9]+\.[0-9]+-win-'+$architecture+'\.zip)\s*$'
  $match=[regex]::Match($sums,$pattern)
  if(-not $match.Success){throw '공식 Node.js 다운로드 목록을 확인하지 못했습니다.'}
  $target=Join-Path $PSScriptRoot '.local-data\runtime\node'
  New-Item -ItemType Directory -Path $target -Force | Out-Null
  $archive=Join-Path $target $match.Groups[2].Value
  Write-Host '공식 Node.js 다운로드 및 SHA256 확인 중'
  Invoke-WebRequest -UseBasicParsing -Uri ($baseUrl+$match.Groups[2].Value) -OutFile $archive
  if((Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant() -ne $match.Groups[1].Value){throw 'Node.js 해시 검증 실패. 설치를 중단했습니다.'}
  Expand-Archive -LiteralPath $archive -DestinationPath $target -Force
  $nodePath=Join-Path (Join-Path $target ([IO.Path]::GetFileNameWithoutExtension($archive))) 'node.exe'
}
$arguments=@((Join-Path $PSScriptRoot 'tools\bootstrap.mjs'),'--providers',$Providers)
if($SkipDocuments){$arguments+='--skip-documents'}
if($NoStart){$arguments+='--no-start'}
if($NoBrowser){$arguments+='--no-browser'}
if($CheckOnly){$arguments+='--check-only'}
& $nodePath @arguments
exit $LASTEXITCODE
