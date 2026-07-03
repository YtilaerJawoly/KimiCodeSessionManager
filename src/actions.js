import { spawn } from 'node:child_process';
import { platform } from 'node:os';

export function continueSession(session, spawner) {
  return openKimi(['-S', session.id], session.projectPath, spawner);
}

export function createSession(projectPath, spawner) {
  return openKimi([], projectPath, spawner);
}

export function openKimi(args, cwd, spawner = spawn) {
  return new Promise((resolve, reject) => {
    const isWin = platform() === 'win32';
    const cmd = 'kimi';
    const cmdArgs = args;

    const child = spawner(cmd, cmdArgs, {
      cwd,
      detached: true,
      stdio: 'ignore',
      windowsHide: isWin,
    });
    let settled = false;

    child.on('error', (err) => {
      if (settled) return;
      settled = true;
      reject(new Error(`无法启动 Kimi Code (${cmd} ${cmdArgs.join(' ')}): ${err.message}`));
    });

    child.on('spawn', () => {
      if (settled) return;
      settled = true;
      child.unref();
      resolve(child);
    });
  });
}
