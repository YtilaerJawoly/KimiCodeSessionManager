import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { buildProjects, buildWorktreeGroups, getLatestSession, findSessionById, findProjectByPath } from '../src/store.js';

const sessions = [
  { id: 'session_s2', projectPath: '/e/a', projectName: 'a', updatedAt: '2026-07-02T00:00:00.000Z' },
  { id: 'session_s1', projectPath: '/e/a', projectName: 'a', updatedAt: '2026-07-01T00:00:00.000Z' },
  { id: 'session_s3', projectPath: '/e/b', projectName: 'b', updatedAt: '2026-07-01T00:00:00.000Z' },
];

describe('buildProjects', () => {
  it('groups and sorts sessions by project', () => {
    const projects = buildProjects(sessions);
    assert.equal(projects.length, 2);
    assert.equal(projects[0].name, 'a');
    assert.equal(projects[0].sessions.length, 2);
    assert.equal(projects[0].sessions[0].id, 'session_s2');
    assert.equal(projects[0].sessionCount, 2);
    assert.ok(projects[0].lastUpdated);
  });

  it('sorts projects by lastUpdated descending', () => {
    const projects = buildProjects(sessions);
    assert.equal(projects[0].name, 'a');
    assert.equal(projects[1].name, 'b');
  });

  it('returns empty array for empty sessions', () => {
    const projects = buildProjects([]);
    assert.equal(projects.length, 0);
  });

  it('handles a single project with a single session', () => {
    const projects = buildProjects([
      { id: 'session_only', projectPath: '/e/only', projectName: 'only', updatedAt: '2026-07-01T00:00:00.000Z' },
    ]);
    assert.equal(projects.length, 1);
    assert.equal(projects[0].name, 'only');
    assert.equal(projects[0].sessions.length, 1);
    assert.equal(projects[0].sessions[0].id, 'session_only');
    assert.equal(projects[0].sessionCount, 1);
    assert.equal(projects[0].lastUpdated, '2026-07-01T00:00:00.000Z');
  });

  it('uses id as stable tie-breaker when updatedAt is equal', () => {
    const projects = buildProjects([
      { id: 'session_b', projectPath: '/e/a', projectName: 'a', updatedAt: '2026-07-01T00:00:00.000Z' },
      { id: 'session_a', projectPath: '/e/a', projectName: 'a', updatedAt: '2026-07-01T00:00:00.000Z' },
    ]);
    assert.equal(projects[0].sessions[0].id, 'session_a');
    assert.equal(projects[0].sessions[1].id, 'session_b');
  });

  it('sorts invalid updatedAt before valid updatedAt', () => {
    const projects = buildProjects([
      { id: 'session_bad', projectPath: '/e/a', projectName: 'a', updatedAt: 'not-a-date' },
      { id: 'session_good', projectPath: '/e/a', projectName: 'a', updatedAt: '2026-07-01T00:00:00.000Z' },
    ]);
    assert.equal(projects[0].sessions[0].id, 'session_good');
    assert.equal(projects[0].sessions[1].id, 'session_bad');
  });

  it('does not throw when updatedAt is missing', () => {
    const projects = buildProjects([
      { id: 'session_missing', projectPath: '/e/a', projectName: 'a' },
    ]);
    assert.equal(projects.length, 1);
    assert.equal(projects[0].sessions.length, 1);
    assert.equal(projects[0].sessions[0].id, 'session_missing');
  });
});

describe('getLatestSession', () => {
  it('returns most recent session for project', () => {
    const projects = buildProjects(sessions);
    assert.equal(getLatestSession(projects[0]).id, 'session_s2');
  });
});

describe('findSessionById', () => {
  it('finds session across projects', () => {
    const projects = buildProjects(sessions);
    assert.equal(findSessionById(projects, 'session_s3').id, 'session_s3');
  });

  it('returns null for unknown id', () => {
    const projects = buildProjects(sessions);
    assert.equal(findSessionById(projects, 'unknown'), null);
  });
});

describe('findProjectByPath', () => {
  it('finds project by path', () => {
    const projects = buildProjects(sessions);
    assert.equal(findProjectByPath(projects, '/e/a').name, 'a');
  });

  it('returns null for unknown path', () => {
    const projects = buildProjects(sessions);
    assert.equal(findProjectByPath(projects, '/e/c'), null);
  });
});

describe('buildWorktreeGroups', () => {
  let base;

  beforeEach(() => {
    base = mkdtempSync(join(tmpdir(), 'ksm-wt-'));
  });

  afterEach(() => rmSync(base, { recursive: true, force: true }));

  it('groups main and linked worktrees by real git metadata', () => {
    const mainPath = join(base, 'repo');
    const wtPath = join(base, 'repo-feature');
    mkdirSync(join(mainPath, '.git'), { recursive: true });
    mkdirSync(wtPath, { recursive: true });
    writeFileSync(join(wtPath, '.git'), `gitdir: ${join(mainPath, '.git', 'worktrees', 'feature')}\n`);

    const sessions = [
      { id: 's1', projectPath: mainPath, projectName: 'repo', updatedAt: '2026-07-10T00:00:00.000Z' },
      { id: 's2', projectPath: wtPath, projectName: 'repo-feature', updatedAt: '2026-07-09T00:00:00.000Z' },
    ];
    const groups = buildWorktreeGroups(buildProjects(sessions));

    assert.equal(groups.length, 1);
    assert.equal(groups[0].name, 'repo');
    assert.equal(groups[0].sessionCount, 2);
    assert.equal(groups[0].worktrees.length, 2);
    assert.equal(groups[0].worktrees[0].isMain, true);
    assert.equal(groups[0].worktrees[1].isMain, false);
  });

  it('keeps non-git projects as standalone groups', () => {
    const otherPath = join(base, 'other');
    mkdirSync(otherPath, { recursive: true });

    const sessions = [
      { id: 's1', projectPath: otherPath, projectName: 'other', updatedAt: '2026-07-10T00:00:00.000Z' },
    ];
    const groups = buildWorktreeGroups(buildProjects(sessions));

    assert.equal(groups.length, 1);
    assert.equal(groups[0].name, 'other');
    assert.equal(groups[0].worktrees.length, 1);
    assert.equal(groups[0].worktrees[0].isMain, true);
  });

  it('sorts groups by lastUpdated descending', () => {
    const p1 = join(base, 'p1');
    const p2 = join(base, 'p2');
    mkdirSync(p1, { recursive: true });
    mkdirSync(p2, { recursive: true });

    const sessions = [
      { id: 'older', projectPath: p1, projectName: 'p1', updatedAt: '2026-07-08T00:00:00.000Z' },
      { id: 'newer', projectPath: p2, projectName: 'p2', updatedAt: '2026-07-10T00:00:00.000Z' },
    ];
    const groups = buildWorktreeGroups(buildProjects(sessions));

    assert.equal(groups[0].name, 'p2');
    assert.equal(groups[1].name, 'p1');
  });
});
