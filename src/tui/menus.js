import { search, select } from '@inquirer/prompts';
import Fuse from 'fuse.js';
import chalk from 'chalk';
import { join } from 'node:path';
import { loadSessions } from '../loader.js';
import { buildProjects, getLatestSession, findProjectByPath } from '../store.js';
import { continueSession, createSession } from '../actions.js';
import { deleteSession, archiveSession } from '../cleanup.js';
import { updateKimiCode, updateKsm } from '../updater.js';
import { createDesktopShortcut } from '../shortcut.js';
import { t, getLocale, setLocale } from '../i18n.js';
import { saveKsmConfig } from '../config.js';
import { getKimiVersion, printWelcome } from './welcome.js';
import {
  clearLastLine,
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
 *   1. 更新、语言、快捷设置、最近会话、项目、历史、清理、历史消息等菜单。
 *   2. 负责调用 actions / cleanup / updater 执行业务动作，并在 TUI 中反馈结果。
 *
 * 设计原则：
 *   - 每个菜单函数只处理一个独立页面，避免 index.js 膨胀。
 *   - 菜单间通过函数调用跳转，返回上级即函数返回。
 *   - 默认选中项统一放在“返回上一级”之后的第一项，提升键盘操作体验。
 */

/**
 * 更新菜单。
 */
export async function updateMenu(env, messages = []) {
  while (true) {
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
    clearLastLine();

    switch (action) {
      case 'ksm': {
        const result = await updateKsm(ROOT_DIR);
        if (result.success) {
          console.log(chalk.green(t('updateMenu.ksmSuccess', { message: result.message })));
        } else {
          console.error(chalk.red(t('updateMenu.ksmFailed', { message: result.message })));
          console.log(chalk.yellow(t('updateMenu.ksmManual')));
        }
        // 刷新欢迎界面，保持消息区可见
        printWelcome(await getKimiVersion(env), messages);
        break;
      }
      case 'kimiCode': {
        console.log(chalk.yellow(t('updateMenu.kimiCodeInstalling')));
        const result = await updateKimiCode();
        clearLastLine();
        if (result.success) {
          console.log(chalk.green(t('updateMenu.kimiCodeSuccess')));
          console.log(chalk.yellow(t('updateMenu.kimiCodeRestart')));
        } else {
          console.error(chalk.red(t('updateMenu.kimiCodeFailed', { message: result.message })));
          console.log(chalk.yellow(t('updateMenu.kimiCodeManual')));
        }
        // 刷新欢迎界面，显示新的 Kimi Code 版本并保持消息区可见
        printWelcome(await getKimiVersion(env), messages);
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
export async function languageMenu(env, messages = []) {
  const current = getLocale();
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
  clearLastLine();
  if (action && action !== 'back' && action !== current) {
    setLocale(action);
    saveKsmConfig({ locale: action }, env);
    printWelcome(await getKimiVersion(env), messages);
  }
}

/**
 * 快捷设置菜单。
 */
export async function shortcutSettingsMenu(env, messages = []) {
  while (true) {
    const action = await promptWithCancel(() => select({
      message: t('settingsMenu.title'),
      theme: QUIET_SELECT_THEME,
      default: 'desktop',
      instructions: hint('select'),
      choices: [
        { name: t('settingsMenu.back'), value: 'back' },
        { name: t('settingsMenu.desktop'), value: 'desktop' },
      ],
    }));
    clearLastLine();

    switch (action) {
      case 'desktop': {
        const result = await createDesktopShortcut(join(ROOT_DIR, 'start.exe'));
        if (result.success) {
          console.log(chalk.green(t('settingsMenu.desktopSuccess', { message: result.message })));
        } else {
          console.error(chalk.red(t('settingsMenu.desktopFailed', { message: result.message })));
        }
        // 刷新欢迎界面，保持消息区可见
        printWelcome(await getKimiVersion(env), messages);
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
export async function recentSessionsMenu(env, messages = []) {
  while (true) {
    // 清屏并重新绘制欢迎界面，避免主菜单残留消息导致视觉上选项下移
    printWelcome(await getKimiVersion(env), messages);

    const sessions = await loadSessions(env);
    const projects = buildProjects(sessions);

    if (projects.length === 0) {
      console.log(chalk.yellow(t('recentMenu.noProjects')));
      return;
    }

    const fuse = new Fuse(projects, FUSE_OPTIONS);

    const selectedPath = await promptWithCancel(() => search({
      message: t('recentMenu.title'),
      theme: QUIET_SEARCH_THEME,
      instructions: hint('search'),
      source: (input = '') => {
        const term = input.trim();
        const results = term ? fuse.search(term).map(r => r.item) : projects;
        return [
          ...results.map(p => {
            const name = truncate(p.name, 20);
            const path = chalk.gray(truncate(p.path, PATH_WIDTH - 2));
            const meta = chalk.dim(`(${t('recentMenu.sessionMeta', { count: p.sessionCount, time: formatTime(p.lastUpdated) })})`);
            return {
              name: `${padEnd(name, NAME_WIDTH)}${padEnd(path, PATH_WIDTH)}${meta}`,
              value: p.path,
              description: t('recentMenu.latest', { title: truncate(getLatestSession(p).title, 60) }),
            };
          }),
          { name: t('recentMenu.back'), value: 'back' },
        ];
      },
    }));

    if (selectedPath === 'back') return;

    const project = findProjectByPath(projects, selectedPath);
    if (!project) {
      console.warn(chalk.yellow(t('recentMenu.projectNotFound')));
      continue;
    }

    await projectMenu(project, env);
  }
}

/**
 * 项目菜单：对单个项目继续、新建、查看历史或清理会话。
 */
async function projectMenu(project, env) {
  while (true) {
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
    clearLastLine();

    switch (action) {
      case 'continue-latest':
        if (latest) {
          await continueSession(latest);
          console.log(chalk.green(t('projectMenu.continueStarted', { title: truncate(latest.title, 40) })));
        }
        break;
      case 'history':
        if (currentProject.sessions.length > 0) await historyMenu(currentProject);
        break;
      case 'new':
        await createSession(currentProject.path, currentProject.name);
        console.log(chalk.green(t('projectMenu.newStarted', { name: currentProject.name })));
        break;
      case 'cleanup':
        if (currentProject.sessions.length > 0) {
          await cleanupMenu(currentProject, env);
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
export async function messagesMenu(messages) {
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
  clearLastLine();
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
async function historyMenu(project) {
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
  clearLastLine();
  if (sid === 'back') return;
  const session = project.sessions.find(s => s.id === sid);
  if (session) await continueSession({ ...session, projectName: project.name });
}

/**
 * 会话清理菜单：删除或归档选中的会话。
 */
async function cleanupMenu(project, env) {
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
  clearLastLine();

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
  }
}
