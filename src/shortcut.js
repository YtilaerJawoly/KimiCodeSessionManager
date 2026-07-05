import { spawn } from 'node:child_process';
import { platform, homedir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { existsSync } from 'node:fs';

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
export async function createDesktopShortcut(startExePath) {
  if (platform() !== 'win32') {
    return { success: false, message: '当前只支持 Windows 桌面快捷方式' };
  }

  const target = resolve(startExePath);
  if (!existsSync(target)) {
    return { success: false, message: `找不到 start.exe: ${target}` };
  }

  const desktop = join(homedir(), 'Desktop');
  const lnk = join(desktop, 'Kimi Code Session Manager.lnk');

  return new Promise((resolve) => {
    const ps = `
      $WshShell = New-Object -ComObject WScript.Shell
      $Shortcut = $WshShell.CreateShortcut('${lnk.replace(/'/g, "''")}')
      $Shortcut.TargetPath = '${target.replace(/'/g, "''")}'
      $Shortcut.WorkingDirectory = '${dirname(target).replace(/'/g, "''")}'
      $Shortcut.Save()
    `.trim();

    const child = spawn('powershell.exe', ['-Command', ps], { stdio: 'pipe' });
    let stderr = '';
    child.stderr?.on('data', (data) => { stderr += data; });
    child.on('error', (err) => resolve({ success: false, message: err.message }));
    child.on('close', (code) => {
      if (code === 0) {
        resolve({ success: true, message: lnk });
      } else {
        resolve({ success: false, message: stderr.trim() || `exit code ${code}` });
      }
    });
  });
}
