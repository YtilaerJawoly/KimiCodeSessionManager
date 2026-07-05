import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { platform } from 'node:os';
import { resolve, dirname } from 'node:path';
import { readFile, unlink } from 'node:fs/promises';
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
  it('continueSession passes session id in generated launcher script', async () => {
    if (!isWin) return;
    let captured;
    const spawn = (cmd, args, options) => {
      captured = { cmd, args, options };
      return makeMockSpawn()();
    };
    await continueSession({ id: 'session_abc', projectPath: 'E:/foo' }, spawn, {});
    const fileArgIndex = captured.cmd === 'wt.exe' ? 14 : captured.cmd === 'cmd.exe' ? 8 : -1;
    assert.ok(fileArgIndex > 0, `unexpected launcher command: ${captured.cmd}`);
    const scriptPath = captured.args[fileArgIndex];
    const script = await readFile(scriptPath, 'utf8');
    assert.ok(script.includes("$Host.UI.RawUI.WindowTitle = 'foo'"));
    assert.ok(script.includes("'session_abc'"));
    assert.ok(script.includes("catch {"));
    await unlink(scriptPath).catch(() => {});
  });

  it('createSession passes project title in generated launcher script', async () => {
    if (!isWin) return;
    let captured;
    const spawn = (cmd, args, options) => {
      captured = { cmd, args, options };
      return makeMockSpawn()();
    };
    await createSession('E:/bar', 'bar', spawn, {});
    const fileArgIndex = captured.cmd === 'wt.exe' ? 14 : captured.cmd === 'cmd.exe' ? 8 : -1;
    assert.ok(fileArgIndex > 0, `unexpected launcher command: ${captured.cmd}`);
    const scriptPath = captured.args[fileArgIndex];
    const script = await readFile(scriptPath, 'utf8');
    assert.ok(script.includes("$Host.UI.RawUI.WindowTitle = 'bar'"));
    assert.ok(script.includes("catch {"));
    await unlink(scriptPath).catch(() => {});
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
    assert.deepEqual(captured.args.slice(0, 10), ['-w', '0', 'nt', '-p', 'PowerShell', '-d', resolve('E:/foo'), '--title', 'foo', 'powershell']);
    assert.equal(captured.args[10], '-NoProfile');
    assert.equal(captured.args[11], '-ExecutionPolicy');
    assert.equal(captured.args[12], 'Bypass');
    assert.equal(captured.args[13], '-File');
    assert.equal(typeof captured.args[14], 'string');
    const scriptPath = captured.args[14];
    const script = await readFile(scriptPath, 'utf8');
    assert.ok(script.includes("$Host.UI.RawUI.WindowTitle = 'foo'"));
    assert.ok(script.includes("& 'kimi' '-S' 'session_abc'") || script.includes("try {"));
    assert.ok(script.includes("catch {"));
    assert.equal(captured.options.detached, true);
    await unlink(scriptPath).catch(() => {});
  });

  it('rejects on spawn error', async () => {
    const spawn = makeMockSpawn({ error: new Error('spawn failed') });
    await assert.rejects(
      () => openKimi(['-S', 'session_bad'], 'E:/foo', 'foo', spawn, {}),
      /无法启动 Kimi Code/
    );
  });
});
