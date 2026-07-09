/**
 * Git worktree 检测与分组模块
 *
 * 职责：
 *   1. 通过读取项目路径下的 .git 文件/目录元数据，识别 main worktree 与 linked worktree。
 *   2. 将属于同一个 git 仓库的 Project 合并为 ProjectGroup，便于 TUI 分层展示。
 *
 * 设计原则：
 *   - 不调用 git 命令，仅做文件系统读取，避免子进程开销。
 *   - 检测失败或非 git 项目按独立组处理，不影响原有流程。
 *   - 读取函数可注入，便于单元测试。
 */

import { readFileSync, statSync } from 'node:fs';
import { join, normalize, basename } from 'node:path';

/**
 * 默认读取项目路径的 .git 元数据。
 *
 * @param {string} projectPath
 * @returns {{ type: 'directory', path: string } | { type: 'file', content: string } | null}
 */
function defaultReadGitMeta(projectPath) {
  const gitPath = join(projectPath, '.git');
  try {
    const stat = statSync(gitPath);
    if (stat.isDirectory()) {
      return { type: 'directory', path: normalize(gitPath) };
    }
    const content = readFileSync(gitPath, 'utf8');
    return { type: 'file', content };
  } catch {
    return null;
  }
}

/**
 * 从 .git 文件内容中解析 gitdir 行。
 *
 * @param {string} content
 * @returns {string | null}
 */
export function parseGitDir(content) {
  const m = content.match(/^gitdir:\s*(.+)$/m);
  return m ? m[1].trim() : null;
}

/**
 * 将 gitdir 路径归一化为 main repo 的 .git 目录绝对路径。
 *
 * @param {string} gitdir
 * @returns {string}
 */
export function resolveMainGitDir(gitdir) {
  const normalized = normalize(gitdir);
  const m = normalized.match(/^(.+\.git)(?:[\\/]worktrees[\\/][^\\/]+)?$/);
  return normalize(m ? m[1] : normalized);
}

/**
 * 检测单个项目路径的 worktree 信息。
 *
 * @param {string} projectPath
 * @param {Function} [readGitMeta=defaultReadGitMeta]
 * @returns {{ projectPath: string, mainGitDir: string, isMain: boolean, name: string } | null}
 */
export function detectWorktree(projectPath, readGitMeta = defaultReadGitMeta) {
  const meta = readGitMeta(projectPath);
  if (!meta) return null;

  if (meta.type === 'directory') {
    return {
      projectPath,
      mainGitDir: meta.path,
      isMain: true,
      name: basename(projectPath),
    };
  }

  const gitdir = parseGitDir(meta.content);
  if (!gitdir) return null;

  const mainGitDir = resolveMainGitDir(gitdir);
  const isMain = !/[\\/]worktrees[\\/][^\\/]+$/.test(normalize(gitdir));

  return {
    projectPath,
    mainGitDir,
    isMain,
    name: basename(projectPath),
  };
}

/**
 * 将 Project 数组按 git worktree 关系分组。
 *
 * @param {Array} projects buildProjects() 产出的 Project 数组
 * @param {Function} [detectFn=detectWorktree]
 * @returns {Array} ProjectGroup 数组
 */
export function groupProjectsByWorktree(projects, detectFn = detectWorktree) {
  /** @type {Map<string, { mainGitDir: string, worktrees: Array }>} */
  const map = new Map();
  const orphans = [];

  for (const project of projects) {
    const info = detectFn(project.path);
    if (!info) {
      orphans.push(project);
      continue;
    }

    if (!map.has(info.mainGitDir)) {
      map.set(info.mainGitDir, { mainGitDir: info.mainGitDir, worktrees: [] });
    }
    map.get(info.mainGitDir).worktrees.push({ ...info, project });
  }

  const groups = [];
  for (const { worktrees } of map.values()) {
    groups.push(buildGroup(worktrees));
  }
  for (const project of orphans) {
    groups.push(buildGroup([{ project, isMain: true, name: project.name }]));
  }

  return groups;
}

function buildGroup(worktrees) {
  const sortedWorktrees = worktrees
    .map(w => ({
      ...w,
      lastUpdated: w.project?.lastUpdated,
      sessionCount: w.project?.sessionCount ?? 0,
    }))
    .sort((a, b) => compareDate(a.lastUpdated, b.lastUpdated));

  const main = sortedWorktrees.find(w => w.isMain) || sortedWorktrees[0];

  return {
    name: main?.name || sortedWorktrees[0]?.name,
    path: main?.project?.path || sortedWorktrees[0]?.project?.path,
    mainGitDir: main?.mainGitDir,
    lastUpdated: sortedWorktrees[0]?.lastUpdated,
    sessionCount: sortedWorktrees.reduce((sum, w) => sum + (w.sessionCount || 0), 0),
    worktrees: sortedWorktrees,
  };
}

function compareDate(aIso, bIso) {
  const a = new Date(aIso).getTime();
  const b = new Date(bIso).getTime();
  if (Number.isFinite(a) && Number.isFinite(b)) return b - a;
  if (Number.isFinite(a)) return -1;
  if (Number.isFinite(b)) return 1;
  return 0;
}
