@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0.."
echo.
echo   正在检查更新...
echo.
if not exist ".git" goto NOGIT
where git >nul 2>nul
if %errorlevel% neq 0 goto NOGITBIN
git pull --ff-only
if %errorlevel% neq 0 (
  echo.
  echo   拉取失败：可能是网络受限或本地有改动。
  echo   可改用离线更新包：把新的 zip 解压覆盖本目录即可。
) else (
  echo.
  echo   更新完成。请关闭本窗口后重新运行「启动.bat」。
)
goto END
:NOGIT
echo   当前目录不是 git 仓库（离线安装包）。
echo   离线更新方法：下载新版 zip，解压后覆盖本目录全部文件即可。
goto END
:NOGITBIN
echo   未检测到 git 命令，无法在线更新。
echo   离线更新方法：下载新版 zip，解压后覆盖本目录全部文件即可。
goto END
:END
echo.
pause
endlocal
