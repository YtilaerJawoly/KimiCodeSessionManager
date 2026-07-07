import { spawn } from 'node:child_process';
import { platform, homedir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { existsSync } from 'node:fs';
import { runPowerShell } from './process.js';

/**
 * 桌面快捷方式模块
 *
 * 职责：
 *   1. 在 Windows 桌面创建 start.exe 的快捷方式。
 *
 * 设计原则：
 *   - 仅支持 Windows；其他平台直接返回友好提示。
 *   - 创建前检查目标文件是否存在，避免生成无效快捷方式。
 *   - 使用 PowerShell + WScript.Shell 创建 .lnk，无需额外依赖。
 */

/**
 * 为指定 start.exe 创建桌面快捷方式。
 *
 * @param {string} startExePath start.exe 的绝对或相对路径
 * @returns {Promise<{success: boolean, message: string}>}
 */
export async function createDesktopShortcut(startExePath, spawner = spawn) {
  if (platform() !== 'win32') {
    return { success: false, message: '当前只支持 Windows 桌面快捷方式' };
  }

  const target = resolve(startExePath);
  if (!existsSync(target)) {
    return { success: false, message: `找不到 start.exe: ${target}` };
  }

  const desktop = join(homedir(), 'Desktop');
  const lnk = join(desktop, 'Kimi Code Session Manager.lnk');

  const ps = `
    $WshShell = New-Object -ComObject WScript.Shell
    $Shortcut = $WshShell.CreateShortcut('${lnk.replace(/'/g, "''")}')
    $Shortcut.TargetPath = '${target.replace(/'/g, "''")}'
    $Shortcut.WorkingDirectory = '${dirname(target).replace(/'/g, "''")}'
    $Shortcut.Save()
  `.trim();

  const result = await runPowerShell(ps, { stdio: 'pipe' }, spawner);
  if (result.success) {
    return { success: true, message: lnk };
  }
  return { success: false, message: result.stderr.trim() || `exit code ${result.code}` };
}
