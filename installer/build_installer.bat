@echo off
:: apolloDJ — Build Inno Setup installer
:: Output: output\apolloDJ Setup.exe
setlocal

set ISCC=
for %%P in (
  "C:\Program Files (x86)\Inno Setup 6\iscc.exe"
  "C:\Program Files\Inno Setup 6\iscc.exe"
  "C:\Program Files (x86)\Inno Setup 5\iscc.exe"
) do (
  if exist %%P set ISCC=%%P
)

if "%ISCC%"=="" (
  echo [ERROR] Inno Setup not found. Install from https://jrsoftware.org/isinfo.php
  exit /b 1
)

echo [INFO] Using Inno Setup: %ISCC%
echo [INFO] Building apolloDJ Setup.exe ...

if not exist output mkdir output

%ISCC% /O"output" apolloDJ.iss
if errorlevel 1 (
  echo [ERROR] Build failed.
  exit /b 1
)

echo [SUCCESS] Installer built: output\apolloDJ Setup.exe
dir output\*.exe
