@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0.."
echo.
echo   ============================================
echo    档案台账工作台  Ledger Studio
echo   ============================================
echo.
where node >nul 2>nul
if %errorlevel% neq 0 goto NONODE
echo   正在启动本地服务，浏览器将自动打开...
node server\server.js
goto END
:NONODE
echo   未检测到 Node.js，无法启动本地服务。
echo   已改为直接用浏览器打开（功能完全一致，零依赖）。
echo.
start "" "index.html"
goto END
:END
endlocal
