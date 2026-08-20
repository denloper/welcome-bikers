@echo off
setlocal
cd /d "%~dp0.."
set ANDROID_HOME=C:\Android\Sdk
set ANDROID_SDK_ROOT=C:\Android\Sdk
call npm run build
if errorlevel 1 exit /b 1
call npx cap sync android
if errorlevel 1 exit /b 1
cd android
call gradlew.bat assembleDebug
if errorlevel 1 exit /b 1
if not exist "..\releases" mkdir "..\releases"
copy /Y "app\build\outputs\apk\debug\app-debug.apk" "..\releases\WelcomeBikers.apk"
echo APK: %cd%\..\releases\WelcomeBikers.apk
