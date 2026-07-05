$ErrorActionPreference = 'Stop'
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $scriptDir

# 检查 Node.js 是否已安装
$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
    Write-Host '错误：未找到 Node.js。ksm 需要 Node.js >= 20。' -ForegroundColor Red
    Write-Host '请从 https://nodejs.org/ 下载并安装后重试。' -ForegroundColor Yellow
    Read-Host '按 Enter 键退出'
    exit 1
}

# 使用 bin/ksm.js 的绝对路径，避免路径含空格时解析错误
$ksm = Join-Path $scriptDir 'bin' 'ksm.js'
if (-not (Test-Path $ksm)) {
    Write-Host "错误：找不到 $ksm" -ForegroundColor Red
    Read-Host '按 Enter 键退出'
    exit 1
}

# 直接在前台运行 ksm，保留 TUI 的交互体验
& $node $ksm @args
