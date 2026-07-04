import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync } from 'node:fs';

export function getKimiHome(env = process.env) {
  const raw = env.KIMI_HOME?.trim();
  if (raw) return resolve(raw);
  return resolve(homedir(), '.kimi-code');
}

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

export function saveKsmConfig(config, env = process.env) {
  const { home, configFile } = getPaths(env);
  try {
    if (!existsSync(home)) mkdirSync(home, { recursive: true });
    writeFileSync(configFile, JSON.stringify(config, null, 2), 'utf8');
  } catch {
    // ignore write failures
  }
}

export function acquireInstanceLock(env = process.env) {
  const { lockFile, home } = getPaths(env);

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
    if (!existsSync(home)) mkdirSync(home, { recursive: true });
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

export function releaseInstanceLock(env = process.env) {
  const { lockFile } = getPaths(env);
  try {
    unlinkSync(lockFile);
  } catch {}
}
