import { spawn } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { getKimiHome } from './config.js';
import { readKimiLatestVersion, getKimiInstalledVersion } from './kimi-version.js';
import { findLatestStable, isNewer } from './version.js';
import { runCommand, runPowerShell, runCommandWithTimeout } from './process.js';

/**
 * 更新器模块
 *
 * 职责：
 *   1. 安装 / 更新 Kimi Code（在当前终端执行安装命令）。
 *   2. 更新 ksm（git pull）。
 *   3. 检查 Kimi Code 与 ksm 是否有新版本。
 *
 * 设计原则：
 *   - Kimi home 解析复用 config.js 的 getKimiHome，避免重复。
 *   - latest.json 解析复用 kimi-version.js 的 readKimiLatestVersion，避免重复。
 *   - 子进程执行统一复用 process.js 的 runCommand / runPowerShell / runCommandWithTimeout。
 */

/**
 * 更新 / 安装 Kimi Code。
 *
 * 直接在 ksm 所在的终端窗口中执行安装脚本，并等待其完成。
 *
 * @param {Function} [spawner=spawn] 用于测试注入的子进程启动函数
 */
export async function updateKimiCode(spawner = spawn) {
  return runPowerShell(
    'irm https://code.kimi.com/kimi-code/install.ps1 | iex',
    {},
    spawner
  );
}

/**
 * 在指定目录执行 git pull 更新 ksm。
 */
export async function updateKsm(cwd, spawner = spawn) {
  return runCommand('git', ['pull'], { cwd }, spawner);
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
  const result = await runCommandWithTimeout(
    'git', ['ls-remote', '--tags', 'origin'], { cwd }, 3000, spawner
  );
  if (!result.success) return '';

  const tags = [];
  for (const line of result.stdout.trim().split('\n')) {
    const parts = line.trim().split(/\s+/);
    if (parts.length < 2) continue;
    const ref = parts[1];
    const match = ref.match(/^refs\/tags\/(v\d+\.\d+\.\d+(?:-[a-zA-Z0-9.]+)?)$/);
    if (match) tags.push(match[1]);
  }
  return findLatestStable(tags) || '';
}
