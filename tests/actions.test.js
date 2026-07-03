import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { platform } from 'node:os';
import { resolve } from 'node:path';
import { continueSession, createSession, openKimi } from '../src/actions.js';

const isWin = platform() === 'win32';

function makeMockSpawn({ error = null } = {}) {
  return (cmd, args, options) => {
    const child = new EventEmitter();
    child.unref = () => {};
    process.nextTick(() => {
      if (error) {
        child.emit('error', error);
      } else {
        child.emit('spawn');
      }
    });
    return child;
  };
}

describe('actions', () => {
  it('continueSession passes -S, id and cwd to spawn', async () => {
    let captured;
    const spawn = (cmd, args, options) => {
      captured = { cmd, args, options };
      return makeMockSpawn()();
    };
    await continueSession({ id: 'session_abc', projectPath: 'E:/foo' }, spawn, {});
    assert.equal(captured.cmd, 'kimi');
    assert.equal(captured.args.includes('-S'), true);
    assert.equal(captured.args.includes('session_abc'), true);
    assert.equal(captured.options.cwd, resolve('E:/foo'));
    assert.equal(captured.options.detached, true);
  });

  it('createSession passes correct args and cwd', async () => {
    let captured;
    const spawn = (cmd, args, options) => {
      captured = { cmd, args, options };
      return makeMockSpawn()();
    };
    await createSession('E:/bar', 'bar', spawn, {});
    assert.equal(captured.cmd, 'kimi');
    assert.deepEqual(captured.args, []);
    assert.equal(captured.options.cwd, resolve('E:/bar'));
    assert.equal(captured.options.detached, true);
  });

  it('resolves immediately on spawn', async () => {
    const spawn = makeMockSpawn();
    const child = await openKimi(['-S', 'session_abc'], 'E:/foo', 'foo', spawn, {});
    assert.ok(child);
  });

  it('uses Windows Terminal when WT_SESSION is set', async () => {
    if (!isWin) return;
    let captured;
    const spawn = (cmd, args, options) => {
      captured = { cmd, args, options };
      return makeMockSpawn()();
    };
    await continueSession({ id: 'session_abc', projectPath: 'E:/foo' }, spawn, { WT_SESSION: 'test' });
    assert.equal(captured.cmd, 'wt.exe');
    assert.deepEqual(captured.args, ['-w', '0', 'nt', '-p', 'PowerShell', '-d', resolve('E:/foo'), '--title', 'E:', 'kimi', '-S', 'session_abc']);
    assert.equal(captured.options.detached, true);
  });

  it('rejects on spawn error', async () => {
    const spawn = makeMockSpawn({ error: new Error('spawn failed') });
    await assert.rejects(
      () => openKimi(['-S', 'session_bad'], 'E:/foo', 'foo', spawn, {}),
      /无法启动 Kimi Code/
    );
  });
});
