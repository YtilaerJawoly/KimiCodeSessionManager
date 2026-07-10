import { homedir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';

/**
 * 配置模块
 *
 * 职责：
 *   1. 解析 Kimi home 目录路径（支持 KIMI_HOME 环境变量覆盖）。
 *   2. 提供 ksm 配置文件的读写接口。
 *
 * 设计原则：
 *   - 所有与文件路径相关的常量集中管理，避免在业务模块中硬编码。
 *   - 配置文件读写失败时静默降级，保证 TUI 仍可启动。
 */

/**
 * 获取 Kimi home 目录。
 */
export function getKimiHome(env = process.env) {
  const raw = env.KIMI_HOME?.trim();
  if (raw) return resolve(raw);
  return resolve(homedir(), '.kimi-code');
}

/**
 * 获取 ksm 运行所需的全部文件路径。
 */
export function getPaths(env = process.env) {
  const home = getKimiHome(env);
  return {
    home,
    indexFile: join(home, 'session_index.jsonl'),
    sessionsDir: join(home, 'sessions'),
    archiveDir: join(home, 'session-manager-archive'),
    configFile: join(home, 'ksm-config.json'),
  };
}

/**
 * 获取 Kimi Code 凭证文件路径（~/.kimi/credentials/kimi-code.json）。
 */
export function getKimiCredentialPath() {
  return resolve(homedir(), '.kimi', 'credentials', 'kimi-code.json');
}

/**
 * 读取 Kimi Code 凭证中的 access_token。
 * 文件不存在或读取失败时返回空字符串。
 */
export function loadKimiAccessToken() {
  const path = getKimiCredentialPath();
  try {
    if (!existsSync(path)) return '';
    const cred = JSON.parse(readFileSync(path, 'utf8'));
    return cred.access_token || cred.token || '';
  } catch {
    return '';
  }
}

/**
 * 保存 Kimi Code 凭证文件，只写入 access_token。
 */
export function saveKimiAccessToken(token) {
  const path = getKimiCredentialPath();
  try {
    ensureDir(dirname(path));
    writeFileSync(path, JSON.stringify({ access_token: token }, null, 2), 'utf8');
  } catch {
    // ignore write failures
  }
}

/**
 * 读取 ksm 配置文件。
 * 文件不存在或解析失败时返回空对象，避免启动中断。
 */
export function loadKsmConfig(env = process.env) {
  const { configFile } = getPaths(env);
  try {
    if (!existsSync(configFile)) return {};
    const text = readFileSync(configFile, 'utf8');
    return JSON.parse(text);
  } catch {
    return {};
  }
}

/**
 * 保存 ksm 配置文件。
 * 写入失败时静默忽略（例如权限不足）。
 */
export function saveKsmConfig(config, env = process.env) {
  const { home, configFile } = getPaths(env);
  try {
    ensureDir(home);
    writeFileSync(configFile, JSON.stringify(config, null, 2), 'utf8');
  } catch {
    // ignore write failures
  }
}

/**
 * 内部辅助：确保目录存在（递归创建）。
 */
function ensureDir(dir) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}
