@echo off
rem Double-click to start (Windows): the first start installs what the pages and the core need (a few minutes),
rem then the core and the pages run and the browser opens. Close this window (or press Ctrl+C) to stop.
rem Node.js and Python 3.13, if missing, are offered for install with winget (Windows' package manager).
rem pushd, not cd: in a network or shared folder (\\server\...) pushd maps a drive letter; cd cannot go there.
pushd "%~dp0" || (echo Cannot open the folder %~dp0 & pause & exit /b 1)
where npm >nul 2>nul || call :node_path
where npm >nul 2>nul || call :install_node
set "problem=Node.js is not installed: get the LTS version from https://nodejs.org, then double-click again."
where npm >nul 2>nul || goto fail
rem Installs the pages' packages if missing, or if they were installed on another system (e.g. macOS in a shared folder).
set "problem=npm install failed, see above."
node -e "import('vite').then(() => {}, () => process.exit(1))" 2>nul || call npm install --no-fund --no-audit || goto fail
set "problem=The core's setup failed, see above."
if not exist core\.venv-windows\Scripts\python.exe (call npm run setup || goto fail)
call npm start
popd
pause
exit /b

:fail
echo %problem%
popd
pause
exit /b 1

:node_path
rem Node.js installed after this Windows session started is not on PATH yet.
if exist "%ProgramFiles%\nodejs\npm.cmd" set "PATH=%ProgramFiles%\nodejs;%PATH%"
exit /b

:install_node
where winget >nul 2>nul || exit /b
choice /m "Node.js is not installed. Install Node.js LTS now with winget (Windows asks for administrator rights)"
if errorlevel 2 exit /b
winget install --id OpenJS.NodeJS.LTS --exact --source winget --accept-source-agreements --accept-package-agreements
call :node_path
exit /b
