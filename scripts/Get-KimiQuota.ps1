#Requires -Version 5.1
param([string]$AccessToken = $env:KIMI_ACCESS_TOKEN)

if (-not $AccessToken) {
    $credPath = Join-Path $env:USERPROFILE ".kimi\credentials\kimi-code.json"
    if (Test-Path $credPath) {
        $cred = Get-Content $credPath -Raw | ConvertFrom-Json
        $AccessToken = $cred.access_token -or $cred.token
    }
}

if (-not $AccessToken) { Write-Error "缺少 Access Token"; exit 1 }

$headers = @{
    "Authorization" = "Bearer $AccessToken"
    "Content-Type" = "application/json"
    "Referer" = "https://www.kimi.com/code/console"
}

try {
    $r = Invoke-RestMethod -Uri "https://www.kimi.com/apiv2/kimi.gateway.billing.v1.BillingService/GetUsages" `
        -Method POST -Headers $headers -Body '{"scope":["FEATURE_CODING"]}'
    
    $r.usages[0].detail.remaining

} catch {
    Write-Error "请求失败: $_"
    exit 1
}
