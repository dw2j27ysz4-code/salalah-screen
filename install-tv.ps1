# Builds the APK, installs it on the TV over adb, and launches it.
param([string]$Tv = "192.168.100.228:5555")
$ErrorActionPreference = "Stop"
$env:JAVA_HOME = "$env:LOCALAPPDATA\Programs\jdk17\jdk-17.0.20.1+1"
$adb = "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"

Push-Location $PSScriptRoot
try {
    .\gradlew.bat assembleDebug
    & $adb connect $Tv
    & $adb -s $Tv wait-for-device
    & $adb -s $Tv install -r app\build\outputs\apk\debug\app-debug.apk
    & $adb -s $Tv shell am start -n om.salalah.infoscreen/.MainActivity
} finally {
    Pop-Location
}
