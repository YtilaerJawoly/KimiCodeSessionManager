import { readFile, readdir } from 'node:fs/promises';
import { join, basename, normalize } from 'node:path';
import { getPaths } from './config.js';

/**
 * 会话加载模块
 *
 * 职责：
 *   1. 从 session_index.jsonl 索引文件加载会话记录。
 *   2. 当索引不存在或为空时，回退到扫描 Kimi 的 sessions/ 目录结构。
 *   3. 解析每个会话目录下的 state.json，统一成内部 Session 对象。
 *
 * 设计原则：
 *   - 索引优先：索引命中时直接读取，避免遍历大量目录。
 *   - 去重：索引与目录扫描结果合并时按目录路径去重。
 *   - 容错：损坏的索引行或 state.json 被静默跳过，不影响其他会话加载。
 */

/**
 * 加载所有 Kimi 会话。
 *
 * 加载顺序：
 *   1. 读取 session_index.jsonl。
 *   2. 扫描 sessions/wd_<project>/session_<id>/state.json 作为补充。
 *   3. 按 updatedAt / createdAt 降序排序。
 */
export async function loadSessions(env = process.env) {
  const { indexFile, sessionsDir } = getPaths(env);
  const sessions = [];

  // 阶段 1：从索引文件读取
  let indexLines = [];
  try {
    const text = await readFile(indexFile, 'utf8');
    indexLines = text.split('\n').filter(Boolean);
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }

  for (const line of indexLines) {
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    if (!entry.sessionDir || sessions.some(s => normalize(s.dir) === normalize(entry.sessionDir))) continue;
    const state = await readState(entry.sessionDir);
    if (!state) continue;
    sessions.push(buildSession(entry, state));
  }

  // 阶段 2：回退目录扫描
  try {
    const projectDirs = await readdir(sessionsDir, { withFileTypes: true });
    for (const pd of projectDirs.filter(d => d.isDirectory() && d.name.startsWith('wd_'))) {
      const projectDir = join(sessionsDir, pd.name);
      const sessionDirs = await readdir(projectDir, { withFileTypes: true });
      for (const sd of sessionDirs.filter(d => d.isDirectory() && d.name.startsWith('session_'))) {
        const dir = join(projectDir, sd.name);
        if (sessions.some(s => normalize(s.dir) === normalize(dir))) continue;
        const state = await readState(dir);
        if (!state) continue;
        const entry = {
          sessionDir: dir,
          workDir: inferWorkDir(pd.name),
        };
        sessions.push(buildSession(entry, state));
      }
    }
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }

  return sessions.sort((a, b) => getTime(b.updatedAt, b.createdAt) - getTime(a.updatedAt, a.createdAt));
}

/**
 * 读取会话目录下的 state.json。
 * 文件不存在或 JSON 损坏时返回 null。
 */
async function readState(sessionDir) {
  try {
    const text = await readFile(join(sessionDir, 'state.json'), 'utf8');
    return JSON.parse(text);
  } catch (err) {
    if (err.code === 'ENOENT' || err instanceof SyntaxError) return null;
    throw err;
  }
}

/**
 * 将索引条目 + state.json 转换为统一的 Session 对象。
 */
function buildSession(entry, state) {
  const projectPath = entry.workDir || basename(entry.sessionDir);
  return {
    id: basename(entry.sessionDir),
    projectPath,
    projectName: basename(projectPath),
    dir: entry.sessionDir,
    title: state.title || '(无标题)',
    createdAt: state.createdAt || new Date(0).toISOString(),
    updatedAt: state.updatedAt || state.createdAt || new Date(0).toISOString(),
    lastPrompt: state.lastPrompt || '',
  };
}

/**
 * 从项目目录名推断原始工作目录名。
 * Kimi 目录格式：wd_<workDirName>_<hash>
 */
function inferWorkDir(projectDirName) {
  const m = projectDirName.match(/^wd_(.+?)_[a-f0-9]+$/);
  return m ? m[1] : projectDirName;
}

/**
 * 安全解析 ISO 时间，失败时使用回退时间，最终返回毫秒时间戳。
 */
function getTime(iso, fallbackIso) {
  const d = new Date(iso);
  if (!isNaN(d.getTime())) return d.getTime();
  const fallback = new Date(fallbackIso);
  return !isNaN(fallback.getTime()) ? fallback.getTime() : 0;
}
