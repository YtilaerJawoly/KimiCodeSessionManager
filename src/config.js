import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync } from 'node:fs';

/**
 * 配置与单实例锁模块
 *
 * 职责：
 *   1. 解析 Kimi home 目录路径（支持 KIMI_HOME 环境变量覆盖）。
 *   2. 提供 ksm 配置文件的读写接口。
 *   3. 通过锁文件实现 ksm 单实例运行，防止多开。
 *
 * 设计原则：
 *   - 所有与文件路径相关的常量集中管理，避免在业务模块中硬编码。
 *   - 配置文件读写失败时静默降级，保证 TUI 仍可启动。
 *   - 单实例锁通过检测锁文件中的 PID 是否仍然存活来判断是否被占用。
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
    lockFile: join(home, 'ksm.lock'),
    configFile: join(home, 'ksm-config.json'),
  };
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
 * 获取单实例锁。
 *
 * 行为：
 *   - 如果锁文件不存在，或锁文件中的 PID 已不存在，则成功获取锁。
 *   - 如果锁文件中的 PID 仍然存活，则返回该 PID，表示 ksm 已在运行。
 *   - 获取锁后注册进程退出钩子，确保锁文件能被清理。
 */
export function acquireInstanceLock(env = process.env) {
  const { lockFile, home } = getPaths(env);

  // 检查现有锁是否被存活进程持有
  try {
    const text = readFileSync(lockFile, 'utf8').trim();
    const pid = parseInt(text, 10);
    if (pid && pid !== process.pid) {
      try {
        process.kill(pid, 0);
        return { acquired: false, pid };
      } catch {
        // stale lock, the process is dead
      }
    }
  } catch {
    // no lock file yet
  }

  try {
    ensureDir(home);
    writeFileSync(lockFile, String(process.pid), 'utf8');

    const release = () => {
      try {
        unlinkSync(lockFile);
      } catch {}
    };

    process.on('exit', release);
    process.on('SIGINT', () => { release(); process.exit(); });
    process.on('SIGTERM', () => { release(); process.exit(); });

    return { acquired: true };
  } catch (err) {
    return { acquired: false, error: err.message };
  }
}

/**
 * 手动释放单实例锁。
 */
export function releaseInstanceLock(env = process.env) {
  const { lockFile } = getPaths(env);
  try {
    unlinkSync(lockFile);
  } catch {}
}

/**
 * 内部辅助：确保目录存在（递归创建）。
 */
function ensureDir(dir) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}
