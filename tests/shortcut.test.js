import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir, platform, homedir } from 'node:os';
import { EventEmitter } from 'node:events';
import { createDesktopShortcut } from '../src/shortcut.js';

const isWin = platform() === 'win32';

describe('shortcut', () => {
  it('returns a friendly message on non-Windows platforms', async () => {
    if (isWin) return;
    const result = await createDesktopShortcut('start.exe');
    assert.equal(result.success, false);
    assert.equal(result.message, '当前只支持 Windows 桌面快捷方式');
  });

  describe('on Windows', () => {
    let tempDir;
    let startExePath;

    beforeEach(() => {
      if (!isWin) return;
      tempDir = mkdtempSync(join(tmpdir(), 'ksm-sc-'));
      startExePath = join(tempDir, 'start.exe');
      writeFileSync(startExePath, '');
    });

    afterEach(() => {
      if (tempDir) rmSync(tempDir, { recursive: true, force: true });
    });

    it('returns an error when the target file does not exist', async () => {
      if (!isWin) return;
      const result = await createDesktopShortcut(join(tempDir, 'missing.exe'));
      assert.equal(result.success, false);
      assert.ok(result.message.includes('找不到 start.exe'));
    });

    it('returns the shortcut path on success', async () => {
      if (!isWin) return;
      const spawner = makeMockSpawn({ code: 0, stdout: 'OK' });
      const result = await createDesktopShortcut(startExePath, spawner);
      assert.equal(result.success, true);
      assert.equal(result.message, join(homedir(), 'Desktop', 'Kimi Code Session Manager.lnk'));
    });

    it('returns an error when PowerShell fails', async () => {
      if (!isWin) return;
      const spawner = makeMockSpawn({ code: 1, stderr: 'permission denied' });
      const result = await createDesktopShortcut(startExePath, spawner);
      assert.equal(result.success, false);
      assert.ok(result.message.includes('permission denied'));
    });

    it('escapes single quotes in paths', async () => {
      if (!isWin) return;
      const quotedDir = mkdtempSync(join(tmpdir(), "ksm-sc'-"));
      const quotedExe = join(quotedDir, "start'.exe");
      writeFileSync(quotedExe, '');

      let capturedCommand;
      const spawner = (cmd, args, options) => {
        capturedCommand = args[args.length - 1];
        return makeMockSpawn({ code: 0, stdout: 'OK' })();
      };

      const result = await createDesktopShortcut(quotedExe, spawner);
      assert.equal(result.success, true);
      assert.ok(capturedCommand.includes("start''.exe"));
      assert.ok(capturedCommand.includes("ksm-sc''-"));

      rmSync(quotedDir, { recursive: true, force: true });
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
