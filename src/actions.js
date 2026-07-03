import { spawn } from 'node:child_process';
import { platform } from 'node:os';
import { resolve as pathResolve } from 'node:path';

export function continueSession(session, spawner, env = process.env) {
  return openKimi(['-S', session.id], session.projectPath, session.projectName, spawner, env);
}

export function createSession(projectPath, projectName, spawner, env = process.env) {
  return openKimi([], projectPath, projectName, spawner, env);
}

function useWindowsTerminal(env = process.env) {
  return platform() === 'win32' && !!env.WT_SESSION;
}

function getProjectName(projectPath, explicitName) {
  if (explicitName) return explicitName;
  const normalized = projectPath.replace(/\\/g, '/');
  const parts = normalized.split('/').filter(Boolean);
  return parts[parts.length - 1] || projectPath;
}

export function openKimi(args, cwd, projectName, spawner = spawn, env = process.env) {
  return new Promise((resolve, reject) => {
    const inWt = useWindowsTerminal(env);
    const cwdResolved = pathResolve(cwd);
    const title = getProjectName(cwdResolved, projectName);
    let cmd, cmdArgs, options;

    if (inWt) {
      cmd = 'wt.exe';
      cmdArgs = ['-w', '0', 'nt', '-p', 'PowerShell', '-d', cwdResolved, '--title', title, 'kimi', ...args];
      options = { detached: true, stdio: 'ignore' };
    } else {
      const isWin = platform() === 'win32';
      cmd = 'kimi';
      cmdArgs = args;
      options = { cwd: cwdResolved, detached: true, stdio: 'ignore', windowsHide: isWin };
    }

    const child = spawner(cmd, cmdArgs, options);
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
