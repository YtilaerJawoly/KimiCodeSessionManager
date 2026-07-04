import { spawn } from 'node:child_process';
import { platform } from 'node:os';
import { readFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

export function getKimiHome(env = process.env) {
  const raw = env.KIMI_HOME?.trim();
  return raw ? resolve(raw) : resolve(homedir(), '.kimi-code');
}

export async function updateKimiCode(spawner = spawn) {
  return runPowerShellCommand(
    'irm https://code.kimi.com/kimi-code/install.ps1 | iex',
    spawner
  );
}

export async function updateKsm(cwd, spawner = spawn) {
  return runCommand('git', ['pull'], cwd, spawner);
}

function runPowerShellCommand(command, spawner) {
  return new Promise((resolve) => {
    const isWin = platform() === 'win32';
    const child = spawner(
      isWin ? 'powershell.exe' : 'pwsh',
      ['-Command', command],
      { stdio: 'pipe' }
    );
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

function runCommand(cmd, args, cwd, spawner) {
  return new Promise((resolve) => {
    const child = spawner(cmd, args, { cwd, stdio: 'pipe' });
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

export async function checkKimiCodeVersion(env = process.env) {
  const home = getKimiHome(env);
  const exe = join(home, 'bin', 'kimi.exe');
  const installed = existsSync(exe);

  if (!installed) {
    return { installed: false, current: '', latest: readLatestJson(home), hasUpdate: false };
  }

  const current = await getKimiExecutableVersion(exe);
  const latest = readLatestJson(home);

  return {
    installed: true,
    current,
    latest,
    hasUpdate: !!current && !!latest && current !== latest,
  };
}

function readLatestJson(home) {
  try {
    const text = readFileSync(join(home, 'updates', 'latest.json'), 'utf8');
    const data = JSON.parse(text);
    return data.latest || data.version || data.manifest?.version || '';
  } catch {
    return '';
  }
}

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

export async function checkKsmVersion(cwd, spawner = spawn) {
  const current = readCurrentKsmVersion();
  const latest = await getRemoteKsmVersion(cwd, spawner);

  return {
    current,
    latest,
    hasUpdate: !!current && !!latest && current !== latest,
  };
}

function readCurrentKsmVersion() {
  try {
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
    return pkg.version || '';
  } catch {
    return '';
  }
}

async function getRemoteKsmVersion(cwd, spawner) {
  return new Promise((resolve) => {
    const child = spawner('git', ['ls-remote', 'origin', 'HEAD'], { cwd, stdio: 'pipe' });
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (data) => { stdout += data; });
    child.stderr?.on('data', (data) => { stderr += data; });
    child.on('error', () => resolve(''));
    child.on('close', (code) => {
      if (code !== 0) {
        resolve('');
        return;
      }
      const line = stdout.trim().split('\n')[0] || '';
      const sha = line.split(/\s+/)[0] || '';
      // 将完整 SHA 截断为 7 位作为版本标识
      resolve(sha.slice(0, 7));
    });
  });
}
