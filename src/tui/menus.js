import { search, select } from '@inquirer/prompts';
import Fuse from 'fuse.js';
import chalk from 'chalk';
import { join } from 'node:path';
import { loadSessions } from '../loader.js';
import { buildProjects, buildWorktreeGroups, getLatestSession, findProjectByPath } from '../store.js';
import { createProject, validateProjectName, previewProject } from '../project-template.js';
import { continueSession, createSession } from '../actions.js';
import { openFileExplorer } from '../process.js';
import { deleteSession, archiveSession } from '../cleanup.js';
import { updateKimiCode, updateKsm } from '../updater.js';
import { createDesktopShortcut } from '../shortcut.js';
import { t, getLocale, setLocale } from '../i18n.js';
import { saveKsmConfig } from '../config.js';
import { redrawWelcome } from './welcome.js';
import {
  padEnd,
  truncate,
  formatTime,
  NAME_WIDTH,
  PATH_WIDTH,
  FUSE_OPTIONS,
  QUIET_SELECT_THEME,
  QUIET_SEARCH_THEME,
  QUIET_CHECKBOX_THEME,
  promptWithCancel,
  ROOT_DIR,
  hint,
} from './helpers.js';

/**
 * 子菜单集合模块
 *
 * 职责：
 *   1. 更新、语言、快捷设置、最近会话、项目、历史、清理、历史消息、新建项目等菜单。
 *
 * 设计原则：
 *   - 每个菜单函数只处理一个独立页面，避免 index.js 膨胀。
 *   - 菜单间通过函数调用跳转，返回上级即函数返回。
 *   - 默认选中项统一放在“返回上一级”之后的第一项，提升键盘操作体验。
 */

/**
 * 快速开始菜单：列出最近 5 个会话，选择后直接继续。
 */
export async function quickStartMenu(env, messages = [], options = {}) {
  while (true) {
    await redrawWelcome(env, messages, options);

    const sessions = await loadSessions(env);
    const recent = sessions.slice(0, 5);

    if (recent.length === 0) {
      console.log(chalk.yellow(t('quickStartMenu.empty')));
      return;
    }

    const choices = [
      { name: t('quickStartMenu.back'), value: 'back' },
      ...recent.map(s => ({
        name: `${padEnd(truncate(s.projectName, 18), NAME_WIDTH)}${truncate(s.title, 40)}  ${chalk.gray(formatTime(s.updatedAt))}`,
        value: s,
        description: (s.lastPrompt || '').slice(0, 80),
      })),
    ];

    const session = await promptWithCancel(() => select({
      message: t('quickStartMenu.title'),
      theme: QUIET_SELECT_THEME,
      default: recent[0].id,
      instructions: hint('select'),
      choices,
    }));

    if (session === 'back') return;
    if (!session) continue;

    try {
      await continueSession(session);
      return;
    } catch (err) {
      console.error(chalk.red(t('projectMenu.launchFailed', { message: err.message })));
    }
  }
}

/**
 * 新建项目菜单。
 */
export async function createProjectMenu(env, messages = [], options = {}) {
  const { input } = await import('@inquirer/prompts');
  const workspaceRoot = join(ROOT_DIR, 'workspace');

  while (true) {
    await redrawWelcome(env, messages, options);

    const rawName = await promptWithCancel(() => input({
      message: t('createProjectMenu.title'),
      theme: QUIET_SELECT_THEME,
      default: '',
    }), 'back');

    if (rawName === 'back') return;

    const validation = validateProjectName(rawName);
    if (!validation.valid) {
      if (validation.reason === 'empty') {
        console.error(chalk.red(t('createProjectMenu.emptyName')));
      } else if (validation.reason === 'reserved') {
        console.error(chalk.red(t('createProjectMenu.reservedName')));
      } else {
        console.error(chalk.red(t('createProjectMenu.invalidName', { chars: validation.chars })));
      }
      continue;
    }

    let preview;
    try {
      preview = previewProject(rawName, workspaceRoot);
    } catch (err) {
      console.error(chalk.red(t('createProjectMenu.failed', { message: err.message })));
      continue;
    }

    await redrawWelcome(env, messages, options);
    console.log(chalk.cyan(t('createProjectMenu.preview', { path: preview.projectPath })));
    for (const file of preview.files) {
      console.log(`  ${chalk.gray(file)}`);
    }

    const confirm = await promptWithCancel(() => select({
      message: t('createProjectMenu.confirm'),
      theme: QUIET_SELECT_THEME,
      default: true,
      instructions: hint('select'),
      choices: [
        { name: t('createProjectMenu.confirmed'), value: true },
        { name: t('createProjectMenu.cancelled'), value: false },
      ],
    }), false);

    if (!confirm) continue;

    let result;
    try {
      result = createProject(rawName, workspaceRoot);
    } catch (err) {
      if (err.code === 'exists') {
        console.error(chalk.red(t('createProjectMenu.exists', { name: rawName.trim() })));
      } else {
        console.error(chalk.red(t('createProjectMenu.failed', { message: err.message })));
      }
      continue;
    }

    console.log(chalk.green(t('createProjectMenu.success', { path: result.projectPath })));

    const openResult = await openFileExplorer(result.projectPath);
    if (!openResult.success) {
      console.error(chalk.yellow(t('createProjectMenu.openExplorerFailed', { message: openResult.message })));
    }

    await createSession(result.projectPath, result.projectName);
    return;
  }
}

/**
 * 更新菜单。
 */
export async function updateMenu(env, messages = [], options = {}) {
  while (true) {
    await redrawWelcome(env, messages, options);

    const action = await promptWithCancel(() => select({
      message: t('updateMenu.title'),
      theme: QUIET_SELECT_THEME,
      default: 'ksm',
      instructions: hint('select'),
      choices: [
        { name: t('updateMenu.back'), value: 'back' },
        { name: t('updateMenu.ksm'), value: 'ksm' },
        { name: t('updateMenu.kimiCode'), value: 'kimiCode' },
      ],
    }));

    switch (action) {
      case 'ksm': {
        const result = await updateKsm(ROOT_DIR);
        if (result.success) {
          console.log(chalk.green(t('updateMenu.ksmSuccess', { message: result.message })));
        } else {
          console.error(chalk.red(t('updateMenu.ksmFailed', { message: result.message })));
          console.log(chalk.yellow(t('updateMenu.ksmManual')));
        }
        break;
      }
      case 'kimiCode': {
        console.log(chalk.yellow(t('updateMenu.kimiCodeInstalling')));
        const result = await updateKimiCode();
        if (result.success) {
          console.log(chalk.green(t('updateMenu.kimiCodeSuccess')));
          console.log(chalk.yellow(t('updateMenu.kimiCodeRestart')));
        } else {
          console.error(chalk.red(t('updateMenu.kimiCodeFailed', { message: result.message })));
          console.log(chalk.yellow(t('updateMenu.kimiCodeManual')));
        }
        break;
      }
      case 'back':
      default:
        return;
    }
  }
}

/**
 * 语言切换菜单。
 */
export async function languageMenu(env, messages = [], options = {}) {
  const current = getLocale();
  await redrawWelcome(env, messages, options);

  const action = await promptWithCancel(() => select({
    message: t('languageMenu.title'),
    theme: QUIET_SELECT_THEME,
    default: current,
    instructions: hint('select'),
    choices: [
      { name: t('languageMenu.back'), value: 'back' },
      { name: t('languageMenu.zhCN'), value: 'zh-CN' },
      { name: t('languageMenu.en'), value: 'en' },
    ],
  }));

  if (action && action !== 'back' && action !== current) {
    setLocale(action);
    saveKsmConfig({ locale: action }, env);
  }
}

/**
 * 快捷设置菜单。
 */
export async function shortcutSettingsMenu(env, messages = [], options = {}) {
  const { showQuota, setShowQuota, refreshQuota, quotaText } = options;
  while (true) {
    await redrawWelcome(env, messages, options);

    const quotaToggleLabel = showQuota
      ? t('settingsMenu.quotaToggle', { state: t('settingsMenu.quotaOn') })
      : t('settingsMenu.quotaToggle', { state: t('settingsMenu.quotaOff') });

    const action = await promptWithCancel(() => select({
      message: t('settingsMenu.title'),
      theme: QUIET_SELECT_THEME,
      default: 'desktop',
      instructions: hint('select'),
      choices: [
        { name: t('settingsMenu.back'), value: 'back' },
        { name: t('settingsMenu.desktop'), value: 'desktop' },
        { name: quotaToggleLabel, value: 'quota-toggle' },
        { name: t('settingsMenu.quotaSetToken'), value: 'quota-token' },
      ],
    }));

    switch (action) {
      case 'desktop': {
        const result = await createDesktopShortcut(join(ROOT_DIR, 'start.exe'));
        if (result.success) {
          console.log(chalk.green(t('settingsMenu.desktopSuccess', { message: result.message })));
        } else {
          console.error(chalk.red(t('settingsMenu.desktopFailed', { message: result.message })));
        }
        break;
      }
      case 'quota-toggle': {
        setShowQuota(!showQuota);
        break;
      }
      case 'quota-token': {
        const { input } = await import('@inquirer/prompts');
        const { loadKimiAccessToken, saveKimiAccessToken } = await import('../config.js');
        const token = await promptWithCancel(() => input({
          message: t('settingsMenu.quotaSetToken'),
          theme: QUIET_SELECT_THEME,
          default: loadKimiAccessToken(),
        }), '');
        if (typeof token === 'string') {
          if (token.trim()) {
            saveKimiAccessToken(token.trim());
            await refreshQuota();
            console.log(chalk.green(t('settingsMenu.quotaTokenSaved')));
          } else {
            saveKimiAccessToken('');
            await refreshQuota();
            console.log(chalk.yellow(t('settingsMenu.quotaTokenCleared')));
          }
        }
        break;
      }
      case 'back':
      default:
        return;
    }
  }
}

/**
 * 最近会话菜单：搜索并选择项目。
 */
export async function recentSessionsMenu(env, messages = [], options = {}) {
  while (true) {
    await redrawWelcome(env, messages, options);

    const sessions = await loadSessions(env);
    const groups = buildWorktreeGroups(buildProjects(sessions));

    if (groups.length === 0) {
      console.log(chalk.yellow(t('recentMenu.noProjects')));
      return;
    }

    const fuse = new Fuse(groups, FUSE_OPTIONS);

    const selected = await promptWithCancel(() => search({
      message: t('recentMenu.title'),
      theme: QUIET_SEARCH_THEME,
      instructions: hint('search'),
      source: (input = '') => {
        const term = input.trim();
        const results = term ? fuse.search(term).map(r => r.item) : groups;
        return [
          ...results.map(g => {
            const name = truncate(g.name, 20);
            const path = chalk.gray(truncate(g.path, PATH_WIDTH - 2));
            const meta = chalk.dim(`(${t('recentMenu.sessionMeta', { count: g.sessionCount, time: formatTime(g.lastUpdated) })})`);
            const latestProject = g.worktrees[0]?.project;
            return {
              name: `${padEnd(name, NAME_WIDTH)}${padEnd(path, PATH_WIDTH)}${meta}`,
              value: g,
              description: latestProject
                ? t('recentMenu.latest', { title: truncate(getLatestSession(latestProject).title, 60) })
                : '',
            };
          }),
          { name: t('recentMenu.back'), value: 'back' },
        ];
      },
    }));

    if (selected === 'back') return;

    if (!selected || !selected.worktrees) {
      console.warn(chalk.yellow(t('recentMenu.projectNotFound')));
      continue;
    }

    if (selected.worktrees.length === 1) {
      await projectMenu(selected.worktrees[0].project, env, options);
    } else {
      await worktreeMenu(selected, env, options);
    }
  }
}

/**
 * worktree 选择菜单：对合并后的项目，列出其下所有 worktree。
 */
async function worktreeMenu(group, env, options = {}) {
  while (true) {
    await redrawWelcome(env, [], options);

    const choices = [
      { name: t('worktreeMenu.back'), value: 'back' },
      ...group.worktrees.map(w => {
        const label = w.isMain ? t('worktreeMenu.mainLabel') : t('worktreeMenu.worktreeLabel');
        const name = truncate(w.name, 18);
        const path = chalk.gray(truncate(w.project.path, PATH_WIDTH - 2));
        const meta = chalk.dim(`(${t('worktreeMenu.sessionMeta', { count: w.sessionCount, time: formatTime(w.lastUpdated) })})`);
        return {
          name: `${padEnd(`${label} ${name}`, NAME_WIDTH)}${padEnd(path, PATH_WIDTH)}${meta}`,
          value: w.project,
          description: t('recentMenu.latest', { title: truncate(getLatestSession(w.project).title, 60) }),
        };
      }),
    ];

    const project = await promptWithCancel(() => select({
      message: t('worktreeMenu.title', { name: group.name }),
      theme: QUIET_SELECT_THEME,
      default: group.worktrees[0]?.project?.path,
      instructions: hint('select'),
      choices,
    }));

    if (project === 'back') return;

    if (!project) {
      console.warn(chalk.yellow(t('recentMenu.projectNotFound')));
      continue;
    }

    await projectMenu(project, env, options);
  }
}

/**
 * 项目菜单：对单个项目继续、新建、查看历史或清理会话。
 */
async function projectMenu(project, env, options = {}) {
  while (true) {
    await redrawWelcome(env, [], options);

    const sessions = await loadSessions(env);
    const projects = buildProjects(sessions);
    const currentProject = findProjectByPath(projects, project.path) || { ...project, sessions: [] };
    const latest = currentProject.sessions.length > 0 ? getLatestSession(currentProject) : null;

    const choices = [
      { name: t('projectMenu.back'), value: 'back' },
      { name: latest ? t('projectMenu.continueLatest', { title: truncate(latest.title, 40) }) : t('projectMenu.continueLatestEmpty'), value: 'continue-latest', disabled: !latest },
      { name: t('projectMenu.history'), value: 'history', disabled: currentProject.sessions.length === 0 },
      { name: t('projectMenu.new'), value: 'new' },
      { name: t('projectMenu.cleanup'), value: 'cleanup', disabled: currentProject.sessions.length === 0 },
    ];

    const action = await promptWithCancel(() => select({
      message: t('projectMenu.title', { name: currentProject.name }),
      theme: QUIET_SELECT_THEME,
      default: 'continue-latest',
      instructions: hint('select'),
      choices,
    }));

    switch (action) {
      case 'continue-latest':
        if (latest) {
          try {
            await continueSession(latest);
            console.log(chalk.green(t('projectMenu.continueStarted', { title: truncate(latest.title, 40) })));
          } catch (err) {
            console.error(chalk.red(t('projectMenu.launchFailed', { message: err.message })));
          }
        }
        break;
      case 'history':
        if (currentProject.sessions.length > 0) await historyMenu(currentProject, env, options);
        break;
      case 'new':
        try {
          await createSession(currentProject.path, currentProject.name);
          console.log(chalk.green(t('projectMenu.newStarted', { name: currentProject.name })));
        } catch (err) {
          console.error(chalk.red(t('projectMenu.launchFailed', { message: err.message })));
        }
        break;
      case 'cleanup':
        if (currentProject.sessions.length > 0) {
          await cleanupMenu(currentProject, env, options);
          const refreshed = await loadSessions(env);
          const refreshedProjects = buildProjects(refreshed);
          if (!findProjectByPath(refreshedProjects, currentProject.path)) {
            return;
          }
        }
        break;
      case 'back':
      default:
        return;
    }
  }
}

/**
 * 历史消息菜单。
 */
export async function messagesMenu(env, messages = [], options = {}) {
  await redrawWelcome(env, messages, options);

  if (messages.length === 0) {
    console.log(chalk.yellow(t('messagesMenu.empty')));
    return;
  }

  const choices = [
    { name: t('messagesMenu.back'), value: 'back' },
    ...messages.map((msg, index) => ({
      name: `${msg.time || '-'}  [${msg.level || 'info'}]  ${msg.text}`,
      value: index,
    })),
  ];

  const selected = await promptWithCancel(() => select({
    message: t('messagesMenu.title'),
    theme: QUIET_SELECT_THEME,
    instructions: hint('select'),
    choices,
    pageSize: 15,
  }));
  if (selected === 'back') return;

  const msg = messages[selected];
  if (msg) {
    console.log(chalk.cyan(`${t('messagesMenu.time')}: ${msg.time || '-'}`));
    console.log(chalk.cyan(`${t('messagesMenu.level')}: ${msg.level || 'info'}`));
    console.log(chalk.cyan(`${t('messagesMenu.content')}: ${msg.text}`));
  }
}

/**
 * 项目历史会话菜单。
 */
async function historyMenu(project, env, options = {}) {
  while (true) {
    await redrawWelcome(env, [], options);

    const choices = [
      { name: t('historyMenu.back'), value: 'back' },
      ...project.sessions.map(s => ({
        name: `${truncate(s.title, 40)}  ${chalk.gray(formatTime(s.updatedAt))}`,
        value: s.id,
        description: (s.lastPrompt || '').slice(0, 80),
      })),
    ];

    const sid = await promptWithCancel(() => select({
      message: t('historyMenu.title'),
      theme: QUIET_SELECT_THEME,
      instructions: hint('select'),
      choices,
      pageSize: 15,
      default: project.sessions[0]?.id,
    }));
    if (sid === 'back') return;
    const session = project.sessions.find(s => s.id === sid);
    if (session) await continueSession({ ...session, projectName: project.name });
  }
}

/**
 * 会话清理菜单：删除或归档选中的会话。
 */
async function cleanupMenu(project, env, options = {}) {
  while (true) {
    await redrawWelcome(env, [], options);

    const { checkbox } = await import('@inquirer/prompts');
    const choices = [
      { name: t('cleanupMenu.back'), value: 'back' },
      ...project.sessions.map(s => ({
        name: `${truncate(s.title, 40)}  ${chalk.gray(formatTime(s.updatedAt))}`,
        value: s.id,
        checked: false,
      })),
    ];

    const ids = await promptWithCancel(
      () => checkbox({ message: t('cleanupMenu.title'), choices, theme: QUIET_CHECKBOX_THEME, instructions: hint('checkbox') }),
      ['back']
    );
    if (ids.length === 0 || ids.includes('back')) return;

    const mode = await promptWithCancel(() => select({
      message: t('cleanupMenu.modeTitle'),
      theme: QUIET_SELECT_THEME,
      default: 'delete',
      instructions: hint('select'),
      choices: [
        { name: t('cleanupMenu.delete'), value: 'delete' },
        { name: t('cleanupMenu.archive'), value: 'archive' },
        { name: t('cleanupMenu.cancel'), value: 'cancel' },
      ],
    }));

    if (mode === 'cancel') return;
    for (const id of ids) {
      const session = project.sessions.find(s => s.id === id);
      if (!session) continue;
      try {
        if (mode === 'delete') {
          await deleteSession(session, env);
        } else {
          await archiveSession(session, env);
        }
      } catch (err) {
        console.error(chalk.red(t('cleanupMenu.failed', { title: truncate(session.title, 40), message: err.message })));
      }
    }
    const actionLabel = mode === 'delete' ? t('cleanupMenu.deleteAction') : t('cleanupMenu.archiveAction');
    console.log(chalk.green(t('cleanupMenu.result', { action: actionLabel, count: ids.length })));

    const sessions = await loadSessions(env);
    const projects = buildProjects(sessions);
    const newProject = findProjectByPath(projects, project.path);
    if (!newProject || newProject.sessions.length === 0) {
      console.log(chalk.yellow(t('cleanupMenu.noSessions')));
      return;
    }
  }
}
