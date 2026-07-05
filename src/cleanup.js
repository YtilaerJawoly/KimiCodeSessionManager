import { rename, rm, readFile, writeFile, mkdir, access, constants } from 'node:fs/promises';
import { join, normalize } from 'node:path';
import { getPaths } from './config.js';

/**
 * 会话清理模块
 *
 * 职责：
 *   1. 删除指定会话（释放磁盘空间）。
 *   2. 归档指定会话（移动到 session-manager-archive 目录）。
 *   3. 从 session_index.jsonl 中移除被删除/归档的会话记录。
 *
 * 设计原则：
 *   - 先操作文件系统，再更新索引；索引更新失败不会导致目录操作回滚，
 *     但错误会抛出，供上层显示。
 *   - 归档时若源目录不存在，给出明确错误，避免误删。
 *   - 索引更新采用“写临时文件 + 重命名”的方式，降低写坏风险。
 */

/**
 * 删除会话目录，并从索引中移除对应记录。
 */
export async function deleteSession(session, env = process.env) {
  const { indexFile } = getPaths(env);
  try {
    await rm(session.dir, { recursive: true, force: true });
    await removeFromIndex(indexFile, session.id, session.dir);
  } catch (err) {
    throw new Error(`删除会话失败：${err.message}`);
  }
}

/**
 * 归档会话：将目录移动到 archive 目录，并从索引中移除。
 */
export async function archiveSession(session, env = process.env) {
  const { archiveDir, indexFile } = getPaths(env);
  try {
    try {
      await access(session.dir, constants.F_OK);
    } catch {
      throw new Error(`归档失败：会话目录不存在 ${session.dir}`);
    }
    await mkdir(archiveDir, { recursive: true });
    const dest = join(archiveDir, `${session.projectName}_${session.id}`);
    await rename(session.dir, dest);
    await removeFromIndex(indexFile, session.id, session.dir);
  } catch (err) {
    if (err.message.startsWith('归档失败：会话目录不存在')) throw err;
    throw new Error(`归档会话失败：${err.message}`);
  }
}

/**
 * 从索引文件中删除指定会话记录。
 *
 * 使用临时文件 + rename 实现原子覆盖，避免直接写坏索引。
 */
async function removeFromIndex(indexFile, sessionId, sessionDir) {
  let text = '';
  try {
    text = await readFile(indexFile, 'utf8');
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
    return;
  }
  const kept = text.split('\n').filter(line => {
    if (!line) return false;
    try {
      const entry = JSON.parse(line);
      return entry.sessionId !== sessionId &&
             normalize(entry.sessionDir) !== normalize(sessionDir);
    } catch {
      return false;
    }
  });
  const tmp = `${indexFile}.tmp`;
  await writeFile(tmp, kept.join('\n') + (kept.length ? '\n' : ''), 'utf8');
  await rename(tmp, indexFile);
}
