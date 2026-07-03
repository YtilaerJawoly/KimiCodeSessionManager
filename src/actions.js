import { spawn } from 'node:child_process';
import { platform } from 'node:os';

export function continueSession(session) {
  return openKimi(['-S', session.id], session.projectPath);
}

export function createSession(projectPath) {
  return openKimi([], projectPath);
}

function openKimi(args, cwd) {
  return new Promise((resolve, reject) => {
    const isWin = platform() === 'win32';
    let cmd, cmdArgs;
    if (isWin) {
      // 使用 start 让 Kimi Code 在新窗口/标签页中打开，并脱离当前终端
      cmd = 'cmd';
      cmdArgs = ['/c', 'start', '', 'kimi', ...args];
    } else {
      cmd = 'kimi';
      cmdArgs = args;
    }
    const child = spawn(cmd, cmdArgs, { cwd, detached: !isWin, stdio: 'ignore' });
    child.on('error', reject);
    child.on('spawn', () => resolve(child));
  });
}
