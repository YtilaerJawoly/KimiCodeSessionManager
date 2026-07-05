import { spawn, spawnSync } from 'node:child_process';
import { platform, homedir } from 'node:os';
import { resolve as pathResolve, join, delimiter } from 'node:path';
import { writeFile, unlink, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const writeFileAsync = promisify(writeFile);
const unlinkAsync = promisify(unlink);

export function continueSession(session, spawner, env = process.env) {
  return openKimi(['-S', session.id], session.projectPath, session.projectName, spawner, env);
}

export function createSession(projectPath, projectName, spawner, env = process.env) {
  return openKimi([], projectPath, projectName, spawner, env);
}

function findKimiExecutable(env = process.env) {
  const candidates = [];
  if (env.KIMI_HOME) {
    candidates.push(join(env.KIMI_HOME, 'bin', 'kimi.exe'));
    candidates.push(join(env.KIMI_HOME, 'bin', 'kimi'));
  }
  candidates.push(join(homedir(), '.kimi-code', 'bin', 'kimi.exe'));
  candidates.push(join(homedir(), '.kimi-code', 'bin', 'kimi'));

  for (const p of candidates) {
    if (existsSync(p)) return p;
  }

  const pathDirs = (env.PATH || '').split(delimiter).filter(Boolean);
  const extensions = platform() === 'win32' ? ['.exe', '.cmd', '.bat', ''] : [''];
  for (const dir of pathDirs) {
    for (const ext of extensions) {
      const p = join(dir, 'kimi' + ext);
      if (existsSync(p)) return p;
    }
  }
  return 'kimi';
}

function findWindowsTerminal() {
  if (platform() !== 'win32') return null;

  // WindowsApps appx execution aliases are reparse points; existsSync may return false.
  // Use where.exe to reliably detect wt.exe on PATH.
  try {
    const result = spawnSync('where.exe', ['wt.exe'], { encoding: 'utf8', shell: false, windowsHide: true });
    if (result.status === 0 && result.stdout) {
      const first = result.stdout.trim().split(/\r?\n/)[0];
      if (first) return first;
    }
  } catch {
    // fall through
  }

  const candidates = [
    join(process.env.LOCALAPPDATA || '', 'Microsoft', 'WindowsApps', 'wt.exe'),
    join(process.env.ProgramFiles || '', 'WindowsApps', 'Microsoft.WindowsTerminal_8wekyb3d8bbwe', 'wt.exe'),
  ];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  return null;
}

function useWindowsTerminal(env = process.env) {
  return platform() === 'win32' && (!!env.WT_SESSION || !!findWindowsTerminal());
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
  const kimiPath = findKimiExecutable(env);
  let cmd, cmdArgs, options;
  let scriptPath;

  if (inWt) {
    // 在 Windows Terminal 当前窗口的新标签页中打开
    scriptPath = await createTempPowerShellScript(cwdResolved, title, args, kimiPath);
    cmd = 'wt.exe';
    cmdArgs = ['-w', '0', 'nt', '-p', 'PowerShell', '-d', cwdResolved, '--title', title, 'powershell', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath];
    options = { detached: true, stdio: 'ignore' };
  } else if (platform() === 'win32') {
    // 在普通 Windows 控制台中，使用 cmd.exe /c start 打开新的独立 PowerShell 窗口运行 Kimi
    // 避免子进程继承 ksm 的控制台句柄导致 TUI 检测不到终端而闪退
    scriptPath = await createTempPowerShellScript(cwdResolved, title, args, kimiPath);
    cmd = 'cmd.exe';
    cmdArgs = ['/c', 'start', '', 'powershell.exe', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath];
    options = { cwd: cwdResolved, detached: true, stdio: 'ignore', windowsHide: false };
  } else {
    // 类 Unix 系统直接在后台启动
    cmd = kimiPath;
    cmdArgs = args;
    options = { cwd: cwdResolved, detached: true, stdio: 'ignore' };
  }

  return new Promise((resolve, reject) => {
    const child = spawner(cmd, cmdArgs, options);
    let settled = false;

    child.on('error', (err) => {
      if (settled) return;
      settled = true;
      cleanupTempScript(scriptPath).catch(() => {});
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

async function createTempPowerShellScript(cwd, title, args, kimiPath) {
  const safeCwd = cwd.replace(/'/g, "''");
  const safeTitle = title.replace(/'/g, "''");
  const safeKimi = kimiPath.replace(/'/g, "''");
  const safeArgs = args.map(a => typeof a === 'string' ? `'${a.replace(/'/g, "''")}'` : `'${String(a).replace(/'/g, "''")}'`).join(' ');
  const script = `
Set-Location '${safeCwd}'
$Host.UI.RawUI.WindowTitle = '${safeTitle}'
try {
  & '${safeKimi}' ${safeArgs}
} catch {
  Write-Host '启动 Kimi Code 失败：' -ForegroundColor Red
  Write-Host $_.Exception.Message -ForegroundColor Red
  Read-Host '按 Enter 键退出'
} finally {
  Remove-Item -LiteralPath '$PSCommandPath' -ErrorAction SilentlyContinue
}
`;
  const tmpDir = pathResolve(fileURLToPath(import.meta.url), '..', '..', 'tmp');
  const tmpFile = pathResolve(tmpDir, `ksm-launcher-${Date.now()}.ps1`);
  await writeFileAsync(tmpFile, script, 'utf8');
  return tmpFile;
}

export async function cleanupTempScript(scriptPath) {
  try {
    await unlinkAsync(scriptPath);
  } catch {
    // ignore
  }
}
