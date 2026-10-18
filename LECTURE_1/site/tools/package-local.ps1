param([Parameter(Mandatory=$true)][string]$Destination)
$ErrorActionPreference = 'Stop'
$source = Split-Path $PSScriptRoot
$destinationPath = [IO.Path]::GetFullPath($Destination)
if (Test-Path -LiteralPath $destinationPath) { throw '새 배포 폴더를 지정하세요. 기존 자료를 덮어쓰지 않습니다.' }
New-Item -ItemType Directory -Path $destinationPath | Out-Null
$files = @('server.mjs','package.json','requirements.txt','README.md','Start.ps1','실행.cmd','실행.command','검사.cmd',
 'public/index.html','public/app.js','public/styles.css','public/assets/Pretendard-Regular.ttf','public/assets/Pretendard-Bold.ttf','public/assets/Pretendard-LICENSE.txt',
 'tools/local.mjs','tools/doctor.mjs','tools/control.mjs','tools/gemini-auth.mjs')
$files += Get-ChildItem -LiteralPath (Join-Path $source 'lib') -File | ForEach-Object { 'lib/'+$_.Name }
foreach ($relative in $files) {
 $target = Join-Path $destinationPath $relative
 New-Item -ItemType Directory -Path (Split-Path $target) -Force | Out-Null
 Copy-Item -LiteralPath (Join-Path $source $relative) -Destination $target
}
Add-Type -AssemblyName System.IO.Compression.FileSystem
[IO.Compression.ZipFile]::CreateFromDirectory($destinationPath,$destinationPath+'.zip')
Get-Item -LiteralPath ($destinationPath+'.zip') | Select-Object FullName,Length
