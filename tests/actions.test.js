import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { continueSession, createSession, openKimi } from '../src/actions.js';

function makeMockSpawn({ error = null } = {}) {
  return (cmd, args, options) => {
    const child = new EventEmitter();
    child.unref = () => {};
    process.nextTick(() => {
      child.emit('spawn');
      if (error) {
        child.emit('error', error);
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
    await continueSession({ id: 'session_abc', projectPath: '/e/foo' }, spawn);
    assert.equal(captured.cmd, 'kimi');
    assert.equal(captured.args.includes('-S'), true);
    assert.equal(captured.args.includes('session_abc'), true);
    assert.equal(captured.options.cwd, '/e/foo');
    assert.equal(captured.options.detached, true);
  });

  it('createSession passes correct args and cwd', async () => {
    let captured;
    const spawn = (cmd, args, options) => {
      captured = { cmd, args, options };
      return makeMockSpawn()();
    };
    await createSession('/e/bar', spawn);
    assert.equal(captured.cmd, 'kimi');
    assert.deepEqual(captured.args, []);
    assert.equal(captured.options.cwd, '/e/bar');
    assert.equal(captured.options.detached, true);
  });

  it('resolves immediately on spawn', async () => {
    const spawn = makeMockSpawn();
    const child = await openKimi(['-S', 'session_abc'], '/e/foo', spawn);
    assert.ok(child);
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
});
