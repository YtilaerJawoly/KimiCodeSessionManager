import { rename, rm, readFile, writeFile, mkdir, access, constants } from 'node:fs/promises';
import { join, normalize } from 'node:path';
import { getPaths } from './config.js';

export async function deleteSession(session, env = process.env) {
  const { indexFile } = getPaths(env);
  try {
    await rm(session.dir, { recursive: true, force: true });
    await removeFromIndex(indexFile, session.id, session.dir);
  } catch (err) {
    throw new Error(`删除会话失败：${err.message}`);
  }
}

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
