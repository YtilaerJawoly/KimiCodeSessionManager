import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildProjects, getLatestSession, findSessionById, findProjectByPath } from '../src/store.js';

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
