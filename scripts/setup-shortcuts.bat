@echo off
REM SideQuest CQO - Shortcut Installation Script (Windows)
REM For pnpm users who need to manually install package.json shortcuts

echo 🚀 SideQuest CQO - Installing Shortcuts
echo =======================================

REM Detect package manager
where pnpm >nul 2>nul
if %errorlevel% == 0 (
    set PKG_MANAGER=pnpm
    echo 📦 Detected: pnpm
    goto :run_install
)

where yarn >nul 2>nul
if %errorlevel% == 0 (
    set PKG_MANAGER=yarn
    echo 📦 Detected: yarn
    goto :run_install
)

where bun >nul 2>nul
if %errorlevel% == 0 (
    set PKG_MANAGER=bun
    echo 📦 Detected: bun
    goto :run_install
)

set PKG_MANAGER=npm
echo 📦 Detected: npm

:run_install
echo.
echo 🔧 Running shortcut installation...

REM Run the install shortcuts command
npx sidequest-cqo --install-shortcuts
if %errorlevel% == 0 (
    echo.
    echo ✅ SUCCESS! Shortcuts installed.
    echo.
    echo 🎉 You can now use:
    if "%PKG_MANAGER%"=="pnpm" (
        echo    pnpm run sidequest:watch
        echo    pnpm run sidequest:report
        echo    pnpm run sidequest:help
        echo.
        echo 🚀 Quick start: pnpm run sidequest:watch
    ) else if "%PKG_MANAGER%"=="yarn" (
        echo    yarn sidequest:watch
        echo    yarn sidequest:report
        echo    yarn sidequest:help
        echo.
        echo 🚀 Quick start: yarn sidequest:watch
    ) else if "%PKG_MANAGER%"=="bun" (
        echo    bun run sidequest:watch
        echo    bun run sidequest:report
        echo    bun run sidequest:help
        echo.
        echo 🚀 Quick start: bun run sidequest:watch
    ) else (
        echo    npm run sidequest:watch
        echo    npm run sidequest:report
        echo    npm run sidequest:help
        echo.
        echo 🚀 Quick start: npm run sidequest:watch
    )
) else (
    echo.
    echo ❌ Installation failed. You can add shortcuts manually:
    echo.
    echo Add to your package.json:
    echo {
    echo   "scripts": {
    echo     "sidequest:report": "sidequest-cqo --verbose",
    echo     "sidequest:watch": "sidequest-cqo --watch",
    echo     "sidequest:config": "sidequest-cqo --config",
    echo     "sidequest:help": "sidequest-cqo --help"
    echo   }
    echo }
)

pause