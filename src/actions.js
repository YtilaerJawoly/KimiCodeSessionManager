import { spawn } from 'node:child_process';
import { platform } from 'node:os';
import { resolve as pathResolve } from 'node:path';
import { writeFile, unlink } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

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

export async function openKimi(args, cwd, projectName, spawner = spawn, env = process.env) {
  const inWt = useWindowsTerminal(env);
  const cwdResolved = pathResolve(cwd);
  const title = getProjectName(cwdResolved, projectName);
  let cmd, cmdArgs, options;

  if (inWt) {
    const scriptPath = await createTempPowerShellScript(cwdResolved, title, args);
    cmd = 'wt.exe';
    cmdArgs = ['-w', '0', 'nt', '-p', 'PowerShell', '-d', cwdResolved, '--title', title, 'powershell', '-ExecutionPolicy', 'Bypass', '-File', scriptPath];
    options = { detached: true, stdio: 'ignore' };
  } else {
    const isWin = platform() === 'win32';
    cmd = 'kimi';
    cmdArgs = args;
    options = { cwd: cwdResolved, detached: true, stdio: 'ignore', windowsHide: isWin };
  }

  return new Promise((resolve, reject) => {
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

async function createTempPowerShellScript(cwd, title, args) {
  const safeCwd = cwd.replace(/'/g, "''");
  const safeTitle = title.replace(/'/g, "''");
  const safeArgs = args.map(a => typeof a === 'string' ? `'${a.replace(/'/g, "''")}'` : `'${String(a).replace(/'/g, "''")}'`).join(' ');
  const script = `
Set-Location '${safeCwd}'
Start-Sleep -Seconds 2
$Host.UI.RawUI.WindowTitle = '${safeTitle}'
& 'kimi' ${safeArgs}
`;
  const tmpDir = pathResolve(fileURLToPath(import.meta.url), '..', '..', 'tmp');
  const tmpFile = pathResolve(tmpDir, `ksm-launcher-${Date.now()}.ps1`);
  await writeFile(tmpFile, script, 'utf8');
  return tmpFile;
}

export async function cleanupTempScript(scriptPath) {
  try {
    await unlink(scriptPath);
  } catch {
    // ignore
  }
}
