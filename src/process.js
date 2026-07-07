import { spawn } from 'node:child_process';
import { platform } from 'node:os';

/**
 * 运行命令并等待结束，收集 stdout / stderr。
 */
export function runCommand(cmd, args, options = {}, spawner = spawn) {
  return runWithStdio(cmd, args, { stdio: 'pipe', ...options }, spawner);
}

/**
 * 在当前平台执行 PowerShell 命令。
 */
export function runPowerShell(command, options = {}, spawner = spawn) {
  const shell = platform() === 'win32' ? 'powershell.exe' : 'pwsh';
  return runWithStdio(shell, ['-Command', command], { stdio: 'pipe', ...options }, spawner);
}

/**
 * 带超时的命令执行。
 */
export function runCommandWithTimeout(cmd, args, options = {}, timeoutMs = 3000, spawner = spawn) {
  return new Promise((resolve) => {
    const child = spawner(cmd, args, { stdio: 'pipe', ...options });
    let stdout = '';
    let stderr = '';
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try { child.kill(); } catch {}
      resolve({ success: false, code: null, stdout, stderr, message: 'timeout' });
    }, timeoutMs);

    child.stdout?.on('data', (data) => { stdout += data; });
    child.stderr?.on('data', (data) => { stderr += data; });
    child.on('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ success: false, code: null, stdout, stderr, message: err.message });
    });
    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(buildResult(code, stdout, stderr));
    });
  });
}

/**
 * 启动分离进程，不等待结束，返回 ChildProcess。
 */
export function spawnDetached(cmd, args, options = {}, spawner = spawn) {
  return new Promise((resolve, reject) => {
    const child = spawner(cmd, args, options);
    let settled = false;

    child.on('error', (err) => {
      if (settled) return;
      settled = true;
      reject(err);
    });
    child.on('spawn', () => {
      if (settled) return;
      settled = true;
      resolve(child);
    });
  });
}

function runWithStdio(cmd, args, options, spawner) {
  return new Promise((resolve) => {
    const child = spawner(cmd, args, options);
    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (data) => { stdout += data; });
    child.stderr?.on('data', (data) => { stderr += data; });
    child.on('error', (err) => resolve({
      success: false, code: null, stdout, stderr, message: err.message,
    }));
    child.on('close', (code) => resolve(buildResult(code, stdout, stderr)));
  });
}

function buildResult(code, stdout, stderr) {
  const success = code === 0;
  const message = success
    ? stdout.trim() || stderr.trim() || 'OK'
    : (stderr || stdout).trim() || `exit code ${code}`;
  return { success, code, stdout, stderr, message };
}
