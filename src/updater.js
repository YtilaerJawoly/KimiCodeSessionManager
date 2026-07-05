import { spawn } from 'node:child_process';
import { platform } from 'node:os';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { getKimiHome } from './config.js';
import { readKimiLatestVersion } from './kimi-version.js';

/**
 * 更新器模块
 *
 * 职责：
 *   1. 安装 / 更新 Kimi Code（Windows 弹出新 PowerShell 窗口；非 Windows 在当前终端执行安装命令）。
 *   2. 更新 ksm（git pull）。
 *   3. 检查 Kimi Code 与 ksm 是否有新版本。
 *
 * 设计原则：
 *   - Kimi home 解析复用 config.js 的 getKimiHome，避免重复。
 *   - latest.json 解析复用 kimi-version.js 的 readKimiLatestVersion，避免重复。
 *   - 子进程标准输出 / 错误收集统一到一个内部辅助函数，减少重复代码。
 */

/**
 * 更新 / 安装 Kimi Code。
 *
 * Windows：在独立 PowerShell 窗口中执行官方安装脚本，并立即返回成功，
 * 因为实际安装过程在新的交互窗口中完成。
 *
 * 非 Windows：在当前终端执行安装命令并等待结束，返回执行结果。
 *
 * @param {Function} [spawner=spawn] 用于测试注入的子进程启动函数
 */
export async function updateKimiCode(spawner = spawn) {
  const isWin = platform() === 'win32';
  if (!isWin) {
    return runPowerShellCommand(
      'irm https://code.kimi.com/kimi-code/install.ps1 | iex',
      spawner
    );
  }

  return new Promise((resolve) => {
    const command = [
      'irm https://code.kimi.com/kimi-code/install.ps1 | iex;',
      "Write-Host '';",
      "Write-Host '安装完成，请关闭此窗口并重新打开一个终端使用 Kimi Code。' -ForegroundColor Green;",
      "Read-Host '按 Enter 键退出'",
    ].join(' ');

    const child = spawner(
      'powershell.exe',
      ['-NoExit', '-Command', command],
      { detached: true }
    );

    child.on('error', (err) => resolve({ success: false, message: err.message }));
    child.on('spawn', () => {
      resolve({
        success: true,
        message: '已在新窗口启动 Kimi Code 安装程序，完成后请重新打开终端。',
      });
    });
  });
}

/**
 * 在指定目录执行 git pull 更新 ksm。
 */
export async function updateKsm(cwd, spawner = spawn) {
  return runCommand('git', ['pull'], cwd, spawner);
}

/**
 * 执行一条 PowerShell 命令并等待其结束。
 */
function runPowerShellCommand(command, spawner) {
  const isWin = platform() === 'win32';
  return runWithStdio(
    isWin ? 'powershell.exe' : 'pwsh',
    ['-Command', command],
    { stdio: 'pipe' },
    spawner
  );
}

/**
 * 执行任意命令并等待其结束，收集 stdout / stderr。
 */
function runCommand(cmd, args, cwd, spawner) {
  return runWithStdio(cmd, args, { cwd, stdio: 'pipe' }, spawner);
}

/**
 * 通用子进程执行辅助函数。
 * 统一处理 error / close 事件，按退出码返回成功或失败结果。
 */
function runWithStdio(cmd, args, options, spawner) {
  return new Promise((resolve) => {
    const child = spawner(cmd, args, options);
    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (data) => { stdout += data; });
    child.stderr?.on('data', (data) => { stderr += data; });
    child.on('error', (err) => resolve({ success: false, message: err.message }));
    child.on('close', (code) => {
      if (code === 0) {
        resolve({ success: true, message: stdout.trim() || 'OK' });
      } else {
        resolve({ success: false, message: (stderr || stdout).trim() || `exit code ${code}` });
      }
    });
  });
}

/**
 * 检查本地 Kimi Code 是否已安装，以及是否有新版本可用。
 */
export async function checkKimiCodeVersion(env = process.env) {
  const home = getKimiHome(env);
  const exe = join(home, 'bin', 'kimi.exe');
  const installed = existsSync(exe);

  if (!installed) {
    return { installed: false, current: '', latest: readKimiLatestVersion(home), hasUpdate: false };
  }

  const current = await getKimiExecutableVersion(exe);
  const latest = readKimiLatestVersion(home);

  return {
    installed: true,
    current,
    latest,
    hasUpdate: !!current && !!latest && current !== latest,
  };
}

/**
 * 调用 kimi --version 解析当前可执行文件版本号。
 */
function getKimiExecutableVersion(exe) {
  return new Promise((resolve) => {
    const child = spawn(exe, ['--version'], { shell: false });
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (data) => { stdout += data; });
    child.stderr?.on('data', (data) => { stderr += data; });
    child.on('error', () => resolve(''));
    child.on('close', (code) => {
      const output = (stdout || stderr).trim();
      if (code !== 0 || !output) {
        resolve('');
        return;
      }
      const match = output.match(/(?:kimi\s+)?v?(\d+\.\d+(?:\.\d+)?)/i);
      resolve(match ? match[1] : output);
    });
  });
}

/**
 * 检查 ksm 当前版本与远程最新 commit 是否一致。
 */
export async function checkKsmVersion(cwd, spawner = spawn) {
  const current = readCurrentKsmVersion();
  const latest = await getRemoteKsmVersion(cwd, spawner);

  return {
    current,
    latest,
    hasUpdate: !!current && !!latest && current !== latest,
  };
}

/**
 * 从 package.json 读取当前 ksm 版本。
 */
function readCurrentKsmVersion() {
  try {
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
    return pkg.version || '';
  } catch {
    return '';
  }
}

/**
 * 通过 git ls-remote 获取远程 HEAD 的短 SHA。
 * 如果 3 秒内未完成，则自动放弃，避免阻塞菜单。
 */
async function getRemoteKsmVersion(cwd, spawner) {
  return new Promise((resolve) => {
    const child = spawner('git', ['ls-remote', 'origin', 'HEAD'], { cwd, stdio: 'pipe' });
    let stdout = '';
    let stderr = '';
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try { child.kill(); } catch {}
      resolve('');
    }, 3000);

    child.stdout?.on('data', (data) => { stdout += data; });
    child.stderr?.on('data', (data) => { stderr += data; });
    child.on('error', () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve('');
    });
    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code !== 0) {
        resolve('');
        return;
      }
      const line = stdout.trim().split('\n')[0] || '';
      const sha = line.split(/\s+/)[0] || '';
      resolve(sha.slice(0, 7));
    });
  });
}
