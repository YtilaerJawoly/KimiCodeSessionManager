import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import chalk from 'chalk';
import { getLocale } from '../i18n.js';

/**
 * TUI 通用工具与常量模块
 *
 * 职责：
 *   1. 提供 inquirer 的静默主题（隐藏默认前缀、空答案提示）。
 *   2. 提供终端控制、字符串宽度计算、补白、截断、时间格式化等辅助函数。
 *   3. 暴露项目根目录 ROOT_DIR，供菜单层统一引用。
 *
 * 设计原则：
 *   - 纯工具函数，不依赖业务状态，便于单元测试。
 *   - 所有与 chalk / 终端转义相关的渲染细节集中在此，避免散落。
 */

const __dirname = dirname(fileURLToPath(import.meta.url));

/** 项目根目录，菜单中的更新、快捷方式等操作以此作为工作目录 */
export const ROOT_DIR = resolve(__dirname, '..', '..');

/** 列表选择器的静默主题：去掉前缀和答案回显，避免污染菜单边界 */
export const QUIET_SELECT_THEME = {
  prefix: '',
  style: {
    message: () => '',
    answer: () => '',
  },
};

/** 搜索选择器的静默主题 */
export const QUIET_SEARCH_THEME = {
  prefix: '',
  style: {
    message: () => '',
    answer: () => '',
  },
};

/** 最近会话列表中项目名称列宽 */
export const NAME_WIDTH = 22;

/** 最近会话列表中项目路径列宽 */
export const PATH_WIDTH = 42;

/** Fuse.js 搜索配置：按名称和路径模糊匹配 */
export const FUSE_OPTIONS = { keys: ['name', 'path'], threshold: 0.4 };

/** 欢迎界面（顶部横幅）总宽度 */
export const WELCOME_WIDTH = 80;

/** 欢迎界面 Logo 行前缀 */
export const LOGO_PREFIX = '▐█▛█▛█▌  ';

/** 欢迎界面普通信息行前缀 */
export const LINE_PREFIX = '▐█████▌  ';

/**
 * 清除终端当前行。
 * 用于 inquirer 在静默主题下输出空答案后，回退并擦除该行，保持菜单不抖动。
 */
export function clearLastLine() {
  process.stdout.write('\x1B[1A\x1B[K');
}

/**
 * 按 East Asian Width 规则估算字符串显示宽度。
 * 中文字符计 2，其他字符计 1。仅覆盖常见 CJK 统一表意文字，足够本项目使用。
 */
export function stringWidth(str) {
  let width = 0;
  for (const char of String(str)) {
    const code = char.codePointAt(0);
    width += (code >= 0x4e00 && code <= 0x9fff) ? 2 : 1;
  }
  return width;
}

/**
 * 用空格将字符串右补至指定显示宽度（考虑中文字符）。
 */
export function padEnd(str, width) {
  const len = stringWidth(str);
  if (len >= width) return str;
  return str + ' '.repeat(width - len);
}

/**
 * 截断字符串并在末尾添加省略号，避免列表项过长换行。
 */
export function truncate(str, max) {
  const safe = str || '';
  if (safe.length <= max) return safe;
  return safe.slice(0, max - 1) + '…';
}

/**
 * 将 ISO 时间字符串格式化为本地化时间。
 */
export function formatTime(iso) {
  const d = new Date(iso);
  const locale = getLocale() === 'zh-CN' ? 'zh-CN' : 'en-US';
  return isNaN(d) ? iso : d.toLocaleString(locale);
}

/**
 * 根据消息级别返回对应的 chalk 颜色函数。
 */
export function levelColor(level) {
  if (level === 'error') return chalk.red;
  if (level === 'warning') return chalk.yellow;
  return chalk.cyan;
}
