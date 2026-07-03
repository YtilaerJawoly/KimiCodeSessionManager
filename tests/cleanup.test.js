import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { deleteSession, archiveSession } from '../src/cleanup.js';

describe('cleanup', () => {
  let base;
  beforeEach(() => {
    base = mkdtempSync(join(tmpdir(), 'ksm-'));
    const sdir = join(base, 'sessions', 'wd_a_abc', 'session_s1');
    mkdirSync(sdir, { recursive: true });
    writeFileSync(join(sdir, 'state.json'), '{}');
    writeFileSync(join(base, 'session_index.jsonl'), JSON.stringify({ sessionId: 'session_s1', sessionDir: sdir, workDir: '/e/a' }) + '\n');
  });
  afterEach(() => rmSync(base, { recursive: true, force: true }));

  it('deletes session and removes index entry', async () => {
    const session = { id: 'session_s1', dir: join(base, 'sessions', 'wd_a_abc', 'session_s1'), projectName: 'a' };
    await deleteSession(session, { KIMI_HOME: base });
    assert.equal(existsSync(session.dir), false);
    const index = readFileSync(join(base, 'session_index.jsonl'), 'utf8');
    assert.equal(index.trim(), '');
  });

  it('archives session and removes index entry', async () => {
    const session = { id: 'session_s1', dir: join(base, 'sessions', 'wd_a_abc', 'session_s1'), projectName: 'a' };
    await archiveSession(session, { KIMI_HOME: base });
    assert.equal(existsSync(session.dir), false);
    assert.equal(existsSync(join(base, 'session-manager-archive', 'a_session_s1')), true);
    const index = readFileSync(join(base, 'session_index.jsonl'), 'utf8');
    assert.equal(index.trim(), '');
  });
});
