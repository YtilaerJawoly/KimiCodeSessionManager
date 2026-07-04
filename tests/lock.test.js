import { spawn } from 'node:child_process';
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { acquireInstanceLock, releaseInstanceLock } from '../src/config.js';

describe('instance lock', () => {
  let base;
  let cleanupListeners = [];

  beforeEach(() => {
    base = mkdtempSync(join(tmpdir(), 'ksm-'));
  });

  afterEach(() => {
    rmSync(base, { recursive: true, force: true });
    cleanupListeners.forEach((fn) => {
      try { process.removeListener('exit', fn); } catch {}
      try { process.removeListener('SIGINT', fn); } catch {}
      try { process.removeListener('SIGTERM', fn); } catch {}
    });
    cleanupListeners = [];
  });

  it('acquires lock when none exists', () => {
    const result = acquireInstanceLock({ KIMI_HOME: base });
    assert.equal(result.acquired, true);
    assert.equal(existsSync(join(base, 'ksm.lock')), true);
    cleanupListeners = process.listeners('exit').slice(-3);
  });

  it('writes current pid into lock file', () => {
    acquireInstanceLock({ KIMI_HOME: base });
    const pid = Number(readFileSync(join(base, 'ksm.lock'), 'utf8').trim());
    assert.equal(pid, process.pid);
  });

  it('rejects lock when another live process holds it', async () => {
    const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000);']);
    await new Promise((resolve) => child.once('spawn', resolve));

    try {
      writeFileSync(join(base, 'ksm.lock'), String(child.pid), 'utf8');

      const result = acquireInstanceLock({ KIMI_HOME: base });
      assert.equal(result.acquired, false);
      assert.equal(result.pid, child.pid);
    } finally {
      child.kill();
    }
  });

  it('acquires lock when existing lock is stale', () => {
    const deadPid = 2147483646;
    writeFileSync(join(base, 'ksm.lock'), String(deadPid), 'utf8');

    const result = acquireInstanceLock({ KIMI_HOME: base });
    assert.equal(result.acquired, true);
    assert.equal(existsSync(join(base, 'ksm.lock')), true);
    cleanupListeners = process.listeners('exit').slice(-3);
  });

  it('releaseInstanceLock removes lock file', () => {
    writeFileSync(join(base, 'ksm.lock'), String(process.pid), 'utf8');
    releaseInstanceLock({ KIMI_HOME: base });
    assert.equal(existsSync(join(base, 'ksm.lock')), false);
  });
});
