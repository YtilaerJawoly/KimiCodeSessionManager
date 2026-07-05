import { readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import chalk from 'chalk';
import { t } from '../i18n.js';
import { getKimiHome } from '../config.js';
import {
  WELCOME_WIDTH,
  LOGO_PREFIX,
  LINE_PREFIX,
  stringWidth,
  levelColor,
} from './helpers.js';

/**
 * 欢迎界面渲染模块
 *
 * 职责：
 *   1. 读取 Kimi Code 当前版本号（从 latest.json 提取）。
 *   2. 渲染顶部 ASCII 横幅与最多 5 条通知消息。
 *
 * 设计原则：
 *   - 与菜单逻辑解耦，只负责一次性绘制。
 *   - 使用 chalk 主题色统一视觉风格。
 */

const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));

/**
 * 读取 Kimi Code 的最新版本号。
 * 优先从 KIMI_HOME/updates/latest.json 中解析，读取失败返回空字符串。
 */
export function getKimiVersion(env = process.env) {
  const home = getKimiHome(env);
  try {
    const text = readFileSync(join(home, 'updates', 'latest.json'), 'utf8');
    const data = JSON.parse(text);
    return data.latest || data.version || data.manifest?.version || '';
  } catch {
    return '';
  }
}

/**
 * 清屏并绘制欢迎横幅。
 *
 * @param {string} kimiVersion Kimi Code 版本号
 * @param {Array<{level?: string, text: string}>} messages 顶部通知消息
 */
export function printWelcome(kimiVersion, messages = []) {
  // 清屏并把光标移到左上角，保证每次进入菜单都是“重绘”而非追加
  process.stdout.write('\x1B[2J\x1B[H');

  const title = t('welcome.title', { version: pkg.version });
  const leftPad = '  ';

  const line = (prefix, text) => {
    const visibleText = leftPad + prefix + text;
    const pad = WELCOME_WIDTH - stringWidth(visibleText);
    return '│' + visibleText + ' '.repeat(Math.max(0, pad)) + '│';
  };

  const border = '╭' + '─'.repeat(WELCOME_WIDTH) + '╮';
  const bottom = '╰' + '─'.repeat(WELCOME_WIDTH) + '╯';
  const accent = chalk.hex('#4A90E2');

  console.log(accent(border));
  console.log(accent('│' + ' '.repeat(WELCOME_WIDTH) + '│'));
  console.log(accent(line(LOGO_PREFIX, title)));
  console.log(accent(line(LINE_PREFIX, t('welcome.subtitle', { version: kimiVersion || 'unknown' }))));
  console.log(accent('│' + ' '.repeat(WELCOME_WIDTH) + '│'));
  console.log(accent(bottom));

  for (const msg of messages.slice(0, 5)) {
    console.log(levelColor(msg.level)(msg.text));
  }
  console.log();
}
