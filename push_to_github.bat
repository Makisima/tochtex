@echo off
title Push to GitHub (main)

cd /d "%~dp0"

if not exist ".git" (
    echo [ERROR] Not a git repository.
    pause
    exit /b 1
)

echo ========================================
echo  Pushing changes to GitHub (main)
echo ========================================
echo.

echo [1/3] Adding files...
git add .
if %errorlevel% neq 0 (
    echo [ERROR] git add failed.
    pause
    exit /b 1
)

echo [2/3] Committing...
git commit -m "Auto-push: %date% %time%"
if %errorlevel% neq 0 (
    echo.
    echo [INFO] Nothing to commit. Everything is already on GitHub.
    goto :skip_push
)

echo [3/3] Pushing to GitHub...
git push origin main
if %errorlevel% neq 0 (
    echo.
    echo [ERROR] git push failed. Check your internet and credentials.
    pause
    exit /b 1
)

:skip_push
echo.
echo ========================================
echo  Done! Changes are on GitHub (main).
echo ========================================
pause