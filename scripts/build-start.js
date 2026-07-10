import { spawn } from 'node:child_process';
import { platform } from 'node:os';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * 编译 scripts/start.cs 为 start.exe（仅 Windows）。
 * 非 Windows 平台或无 .NET Framework 时静默跳过，不阻断 npm install。
 */

function findCsc() {
  if (platform() !== 'win32') return null;
  const windir = process.env.windir || process.env.WINDIR || 'C:\\Windows';
  const candidates = [
    join(windir, 'Microsoft.NET', 'Framework64', 'v4.0.30319', 'csc.exe'),
    join(windir, 'Microsoft.NET', 'Framework', 'v4.0.30319', 'csc.exe'),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

const csc = findCsc();
if (!csc) {
  console.log('csc.exe not found, skipping start.exe build.');
  process.exit(0);
}

const child = spawn(csc, ['/out:start.exe', 'scripts/start.cs'], { stdio: 'inherit' });
child.on('close', (code) => process.exit(code ?? 0));
