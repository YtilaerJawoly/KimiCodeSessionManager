import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadSessions } from '../src/loader.js';

describe('loadSessions', () => {
  let base;
  beforeEach(() => {
    base = mkdtempSync(join(tmpdir(), 'ksm-'));
    mkdirSync(join(base, 'sessions', 'wd_works_abc123', 'session_s1'), { recursive: true });
    writeFileSync(join(base, 'session_index.jsonl'), JSON.stringify({
      sessionId: 'session_s1',
      sessionDir: join(base, 'sessions', 'wd_works_abc123', 'session_s1'),
      workDir: '/e/kimi-code/works'
    }) + '\n');
    writeFileSync(join(base, 'sessions', 'wd_works_abc123', 'session_s1', 'state.json'), JSON.stringify({
      title: 'test session',
      createdAt: '2026-07-01T00:00:00.000Z',
      updatedAt: '2026-07-02T00:00:00.000Z',
      lastPrompt: 'hello'
    }));
  });

  afterEach(() => rmSync(base, { recursive: true, force: true }));

  it('returns sessions grouped by project', async () => {
    const sessions = await loadSessions({ KIMI_HOME: base });
    assert.equal(sessions.length, 1);
    assert.equal(sessions[0].id, 'session_s1');
    assert.equal(sessions[0].projectName, 'works');
    assert.equal(sessions[0].title, 'test session');
  });

  it('sorts sessions by updatedAt descending', async () => {
    mkdirSync(join(base, 'sessions', 'wd_works_abc123', 'session_s2'), { recursive: true });
    writeFileSync(join(base, 'sessions', 'wd_works_abc123', 'session_s2', 'state.json'), JSON.stringify({
      title: 'older session',
      createdAt: '2026-07-01T00:00:00.000Z',
      updatedAt: '2026-06-01T00:00:00.000Z',
      lastPrompt: 'old'
    }));
    const sessions = await loadSessions({ KIMI_HOME: base });
    assert.equal(sessions[0].id, 'session_s1');
    assert.equal(sessions[1].id, 'session_s2');
  });

  it('returns empty array when index is empty and no sessions dir exists', async () => {
    writeFileSync(join(base, 'session_index.jsonl'), '');
    rmSync(join(base, 'sessions'), { recursive: true, force: true });
    const sessions = await loadSessions({ KIMI_HOME: base });
    assert.equal(sessions.length, 0);
  });

  it('skips sessions with corrupted state.json', async () => {
    mkdirSync(join(base, 'sessions', 'wd_works_abc123', 'session_bad'), { recursive: true });
    writeFileSync(join(base, 'sessions', 'wd_works_abc123', 'session_bad', 'state.json'), 'not-json');
    const sessions = await loadSessions({ KIMI_HOME: base });
    assert.equal(sessions.length, 1);
    assert.equal(sessions[0].id, 'session_s1');
  });

  it('sorts valid updatedAt before invalid updatedAt', async () => {
    mkdirSync(join(base, 'sessions', 'wd_works_abc123', 'session_invalid'), { recursive: true });
    writeFileSync(join(base, 'sessions', 'wd_works_abc123', 'session_invalid', 'state.json'), JSON.stringify({
      title: 'invalid date',
      createdAt: '2026-07-01T00:00:00.000Z',
      updatedAt: 'not-a-date',
      lastPrompt: 'bad'
    }));
    const sessions = await loadSessions({ KIMI_HOME: base });
    assert.equal(sessions[0].id, 'session_s1');
    assert.equal(sessions[1].id, 'session_invalid');
  });
});
