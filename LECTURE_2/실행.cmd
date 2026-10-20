@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 22 이상이 필요합니다. https://nodejs.org/en/download 에서 설치해 주세요.
  pause
  exit /b 1
)
node tools/local.mjs
pause
