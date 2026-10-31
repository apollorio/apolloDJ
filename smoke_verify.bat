@echo off
setlocal
cd /d "%~dp0"
python smoke_verify.py %*
exit /b %ERRORLEVEL%
