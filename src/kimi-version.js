/**
 * Kimi Code 版本信息工具模块
 *
 * 职责：
 *   1. 从 KIMI_HOME/updates/latest.json 读取 Kimi Code 的最新版本号。
 *   2. 提供 getKimiInstalledVersion() 读取本地 kimi.exe 的实际版本号。
 *
 * 设计原则：
 *   - 欢迎界面（tui/welcome.js）与更新检查器（updater.js）都需要读取该文件，
 *     集中实现可避免重复解析逻辑。
 *   - 可执行文件版本解析逻辑从 updater.js 迁移至此，避免 welcome.js 直接依赖 updater.js。
 */

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { runCommand } from './process.js';

/**
 * 读取 Kimi Code 的最新版本号。
 *
 * @param {string} home Kimi home 目录
 * @returns {string} 版本号；读取失败时返回空字符串
 */
export function readKimiLatestVersion(home) {
  try {
    const text = readFileSync(join(home, 'updates', 'latest.json'), 'utf8');
    const data = JSON.parse(text);
    return data.latest || data.version || data.manifest?.version || '';
  } catch {
    return '';
  }
}

/**
 * 读取本地安装的 Kimi Code 版本号。
 *
 * @param {string} home Kimi home 目录
 * @param {Function} [spawner] 可选的 spawn 实现，用于测试
 * @returns {Promise<string>} 版本号；未安装或读取失败返回空字符串
 */
export async function getKimiInstalledVersion(home, spawner) {
  const exe = join(home, 'bin', 'kimi.exe');
  if (!existsSync(exe)) return '';

  const result = await runCommand(exe, ['--version'], {}, spawner);
  if (!result.success) return '';

  const output = result.stdout.trim() || result.stderr.trim();
  if (!output) return '';
  const match = output.match(/(?:kimi\s+)?v?(\d+\.\d+(?:\.\d+)?)/i);
  return match ? match[1] : output;
}
