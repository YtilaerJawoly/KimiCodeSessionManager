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

  it('checkKsmVersion detects a newer stable version from remote tags', async () => {
    const stdout = [
      'aabbccdd00112233\trefs/tags/v1.0.0',
      'ddeeff0011223344\trefs/tags/v1.1.0-beta.1',
      '0011223344556677\trefs/tags/v1.0.1',
    ].join('\n');
    let captured;
    const spawn = (cmd, args, options) => {
      captured = { cmd, args };
      return makeMockSpawn({ code: 0, stdout })();
    };
    const result = await checkKsmVersion('/any/dir', spawn);
    assert.equal(captured.cmd, 'git');
    assert.deepEqual(captured.args, ['ls-remote', '--tags', 'origin']);
    assert.equal(result.current, '1.0.0');
    assert.equal(result.latest, '1.0.1');
    assert.equal(result.hasUpdate, true);
  });

  it('checkKsmVersion ignores prerelease-only tags', async () => {
    const stdout = [
      'aabbccdd00112233\trefs/tags/v1.1.0-beta.1',
      'ddeeff0011223344\trefs/tags/v1.1.0-alpha.2',
    ].join('\n');
    const spawn = makeMockSpawn({ code: 0, stdout });
    const result = await checkKsmVersion('/any/dir', spawn);
    assert.equal(result.current, '1.0.0');
    assert.equal(result.latest, '');
    assert.equal(result.hasUpdate, false);
  });

  it('checkKsmVersion returns no update when already on latest stable', async () => {
    const stdout = 'aabbccdd00112233\trefs/tags/v1.0.0\n';
    const spawn = makeMockSpawn({ code: 0, stdout });
    const result = await checkKsmVersion('/any/dir', spawn);
    assert.equal(result.current, '1.0.0');
    assert.equal(result.latest, '1.0.0');
    assert.equal(result.hasUpdate, false);
  });

  it('checkKsmVersion stays silent when git command fails', async () => {
    const spawn = makeMockSpawn({ code: 1, stderr: 'fatal: unable to access' });
    const result = await checkKsmVersion('/any/dir', spawn);
    assert.equal(result.current, '1.0.0');
    assert.equal(result.latest, '');
    assert.equal(result.hasUpdate, false);
  });
});
