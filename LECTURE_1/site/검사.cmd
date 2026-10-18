@echo off
pushd "%~dp0"
node tools\doctor.mjs
popd
pause
