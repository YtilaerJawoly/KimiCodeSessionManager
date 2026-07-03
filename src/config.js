import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

export function getKimiHome(env = process.env) {
  if (env.KIMI_HOME?.trim()) return resolve(env.KIMI_HOME);
  try {
    return resolve(homedir(), '.kimi-code');
  } catch (err) {
    throw new Error(`无法确定用户主目录，请设置 KIMI_HOME 环境变量。原始错误：${err.message}`);
  }
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
