import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { updateKimiCode, updateKsm, checkKimiCodeVersion, checkKsmVersion } from '../src/updater.js';

function makeMockSpawn({ code = 0, error = null, stdout = '', stderr = '' } = {}) {
  return (cmd, args, options) => {
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
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

describe('updater', () => {
  it('updateKimiCode opens a new PowerShell window on Windows', async () => {
    let captured;
    const spawn = (cmd, args, options) => {
      captured = { cmd, args, options };
      const child = new EventEmitter();
      process.nextTick(() => child.emit('spawn'));
      return child;
    };
    const result = await updateKimiCode(spawn);
    assert.equal(result.success, true);
    assert.equal(result.message, '已在新窗口启动 Kimi Code 安装程序，完成后请重新打开终端。');
    assert.equal(captured.cmd, 'powershell.exe');
    assert.equal(captured.args[0], '-NoExit');
    assert.equal(captured.args[1], '-Command');
    assert.ok(captured.args[2].includes('irm https://code.kimi.com/kimi-code/install.ps1 | iex'));
    assert.ok(captured.options.detached);
  });

  it('updateKimiCode returns failure when spawn fails', async () => {
    const spawn = (cmd, args, options) => {
      const child = new EventEmitter();
      process.nextTick(() => child.emit('error', new Error('spawn error')));
      return child;
    };
    const result = await updateKimiCode(spawn);
    assert.equal(result.success, false);
    assert.equal(result.message, 'spawn error');
  });

  it('updateKsm runs git pull in given directory', async () => {
    let captured;
    const spawn = (cmd, args, options) => {
      captured = { cmd, args, options };
      return makeMockSpawn({ code: 0, stdout: 'Already up to date.' })();
    };
    const result = await updateKsm('/some/dir', spawn);
    assert.equal(result.success, true);
    assert.equal(captured.cmd, 'git');
    assert.deepEqual(captured.args, ['pull']);
    assert.equal(captured.options.cwd, '/some/dir');
  });

  it('checkKimiCodeVersion reports not installed when exe is missing', async () => {
    const result = await checkKimiCodeVersion({ KIMI_HOME: '/nonexistent/path/ksm-test' });
    assert.equal(result.installed, false);
    assert.equal(result.current, '');
    assert.equal(result.hasUpdate, false);
  });

  it('checkKsmVersion returns current version and remote sha', async () => {
    const spawn = makeMockSpawn({ code: 0, stdout: 'abc1234def5678\tHEAD\n' });
    const result = await checkKsmVersion('/any/dir', spawn);
    assert.equal(result.current, '0.1.0');
    assert.equal(result.latest, 'abc1234');
    assert.equal(result.hasUpdate, true);
  });
});
