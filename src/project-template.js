/**
 * 项目模板创建模块
 *
 * 职责：
 *   1. 根据项目名称在指定 workspace 下创建目录和最小项目骨架。
 *
 * 设计原则：
 *   - 校验与创建逻辑分离，便于单元测试。
 *   - IO 依赖可注入，测试时避免真实文件系统副作用。
 */

import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/** 路径危险字符集合 */
const INVALID_CHARS = /[\\/:*?"<>|]/;

/**
 * 校验项目名称。
 *
 * @param {string} name
 * @returns {{ valid: boolean, reason?: string }}
 */
export function validateProjectName(name) {
  if (typeof name !== 'string' || name.trim() === '') {
    return { valid: false, reason: 'empty' };
  }
  const trimmed = name.trim();
  const match = trimmed.match(INVALID_CHARS);
  if (match) {
    return { valid: false, reason: 'invalidChars', chars: match[0] };
  }
  if (trimmed === '.' || trimmed === '..') {
    return { valid: false, reason: 'reserved' };
  }
  return { valid: true };
}

/** 骨架文件清单 */
export const SKELETON_FILES = [
  'README.md',
  'package.json',
  'src/index.js',
  '.gitignore',
];

/**
 * 返回项目创建前的预览信息，用于确认提示。
 *
 * @param {string} projectName
 * @param {string} workspaceRoot
 * @returns {{ projectPath: string, files: string[] }}
 */
export function previewProject(projectName, workspaceRoot) {
  const validation = validateProjectName(projectName);
  if (!validation.valid) {
    const error = new Error(validation.reason);
    error.code = validation.reason;
    error.details = validation;
    throw error;
  }
  return {
    projectPath: join(workspaceRoot, projectName.trim()),
    files: [...SKELETON_FILES],
  };
}

/**
 * 在 workspace 下创建新项目目录及骨架文件。
 *
 * @param {string} projectName 项目名称
 * @param {string} workspaceRoot workspace 根目录
 * @returns {{ projectPath: string, projectName: string }}
 */
export function createProject(projectName, workspaceRoot) {
  const validation = validateProjectName(projectName);
  if (!validation.valid) {
    const error = new Error(validation.reason);
    error.code = validation.reason;
    error.details = validation;
    throw error;
  }

  const targetName = projectName.trim();
  const projectPath = join(workspaceRoot, targetName);

  if (existsSync(projectPath)) {
    const error = new Error('exists');
    error.code = 'exists';
    throw error;
  }

  mkdirSync(join(projectPath, 'src'), { recursive: true });

  writeFileSync(join(projectPath, 'README.md'), `# ${targetName}\n\nProject created by Kimi Code Session Manager.\n`);
  writeFileSync(join(projectPath, 'package.json'), JSON.stringify({
    name: targetName,
    version: '1.0.0',
    type: 'module',
    main: 'src/index.js',
  }, null, 2) + '\n');
  writeFileSync(join(projectPath, 'src', 'index.js'), `console.log('Hello from ${targetName}!');\n`);
  writeFileSync(join(projectPath, '.gitignore'), 'node_modules/\n*.log\n');

  return { projectPath, projectName: targetName };
}
