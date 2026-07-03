import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

export function getKimiHome(env = process.env) {
  if (env.KIMI_HOME) return resolve(env.KIMI_HOME);
  return resolve(homedir(), '.kimi-code');
}

export function getPaths(env = process.env) {
  const home = getKimiHome(env);
  return {
    home,
    indexFile: join(home, 'session_index.jsonl'),
    sessionsDir: join(home, 'sessions'),
    archiveDir: join(home, 'session-manager-archive'),
  };
}
