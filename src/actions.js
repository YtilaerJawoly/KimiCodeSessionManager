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
    const cmd = isWin ? 'cmd' : 'kimi';
    const cmdArgs = isWin ? ['/c', 'start', '', 'kimi', ...args] : args;

    const child = spawner(cmd, cmdArgs, { cwd, detached: !isWin, stdio: 'ignore' });
    let settled = false;

    const fail = (msg) => {
      if (settled) return;
      settled = true;
      reject(new Error(`无法启动 Kimi Code (${cmd} ${cmdArgs.join(' ')}): ${msg}`));
    };

    child.on('error', (err) => fail(err.message));

    child.on('spawn', () => {
      if (isWin) {
        if (!settled) {
          settled = true;
          child.unref();
          resolve(child);
        }
      } else {
        const timer = setTimeout(() => {
          if (settled) return;
          settled = true;
          child.unref();
          resolve(child);
        }, 500);

        child.on('exit', (code) => {
          if (settled) return;
          if (code === 0) {
            settled = true;
            clearTimeout(timer);
            child.unref();
            resolve(child);
          } else if (code !== 0) {
            settled = true;
            clearTimeout(timer);
            reject(new Error(`Kimi Code 进程异常退出，退出码：${code}`));
          }
        });
      }
    });
  });
}
