param([string]$AppPath=(Join-Path ([Environment]::GetFolderPath('Desktop')) '국민대학교_바탕\ATTENTION_개인서버'),[string]$Providers='claude,antigravity',[switch]$SkipDocuments,[switch]$NoBrowser,[switch]$NoStart)
$ErrorActionPreference='Stop'
if(-not (Test-Path -LiteralPath (Join-Path $AppPath 'Bootstrap.ps1'))){
  $existingState=$null
  try{$existingState=Invoke-RestMethod -Uri ('http://127.0.0.1:'+$(if($env:DIALOGUE_PORT){$env:DIALOGUE_PORT}else{'49322'})+'/api/state') -TimeoutSec 3}catch{}
  if($existingState -and ($existingState.activeRunId -or $existingState.installing -or @($existingState.connections.psobject.Properties.Value | Where-Object {$_.loginRunning -or $_.logoutRunning}).Count)){throw '진행 중인 기존 작업을 먼저 마치세요. 파일을 변경하지 않았습니다.'}
  [Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12
  $release=Invoke-RestMethod -Uri 'https://api.github.com/repos/CodeplantEDU/codeplant_Attention/releases/tags/local-v0.10.0'
  $asset=@($release.assets | Where-Object {$_.name -eq 'ATTENTION-Local.zip'})
  if($asset.Count -ne 1 -or $asset[0].digest -notmatch '^sha256:([a-f0-9]{64})$'){throw '배포 ZIP의 공식 SHA256을 확인하지 못했습니다.'}
  $expected=$Matches[1]
  $url=[Uri]$asset[0].browser_download_url
  if($url.Scheme -ne 'https' -or $url.Host -ne 'github.com' -or -not $url.AbsolutePath.StartsWith('/CodeplantEDU/codeplant_Attention/releases/download/')){throw '허용하지 않은 다운로드 주소'}
  $staging=Join-Path ([IO.Path]::GetTempPath()) ('attention-setup-'+[Guid]::NewGuid().ToString('N'))
  New-Item -ItemType Directory -Path $staging | Out-Null
  $zip=Join-Path $staging 'ATTENTION-Local.zip'
  Invoke-WebRequest -UseBasicParsing -Uri $url.AbsoluteUri -OutFile $zip
  if((Get-FileHash -LiteralPath $zip -Algorithm SHA256).Hash.ToLowerInvariant() -ne $expected){throw 'ZIP 검증 실패. 원본을 변경하지 않았습니다.'}
  $unpacked=Join-Path $staging 'app';Expand-Archive -LiteralPath $zip -DestinationPath $unpacked
  $files=Get-ChildItem -LiteralPath $unpacked -Recurse -File
  if(@($files | Where-Object {$_.FullName -match '[\\/](\.local-data|data|\.git|node_modules)[\\/]'}).Count){throw '개인 자료가 포함된 배포 파일은 설치하지 않습니다.'}
  foreach($file in $files){$relative=$file.FullName.Substring($unpacked.Length+1);$target=Join-Path $AppPath $relative;New-Item -ItemType Directory -Path (Split-Path $target) -Force | Out-Null;if(Test-Path -LiteralPath $target){Copy-Item -LiteralPath $target -Destination ($target+'.before-setup')};Copy-Item -LiteralPath $file.FullName -Destination $target}
}
$parameters=@{Providers=$Providers}
if($SkipDocuments){$parameters.SkipDocuments=$true}
if($NoBrowser){$parameters.NoBrowser=$true}
if($NoStart){$parameters.NoStart=$true}
& (Join-Path $AppPath 'Bootstrap.ps1') @parameters
exit $LASTEXITCODE
