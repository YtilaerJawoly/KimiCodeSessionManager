import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { EventEmitter } from 'node:events';
import { readKimiLatestVersion, getKimiInstalledVersion } from '../src/kimi-version.js';

describe('kimi-version', () => {
  describe('readKimiLatestVersion', () => {
    let home;

    beforeEach(() => {
      home = mkdtempSync(join(tmpdir(), 'ksm-kv-'));
      mkdirSync(join(home, 'updates'), { recursive: true });
    });

    afterEach(() => rmSync(home, { recursive: true, force: true }));

    it('reads the latest field', () => {
      writeFileSync(join(home, 'updates', 'latest.json'), JSON.stringify({ latest: '1.2.3' }));
      assert.equal(readKimiLatestVersion(home), '1.2.3');
    });

    it('falls back to the version field', () => {
      writeFileSync(join(home, 'updates', 'latest.json'), JSON.stringify({ version: '2.0.0' }));
      assert.equal(readKimiLatestVersion(home), '2.0.0');
    });

    it('falls back to manifest.version', () => {
      writeFileSync(join(home, 'updates', 'latest.json'), JSON.stringify({ manifest: { version: '3.1.4' } }));
      assert.equal(readKimiLatestVersion(home), '3.1.4');
    });

    it('prefers latest over version and manifest', () => {
      writeFileSync(join(home, 'updates', 'latest.json'), JSON.stringify({
        latest: '1.0.0',
        version: '2.0.0',
        manifest: { version: '3.0.0' },
      }));
      assert.equal(readKimiLatestVersion(home), '1.0.0');
    });

    it('returns empty string when the file is missing', () => {
      assert.equal(readKimiLatestVersion(home), '');
    });

    it('returns empty string for invalid JSON', () => {
      writeFileSync(join(home, 'updates', 'latest.json'), 'not-json');
      assert.equal(readKimiLatestVersion(home), '');
    });

    it('returns empty string when no version field exists', () => {
      writeFileSync(join(home, 'updates', 'latest.json'), JSON.stringify({ other: 'value' }));
      assert.equal(readKimiLatestVersion(home), '');
    });
  });

  describe('getKimiInstalledVersion', () => {
    let home;

    beforeEach(() => {
      home = mkdtempSync(join(tmpdir(), 'ksm-kv-'));
      mkdirSync(join(home, 'bin'), { recursive: true });
    });

    afterEach(() => rmSync(home, { recursive: true, force: true }));

    it('returns empty string when kimi.exe does not exist', async () => {
      const result = await getKimiInstalledVersion(home);
      assert.equal(result, '');
    });

    it('parses version prefixed with "kimi v"', async () => {
      writeFileSync(join(home, 'bin', 'kimi.exe'), '');
      const spawner = makeMockSpawn({ code: 0, stdout: 'kimi v1.2.3\n' });
      const result = await getKimiInstalledVersion(home, spawner);
      assert.equal(result, '1.2.3');
    });

    it('parses version prefixed with "v"', async () => {
      writeFileSync(join(home, 'bin', 'kimi.exe'), '');
      const spawner = makeMockSpawn({ code: 0, stdout: 'v2.0.0' });
      const result = await getKimiInstalledVersion(home, spawner);
      assert.equal(result, '2.0.0');
    });

    it('parses bare version', async () => {
      writeFileSync(join(home, 'bin', 'kimi.exe'), '');
      const spawner = makeMockSpawn({ code: 0, stdout: '3.1.4' });
      const result = await getKimiInstalledVersion(home, spawner);
      assert.equal(result, '3.1.4');
    });

    it('returns full output when no version pattern matches', async () => {
      writeFileSync(join(home, 'bin', 'kimi.exe'), '');
      const spawner = makeMockSpawn({ code: 0, stdout: 'unknown output' });
      const result = await getKimiInstalledVersion(home, spawner);
      assert.equal(result, 'unknown output');
    });

    it('falls back to stderr when stdout is empty', async () => {
      writeFileSync(join(home, 'bin', 'kimi.exe'), '');
      const spawner = makeMockSpawn({ code: 0, stderr: 'kimi v4.5.6' });
      const result = await getKimiInstalledVersion(home, spawner);
      assert.equal(result, '4.5.6');
    });

    it('returns empty string when the command fails', async () => {
      writeFileSync(join(home, 'bin', 'kimi.exe'), '');
      const spawner = makeMockSpawn({ code: 1, stderr: 'error' });
      const result = await getKimiInstalledVersion(home, spawner);
      assert.equal(result, '');
    });

    it('returns empty string when both stdout and stderr are empty', async () => {
      writeFileSync(join(home, 'bin', 'kimi.exe'), '');
      const spawner = makeMockSpawn({ code: 0, stdout: '' });
      const result = await getKimiInstalledVersion(home, spawner);
      assert.equal(result, '');
    });
  });
});

function makeMockSpawn({ code = 0, stdout = '', stderr = '' } = {}) {
  return (cmd, args, options) => {
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    process.nextTick(() => {
      if (stdout) child.stdout.emit('data', stdout);
      if (stderr) child.stderr.emit('data', stderr);
      child.emit('close', code);
    });
    return child;
  };
}
