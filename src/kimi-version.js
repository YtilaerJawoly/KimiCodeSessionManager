import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Kimi Code 版本信息工具模块
 *
 * 职责：
 *   1. 从 KIMI_HOME/updates/latest.json 读取 Kimi Code 的最新版本号。
 *
 * 设计原则：
 *   - 欢迎界面（tui/welcome.js）与更新检查器（updater.js）都需要读取该文件，
 *     集中实现可避免重复解析逻辑。
 */

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
