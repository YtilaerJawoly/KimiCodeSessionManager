import { rename, rm, readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { getPaths } from './config.js';

export async function deleteSession(session, env = process.env) {
  const { indexFile } = getPaths(env);
  await rm(session.dir, { recursive: true, force: true });
  await removeFromIndex(indexFile, session.id);
}

export async function archiveSession(session, env = process.env) {
  const { archiveDir, indexFile } = getPaths(env);
  await mkdir(archiveDir, { recursive: true });
  const dest = join(archiveDir, `${session.projectName}_${session.id}`);
  await rename(session.dir, dest);
  await removeFromIndex(indexFile, session.id);
}

async function removeFromIndex(indexFile, sessionId) {
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
      return entry.sessionId !== sessionId;
    } catch {
      return false;
    }
  });
  const tmp = `${indexFile}.tmp`;
  await writeFile(tmp, kept.join('\n') + (kept.length ? '\n' : ''), 'utf8');
  await rename(tmp, indexFile);
}
