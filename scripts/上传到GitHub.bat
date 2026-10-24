@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion
cd /d "%~dp0.."
echo.
echo   ============================================
echo     发布到 GitHub
echo   ============================================
echo.

rem ---- 找 node ----
set "NODE_EXE=node"
where node >nul 2>nul
if %errorlevel% equ 0 goto RUN

set "NODE_EXE="
for /d %%D in ("%USERPROFILE%\.workbuddy\binaries\node\versions\*") do (
  if exist "%%D\node.exe" set "NODE_EXE=%%D\node.exe"
)
if not defined NODE_EXE goto NONODE

:RUN
"%NODE_EXE%" "scripts\publish-to-github.js" %*
set "RC=%errorlevel%"
echo.
if not "%RC%"=="0" echo   退出码 %RC%，请把上面的报错复制给维护者。
echo   按任意键关闭窗口...
pause >nul
exit /b %RC%

:NONODE
echo   没有找到 Node.js，无法运行上传脚本。
echo   你可以在 WorkBuddy 里直接让我帮你传，把令牌发我即可。
echo.
pause
exit /b 1
