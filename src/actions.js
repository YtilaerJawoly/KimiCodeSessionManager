import { spawn, spawnSync } from 'node:child_process';
import { platform, homedir } from 'node:os';
import { resolve as pathResolve, join, delimiter } from 'node:path';
import { writeFile, unlink, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { spawnDetached } from './process.js';

/**
 * 会话动作模块
 *
 * 职责：
 *   1. 继续已有会话（continueSession）。
 *   2. 为指定项目新建会话（createSession）。
 *   3. 查找 Kimi Code 可执行文件并启动合适的终端窗口。
 *
 * 设计原则：
 *   - 平台相关逻辑集中在 openKimi 中，外部调用者无需关心 Windows / Unix 差异。
 *   - Windows 优先在 Windows Terminal 新标签页打开；否则使用独立 PowerShell 窗口，
 *     避免子进程继承 ksm 的控制台句柄导致 TUI 检测不到终端而闪退。
 *   - 启动失败时清理已生成的临时 PowerShell 脚本，保持 tmp/ 目录整洁。
 */

const writeFileAsync = promisify(writeFile);
const unlinkAsync = promisify(unlink);

/**
 * 继续指定会话。
 */
export function continueSession(session, spawner, env = process.env) {
  return openKimi(['-S', session.id], session.projectPath, session.projectName, spawner, env);
}

/**
 * 为指定项目新建一个 Kimi Code 会话。
 */
export function createSession(projectPath, projectName, spawner, env = process.env) {
  return openKimi([], projectPath, projectName, spawner, env);
}

/**
 * 在 KIMI_HOME、用户目录和 PATH 中查找 Kimi Code 可执行文件。
 * 找不到时返回字符串 'kimi'，交给系统 PATH 再次解析。
 */
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

/**
 * 检测 Windows Terminal 可执行文件路径。
 *
 * 注意：WindowsApps appx 执行别名是重解析点，existsSync 可能返回 false，
 * 因此先使用 where.exe 在 PATH 中查找，再回退到常见安装路径。
 */
function findWindowsTerminal() {
  if (platform() !== 'win32') return null;

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

/**
 * 判断当前环境是否应使用 Windows Terminal。
 */
function useWindowsTerminal(env = process.env) {
  return platform() === 'win32' && (!!env.WT_SESSION || !!findWindowsTerminal());
}

/**
 * 从项目路径中提取项目名称；如果调用方已提供显式名称则直接使用。
 */
function getProjectName(projectPath, explicitName) {
  if (explicitName) return explicitName;
  const normalized = projectPath.replace(/\\/g, '/');
  const parts = normalized.split('/').filter(Boolean);
  return parts[parts.length - 1] || projectPath;
}

/**
 * 启动 Kimi Code。
 *
 * @param {string[]} args 传递给 kimi 的参数
 * @param {string} cwd 工作目录
 * @param {string} [projectName] 显示用的项目名称
 * @param {Function} [spawner=spawn] 用于测试注入的子进程启动函数
 * @param {Object} [env=process.env] 环境变量
 *
 * 平台策略：
 *   - Windows + WT：wt.exe 新标签页
 *   - Windows 无 WT：cmd.exe /c start 打开独立 PowerShell 窗口
 *   - 类 Unix：后台启动 kimi
 */
export async function openKimi(args, cwd, projectName, spawner = spawn, env = process.env) {
  const inWt = useWindowsTerminal(env);
  const cwdResolved = pathResolve(cwd);
  const title = getProjectName(cwdResolved, projectName);
  const kimiPath = findKimiExecutable(env);
  let cmd, cmdArgs, options;
  let scriptPath;

  if (inWt) {
    scriptPath = await createTempPowerShellScript(cwdResolved, title, args, kimiPath);
    cmd = 'wt.exe';
    cmdArgs = ['-w', '0', 'nt', '-p', 'PowerShell', '-d', cwdResolved, '--title', title, 'powershell', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath];
    options = { detached: true, stdio: 'ignore' };
  } else if (platform() === 'win32') {
    scriptPath = await createTempPowerShellScript(cwdResolved, title, args, kimiPath);
    cmd = 'cmd.exe';
    cmdArgs = ['/c', 'start', '', 'powershell.exe', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath];
    options = { cwd: cwdResolved, detached: true, stdio: 'ignore', windowsHide: false };
  } else {
    cmd = kimiPath;
    cmdArgs = args;
    options = { cwd: cwdResolved, detached: true, stdio: 'ignore' };
  }

  return spawnDetached(cmd, cmdArgs, options, spawner)
    .then((child) => {
      child.unref();
      return child;
    })
    .catch(async (err) => {
      await cleanupTempScript(scriptPath).catch(() => {});
      throw new Error(`无法启动 Kimi Code (${cmd} ${cmdArgs.join(' ')}): ${err.message}`);
    });
}

/**
 * 生成临时 PowerShell 启动脚本。
 *
 * 脚本职责：
 *   1. 切换到项目目录并设置窗口标题。
 *   2. 启动 Kimi Code 并传入参数。
 *   3. 启动失败时显示错误并暂停，避免窗口直接关闭。
 *   4. 执行完毕后自动删除自身。
 */
async function createTempPowerShellScript(cwd, title, args, kimiPath) {
  const safeCwd = cwd.replace(/'/g, "''");
  const safeTitle = title.replace(/'/g, "''");
  const safeKimi = kimiPath.replace(/'/g, "''");
  const safeArgs = args.map(a =>
    typeof a === 'string'
      ? `'${a.replace(/'/g, "''")}'`
      : `'${String(a).replace(/'/g, "''")}'`
  ).join(' ');

  const script = `
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
Set-Location -LiteralPath '${safeCwd}'
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
  // 保证临时目录存在，避免首次运行或目录被删除时写入失败
  mkdirSync(tmpDir, { recursive: true });
  // 使用 UTF-8 BOM 编码，避免 PowerShell 5.x 把中文路径识别为 GBK 乱码
  const bom = Buffer.from([0xEF, 0xBB, 0xBF]);
  const content = Buffer.from(script, 'utf8');
  await writeFileAsync(tmpFile, Buffer.concat([bom, content]));
  return tmpFile;
}

/**
 * 清理临时启动脚本。
 */
export async function cleanupTempScript(scriptPath) {
  try {
    await unlinkAsync(scriptPath);
  } catch {
    // ignore
  }
}
