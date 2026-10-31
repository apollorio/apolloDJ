@echo off

setlocal

cd /d "%~dp0"



set "ROOT_DIR=%~dp0.."

set "DIST_DIR=%ROOT_DIR%\dist_002"

set "WORK_DIR=%ROOT_DIR%\_build_002"

set "PY=python"

if exist ".venv\Scripts\python.exe" set "PY=.venv\Scripts\python.exe"



echo [apolloDJ] Using Python: %PY%

echo [apolloDJ] Installing Python requirements...

"%PY%" -m pip install -r requirements.txt

if errorlevel 1 goto :fail



echo [apolloDJ] Building executable with PyInstaller...

"%PY%" -m PyInstaller --noconfirm --clean --distpath "%DIST_DIR%" --workpath "%WORK_DIR%" apolloDJ.spec

if errorlevel 1 goto :fail



echo [apolloDJ] Build finished: %DIST_DIR%\apolloDJ.exe



echo [apolloDJ] Running ULTRA PRO release gate (_audit_ultra_pro.py)...

"%PY%" _audit_ultra_pro.py

if errorlevel 1 goto :blocked

echo [apolloDJ] RELEASE GATE PASSED — dist_002\apolloDJ.exe is shippable.

exit /b 0



:blocked

echo [apolloDJ] RELEASE BLOCKED — ultra-pro gate failed. Do NOT ship this exe.

exit /b 2



:fail

echo [apolloDJ] Build failed.

exit /b 1

