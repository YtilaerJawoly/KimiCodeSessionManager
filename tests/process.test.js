import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import {
  runCommand,
  runPowerShell,
  runCommandWithTimeout,
  spawnDetached,
} from '../src/process.js';

describe('process', () => {
  it('runCommand collects stdout on success', async () => {
    const spawn = makeMockSpawn({ code: 0, stdout: 'ok' });
    const result = await runCommand('cmd', ['arg'], {}, spawn);
    assert.equal(result.success, true);
    assert.equal(result.code, 0);
    assert.equal(result.stdout, 'ok');
    assert.equal(result.message, 'ok');
  });

  it('runCommand collects stderr on failure', async () => {
    const spawn = makeMockSpawn({ code: 1, stderr: 'err' });
    const result = await runCommand('cmd', ['arg'], {}, spawn);
    assert.equal(result.success, false);
    assert.equal(result.code, 1);
    assert.equal(result.stderr, 'err');
    assert.equal(result.message, 'err');
  });

  it('runCommand returns failure on spawn error', async () => {
    const spawn = () => {
      const child = new EventEmitter();
      process.nextTick(() => child.emit('error', new Error('spawn err')));
      return child;
    };
    const result = await runCommand('cmd', ['arg'], {}, spawn);
    assert.equal(result.success, false);
    assert.equal(result.message, 'spawn err');
  });

  it('runPowerShell uses powershell.exe on Windows and pwsh elsewhere', async () => {
    const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
    let captured;
    const spawn = (cmd, args) => {
      captured = { cmd, args };
      return makeMockSpawn({ code: 0, stdout: 'done' })();
    };

    try {
      Object.defineProperty(process, 'platform', { value: 'win32' });
      await runPowerShell('Get-Date', {}, spawn);
      assert.equal(captured.cmd, 'powershell.exe');

      Object.defineProperty(process, 'platform', { value: 'darwin' });
      await runPowerShell('Get-Date', {}, spawn);
      assert.equal(captured.cmd, 'pwsh');
    } finally {
      Object.defineProperty(process, 'platform', originalPlatform);
    }
  });

  it('runCommandWithTimeout kills child and returns failure on timeout', async () => {
    const spawn = () => {
      const child = new EventEmitter();
      child.stdout = new EventEmitter();
      child.stderr = new EventEmitter();
      child.kill = () => {};
      // never emits close
      return child;
    };
    const result = await runCommandWithTimeout('cmd', ['arg'], {}, 50, spawn);
    assert.equal(result.success, false);
    assert.equal(result.message, 'timeout');
  });

  it('runCommandWithTimeout returns result when child finishes before timeout', async () => {
    const spawn = makeMockSpawn({ code: 0, stdout: 'fast' });
    const result = await runCommandWithTimeout('cmd', ['arg'], {}, 1000, spawn);
    assert.equal(result.success, true);
    assert.equal(result.message, 'fast');
  });

  it('spawnDetached resolves with child on spawn', async () => {
    const spawn = () => {
      const child = new EventEmitter();
      process.nextTick(() => child.emit('spawn'));
      return child;
    };
    const child = await spawnDetached('cmd', ['arg'], {}, spawn);
    assert.ok(child);
  });

  it('spawnDetached rejects on spawn error', async () => {
    const spawn = () => {
      const child = new EventEmitter();
      process.nextTick(() => child.emit('error', new Error('boom')));
      return child;
    };
    await assert.rejects(() => spawnDetached('cmd', ['arg'], {}, spawn), /boom/);
  });
});

function makeMockSpawn({ code = 0, error = null, stdout = '', stderr = '' } = {}) {
  return (cmd, args, options) => {
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.kill = () => {};
    process.nextTick(() => {
      if (error) {
        child.emit('error', error);
        return;
      }
      if (stdout) child.stdout.emit('data', stdout);
      if (stderr) child.stderr.emit('data', stderr);
      child.emit('close', code);
    });
    return child;
  };
}
