import { spawn } from 'node:child_process';
import { platform } from 'node:os';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { getKimiHome } from './config.js';
import { readKimiLatestVersion, getKimiInstalledVersion } from './kimi-version.js';
import { findLatestStable, isNewer } from './version.js';

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
 * 直接在 ksm 所在的终端窗口中执行安装脚本，并等待其完成。
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

  return runPowerShellCommand(
    'irm https://code.kimi.com/kimi-code/install.ps1 | iex',
    spawner
  );
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

  const current = await getKimiInstalledVersion(home);
  const latest = readKimiLatestVersion(home);

  return {
    installed: true,
    current,
    latest,
    hasUpdate: !!current && !!latest && isNewer(latest, current),
  };
}

/**
 * 检查 ksm 当前版本与远程最新稳定版是否一致。
 * 远程版本从 git tag 中解析，忽略 prerelease tag；网络失败时静默返回。
 */
export async function checkKsmVersion(cwd, spawner = spawn) {
  const current = readCurrentKsmVersion();
  const latestTag = await getRemoteKsmVersion(cwd, spawner);
  const latest = latestTag ? latestTag.replace(/^v/, '') : '';

  return {
    current,
    latest,
    hasUpdate: !!current && !!latest && isNewer(latest, current),
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
 * 通过 git ls-remote --tags origin 获取远程稳定版本 tag。
 * 解析所有 `refs/tags/vX.Y.Z` 与 `refs/tags/vX.Y.Z^{}`，
 * 过滤 prerelease，取最大稳定版本。
 * 如果 3 秒内未完成，自动放弃，避免阻塞菜单。
 */
async function getRemoteKsmVersion(cwd, spawner) {
  return new Promise((resolve) => {
    const child = spawner('git', ['ls-remote', '--tags', 'origin'], { cwd, stdio: 'pipe' });
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
      const tags = [];
      for (const line of stdout.trim().split('\n')) {
        const parts = line.trim().split(/\s+/);
        if (parts.length < 2) continue;
        const ref = parts[1];
        // 只取真正的 tag ref，跳过指向 commit 的 dereferenced ref
        const match = ref.match(/^refs\/tags\/(v\d+\.\d+\.\d+(?:-[a-zA-Z0-9.]+)?)$/);
        if (match) tags.push(match[1]);
      }
      const latest = findLatestStable(tags);
      resolve(latest || '');
    });
  });
}
