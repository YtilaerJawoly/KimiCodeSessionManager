import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { platform } from 'node:os';
import { continueSession, createSession, openKimi } from '../src/actions.js';

const isWin = platform() === 'win32';

function makeMockSpawn({ exitCode = null, delay = 0, error = null } = {}) {
  return (cmd, args, options) => {
    const child = new EventEmitter();
    child.unref = () => {};
    process.nextTick(() => {
      child.emit('spawn');
      if (error) {
        child.emit('error', error);
      } else if (exitCode !== null) {
        setTimeout(() => child.emit('exit', exitCode), delay);
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
      return makeMockSpawn({ delay: 600 })();
    };
    await continueSession({ id: 'session_abc', projectPath: '/e/foo' }, spawn);
    assert.equal(captured.args.includes('-S'), true);
    assert.equal(captured.args.includes('session_abc'), true);
    assert.equal(captured.options.cwd, '/e/foo');
    assert.equal(captured.cmd, isWin ? 'cmd' : 'kimi');
  });

  it('createSession passes correct args and cwd', async () => {
    let captured;
    const spawn = (cmd, args, options) => {
      captured = { cmd, args, options };
      return makeMockSpawn({ delay: 600 })();
    };
    await createSession('/e/bar', spawn);
    assert.deepEqual(captured.args, isWin ? ['/c', 'start', '', 'kimi'] : []);
    assert.equal(captured.options.cwd, '/e/bar');
  });

  it('rejects on spawn error', async () => {
    const spawn = () => {
      const child = new EventEmitter();
      child.unref = () => {};
      process.nextTick(() => child.emit('error', new Error('spawn failed')));
      return child;
    };
    await assert.rejects(
      () => openKimi(['-S', 'session_bad'], '/e/foo', spawn),
      /无法启动 Kimi Code/
    );
  });

  if (!isWin) {
    it('rejects on immediate non-zero exit', async () => {
      const spawn = makeMockSpawn({ exitCode: 1, delay: 10 });
      await assert.rejects(
        () => openKimi(['-S', 'session_bad'], '/e/foo', spawn),
        /退出码/
      );
    });
  }
});
