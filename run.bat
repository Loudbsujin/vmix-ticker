@echo off
chcp 65001 >nul
cd /d "%~dp0"
title vMix Ticker Server
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo   Node.js가 설치되어 있지 않습니다.
  echo   - 서버 없이 쓰려면 public\index.html 을 더블클릭하세요. ^(같은 PC 창끼리만 연동^)
  echo   - 다른 기기에서 입력하려면 https://nodejs.org 에서 LTS 설치 후 다시 실행하세요.
  echo.
  pause
  exit /b 1
)
node server.js --open
pause
