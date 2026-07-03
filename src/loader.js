import { readFile, readdir } from 'node:fs/promises';
import { join, basename, normalize } from 'node:path';
import { getPaths } from './config.js';

export async function loadSessions(env = process.env) {
  const { indexFile, sessionsDir } = getPaths(env);
  const sessions = [];

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

async function readState(sessionDir) {
  try {
    const text = await readFile(join(sessionDir, 'state.json'), 'utf8');
    return JSON.parse(text);
  } catch (err) {
    if (err.code === 'ENOENT' || err instanceof SyntaxError) return null;
    throw err;
  }
}

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

function inferWorkDir(projectDirName) {
  const m = projectDirName.match(/^wd_(.+?)_[a-f0-9]+$/);
  return m ? m[1] : projectDirName;
}

function getTime(iso, fallbackIso) {
  const d = new Date(iso);
  if (!isNaN(d.getTime())) return d.getTime();
  const fallback = new Date(fallbackIso);
  return !isNaN(fallback.getTime()) ? fallback.getTime() : 0;
}
