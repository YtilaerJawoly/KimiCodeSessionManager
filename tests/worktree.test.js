import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { normalize } from 'node:path';
import {
  parseGitDir,
  resolveMainGitDir,
  detectWorktree,
  groupProjectsByWorktree,
} from '../src/worktree.js';

describe('worktree', () => {
  describe('parseGitDir', () => {
    it('parses gitdir from a linked worktree .git file', () => {
      const content = 'gitdir: /home/user/repo/.git/worktrees/feature\n';
      assert.equal(parseGitDir(content), '/home/user/repo/.git/worktrees/feature');
    });

    it('returns null when gitdir line is missing', () => {
      assert.equal(parseGitDir('some other content'), null);
    });

    it('handles Windows-style gitdir paths', () => {
      const content = 'gitdir: C:/Users/user/repo/.git/worktrees/feature\r\n';
      assert.equal(parseGitDir(content), 'C:/Users/user/repo/.git/worktrees/feature');
    });
  });

  describe('resolveMainGitDir', () => {
    it('returns the directory itself for a main worktree', () => {
      assert.equal(resolveMainGitDir('/home/user/repo/.git'), normalize('/home/user/repo/.git'));
    });

    it('strips worktree suffix for a linked worktree', () => {
      assert.equal(resolveMainGitDir('/home/user/repo/.git/worktrees/feature'), normalize('/home/user/repo/.git'));
    });

    it('handles Windows-style paths', () => {
      assert.equal(resolveMainGitDir('C:\\Users\\user\\repo\\.git\\worktrees\\feature'), normalize('C:\\Users\\user\\repo\\.git'));
    });

    it('normalizes mixed separators', () => {
      assert.equal(resolveMainGitDir('C:/Users/user/repo/.git/worktrees/feature'), normalize('C:\\Users\\user\\repo\\.git'));
    });
  });

  describe('detectWorktree', () => {
    it('detects main worktree from .git directory', () => {
      const readGitMeta = () => ({ type: 'directory', path: normalize('E:/repo/.git') });
      const info = detectWorktree('E:/repo', readGitMeta);
      assert.equal(info.isMain, true);
      assert.equal(info.mainGitDir, normalize('E:/repo/.git'));
      assert.equal(info.name, 'repo');
    });

    it('detects linked worktree from .git file', () => {
      const readGitMeta = () => ({ type: 'file', content: 'gitdir: /home/user/repo/.git/worktrees/feature\n' });
      const info = detectWorktree('/home/user/repo-feature', readGitMeta);
      assert.equal(info.isMain, false);
      assert.equal(info.mainGitDir, normalize('/home/user/repo/.git'));
      assert.equal(info.name, 'repo-feature');
    });

    it('detects main worktree from .git file pointing to main gitdir', () => {
      const readGitMeta = () => ({ type: 'file', content: 'gitdir: /home/user/repo/.git\n' });
      const info = detectWorktree('/home/user/repo', readGitMeta);
      assert.equal(info.isMain, true);
      assert.equal(info.mainGitDir, normalize('/home/user/repo/.git'));
    });

    it('returns null for non-git project', () => {
      const readGitMeta = () => null;
      assert.equal(detectWorktree('/home/user/random', readGitMeta), null);
    });

    it('returns null when .git file has no gitdir line', () => {
      const readGitMeta = () => ({ type: 'file', content: 'invalid' });
      assert.equal(detectWorktree('/home/user/bad', readGitMeta), null);
    });
  });

  describe('groupProjectsByWorktree', () => {
    it('groups main and linked worktrees together', () => {
      const projects = [
        makeProject('/home/user/repo', 'repo', '2026-07-10T00:00:00.000Z', 3),
        makeProject('/home/user/repo-feature', 'repo-feature', '2026-07-09T00:00:00.000Z', 2),
      ];
      const detectFn = (path) => {
        if (path === '/home/user/repo') {
          return { projectPath: path, mainGitDir: '/home/user/repo/.git', isMain: true, name: 'repo' };
        }
        return { projectPath: path, mainGitDir: '/home/user/repo/.git', isMain: false, name: 'repo-feature' };
      };

      const groups = groupProjectsByWorktree(projects, detectFn);
      assert.equal(groups.length, 1);
      assert.equal(groups[0].name, 'repo');
      assert.equal(groups[0].sessionCount, 5);
      assert.equal(groups[0].worktrees.length, 2);
      assert.equal(groups[0].worktrees[0].name, 'repo');
      assert.equal(groups[0].worktrees[1].name, 'repo-feature');
    });

    it('keeps non-git projects as standalone groups', () => {
      const projects = [makeProject('/home/user/other', 'other', '2026-07-10T00:00:00.000Z', 1)];
      const detectFn = () => null;
      const groups = groupProjectsByWorktree(projects, detectFn);
      assert.equal(groups.length, 1);
      assert.equal(groups[0].name, 'other');
      assert.equal(groups[0].worktrees.length, 1);
      assert.equal(groups[0].worktrees[0].isMain, true);
    });

    it('sorts worktrees by lastUpdated descending', () => {
      const projects = [
        makeProject('/home/user/repo-main', 'repo-main', '2026-07-08T00:00:00.000Z', 1),
        makeProject('/home/user/repo-dev', 'repo-dev', '2026-07-10T00:00:00.000Z', 1),
      ];
      const detectFn = (path) => ({
        projectPath: path,
        mainGitDir: '/home/user/repo/.git',
        isMain: path.includes('main'),
        name: basename(path),
      });
      const groups = groupProjectsByWorktree(projects, detectFn);
      assert.equal(groups[0].worktrees[0].name, 'repo-dev');
      assert.equal(groups[0].worktrees[1].name, 'repo-main');
    });

    it('uses first worktree as fallback when no main worktree exists', () => {
      const projects = [
        makeProject('/home/user/repo-wt1', 'repo-wt1', '2026-07-10T00:00:00.000Z', 1),
      ];
      const detectFn = () => ({ mainGitDir: '/home/user/repo/.git', isMain: false, name: 'repo-wt1' });
      const groups = groupProjectsByWorktree(projects, detectFn);
      assert.equal(groups[0].name, 'repo-wt1');
    });
  });
});

function makeProject(path, name, lastUpdated, sessionCount) {
  return {
    path,
    name,
    lastUpdated,
    sessionCount,
    sessions: [],
  };
}

function basename(p) {
  const parts = p.split('/');
  return parts[parts.length - 1];
}
