$ErrorActionPreference = 'Stop'
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $scriptDir

Start-Process powershell.exe -ArgumentList '-NoProfile','-Command','node bin\ksm.js'
