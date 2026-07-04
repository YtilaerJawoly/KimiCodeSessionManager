import { spawn } from 'node:child_process';
import { platform, homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { existsSync } from 'node:fs';

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

function dirname(p) {
  const normalized = p.replace(/\\/g, '/');
  const idx = normalized.lastIndexOf('/');
  return idx >= 0 ? p.slice(0, idx) : p;
}
