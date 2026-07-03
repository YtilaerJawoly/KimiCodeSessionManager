$ErrorActionPreference = 'Stop'
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $scriptDir

$wt = Get-Command wt.exe -ErrorAction SilentlyContinue
if ($wt) {
    wt.exe -w 0 nt -p PowerShell -d $scriptDir powershell -Command "node bin\ksm.js"
} else {
    node bin\ksm.js
}
