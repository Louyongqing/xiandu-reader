param([string]$Executable = (Join-Path $PSScriptRoot '..\src-tauri\target\release\xiandu-reader.exe'))

$ErrorActionPreference = 'Stop'
$qaProfile = Join-Path ([System.IO.Path]::GetTempPath()) ('xiandu-native-' + [guid]::NewGuid().ToString('N'))
$previousArguments = $env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS
$previousProfile = $env:WEBVIEW2_USER_DATA_FOLDER
$previousEncoding = $env:PYTHONIOENCODING
$nativeProcess = $null
$testExitCode = 1
try {
    $env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = '--remote-debugging-port=9224'
    $env:WEBVIEW2_USER_DATA_FOLDER = $qaProfile
    $env:PYTHONIOENCODING = 'utf-8'
    $nativeProcess = Start-Process -FilePath (Resolve-Path -LiteralPath $Executable).Path -WindowStyle Hidden -PassThru
    $ready = $false
    for ($attempt = 0; $attempt -lt 30; $attempt++) {
        try {
            $null = Invoke-RestMethod -Uri 'http://127.0.0.1:9224/json/version' -TimeoutSec 1
            $ready = $true
            break
        } catch { Start-Sleep -Milliseconds 300 }
    }
    if (-not $ready) { throw 'The isolated WebView2 test endpoint did not start.' }
    & python (Join-Path $PSScriptRoot 'native_checks.py')
    $testExitCode = $LASTEXITCODE
    if ($testExitCode -eq 0) {
        & python (Join-Path $PSScriptRoot 'reading_continuity.py') --cdp 'http://127.0.0.1:9224'
        $testExitCode = $LASTEXITCODE
    }
    if ($testExitCode -eq 0) {
        & python (Join-Path $PSScriptRoot 'scroll_boundary.py') --cdp 'http://127.0.0.1:9224'
        $testExitCode = $LASTEXITCODE
    }
} finally {
    if ($nativeProcess -and -not $nativeProcess.HasExited) {
        $null = $nativeProcess.CloseMainWindow()
        if (-not $nativeProcess.WaitForExit(5000)) { Stop-Process -Id $nativeProcess.Id }
    }
    $env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = $previousArguments
    $env:WEBVIEW2_USER_DATA_FOLDER = $previousProfile
    $env:PYTHONIOENCODING = $previousEncoding
}
exit $testExitCode
