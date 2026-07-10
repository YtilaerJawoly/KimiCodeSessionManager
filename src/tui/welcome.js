import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import chalk from 'chalk';
import { t } from '../i18n.js';
import { getKimiHome } from '../config.js';
import { getKimiInstalledVersion } from '../kimi-version.js';
import {
  WELCOME_WIDTH,
  MIN_WELCOME_WIDTH,
  getWelcomeWidth,
  LOGO_PREFIX,
  LINE_PREFIX,
  stringWidth,
  truncate,
  levelColor,
} from './helpers.js';

/**
 * 欢迎界面渲染模块
 *
 * 职责：
 *   1. 读取 Kimi Code 本地安装版本号。
 *   2. 渲染顶部 ASCII 横幅与最多 5 条通知消息。
 *
 * 设计原则：
 *   - 与菜单逻辑解耦，只负责一次性绘制。
 *   - 使用 chalk 主题色统一视觉风格。
 */

const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));

/**
 * 读取本地安装的 Kimi Code 版本号。
 * 未安装或读取失败返回空字符串。
 */
export async function getKimiVersion(env = process.env) {
  const version = await getKimiInstalledVersion(getKimiHome(env));
  return version;
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

  const width = getWelcomeWidth();
  const leftPad = '  ';
  const maxTextWidth = width - 2 - stringWidth(leftPad + LOGO_PREFIX);

  const title = truncate(t('welcome.title', { version: pkg.version }), maxTextWidth);

  const line = (prefix, text) => {
    const fullText = leftPad + prefix + text;
    const pad = width - stringWidth(fullText);
    return '│' + fullText + ' '.repeat(Math.max(0, pad)) + '│';
  };

  const border = '╭' + '─'.repeat(width) + '╮';
  const bottom = '╰' + '─'.repeat(width) + '╯';
  const accent = chalk.hex('#4A90E2');

  console.log(accent(border));
  console.log(accent('│' + ' '.repeat(width) + '│'));
  console.log(accent(line(LOGO_PREFIX, title)));
  console.log(accent(line(LINE_PREFIX, truncate(t('welcome.subtitle', { version: kimiVersion || 'unknown' }), maxTextWidth))));

  console.log(accent('│' + ' '.repeat(width) + '│'));
  console.log(accent(bottom));

  for (const msg of messages.slice(0, 5)) {
    console.log(levelColor(msg.level)(msg.text));
  }
  console.log();
}

/**
 * 异步读取 Kimi Code 版本并重新绘制欢迎横幅。
 * 供各菜单页统一在循环开头调用。
 *
 * @param {Object} env 环境变量对象
 * @param {Array<{level?: string, text: string}>} messages 顶部通知消息
 */
export async function redrawWelcome(env, messages = []) {
  const kimiVersion = await getKimiVersion(env);
  printWelcome(kimiVersion, messages);
}
