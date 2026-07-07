/**
 * Kimi Code Plan 额度查询模块
 *
 * 职责：
 *   1. 读取 ~/.kimi/credentials/kimi-code.json 中的 access_token。
 *   2. 调用 Kimi 内部计费 API 查询 FEATURE_CODING 额度。
 *   3. 返回剩余额度文本，失败时返回空字符串或错误信息。
 *
 * 设计原则：
 *   - 网络请求带 3 秒超时，避免阻塞 TUI 启动。
 *   - 所有错误静默降级，不破坏欢迎界面渲染。
 */

import { loadKimiAccessToken } from './config.js';
import { runCommandWithTimeout } from './process.js';

const QUOTA_URL = 'https://www.kimi.com/apiv2/kimi.gateway.billing.v1.BillingService/GetUsages';
const QUOTA_BODY = '{"scope":["FEATURE_CODING"]}';

/**
 * 查询 Kimi Code Plan 剩余额度。
 *
 * @returns {Promise<{success: boolean, remaining: string, message: string}>}
 */
export async function getKimiCodeQuota() {
  const token = loadKimiAccessToken();
  if (!token) {
    return { success: false, remaining: '', message: 'missing_token' };
  }

  const script = `
$headers = @{
  "Authorization" = "Bearer ${escapeToken(token)}"
  "Content-Type" = "application/json"
  "Referer" = "https://www.kimi.com/code/console"
}
try {
  $r = Invoke-RestMethod -Uri "${QUOTA_URL}" -Method POST -Headers $headers -Body '${QUOTA_BODY}' -TimeoutSec 3
  Write-Output $r.usages[0].detail.remaining
} catch {
  Write-Error $_.Exception.Message
  exit 1
}
`;

  const result = await runCommandWithTimeout(
    'powershell.exe',
    ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script],
    {},
    4000
  );

  if (!result.success) {
    return { success: false, remaining: '', message: result.message };
  }

  const remaining = result.stdout.trim();
  if (!remaining) {
    return { success: false, remaining: '', message: 'empty_response' };
  }

  return { success: true, remaining, message: '' };
}

function escapeToken(token) {
  return token.replace(/"/g, '""');
}
