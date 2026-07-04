import { readFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { select, search } from '@inquirer/prompts';
import chalk from 'chalk';
import Fuse from 'fuse.js';
import { loadSessions } from './loader.js';
import { buildProjects, getLatestSession, findProjectByPath } from './store.js';
import { continueSession, createSession } from './actions.js';
import { deleteSession, archiveSession } from './cleanup.js';
import { updateKimiCode, updateKsm, checkKimiCodeVersion, checkKsmVersion } from './updater.js';
import { createDesktopShortcut } from './shortcut.js';
import { acquireInstanceLock, releaseInstanceLock, loadKsmConfig, saveKsmConfig } from './config.js';
import { setLocale, t, getLocale } from './i18n.js';

const QUIET_SELECT_THEME = {
  prefix: '',
  style: {
    message: () => '',
    answer: () => '',
  },
};

function clearLastLine() {
  process.stdout.write('\x1B[1A\x1B[K');
}

const QUIET_SEARCH_THEME = {
  prefix: '',
  style: {
    message: () => '',
    answer: () => '',
  },
};
const NAME_WIDTH = 22;
const PATH_WIDTH = 42;
const FUSE_OPTIONS = { keys: ['name', 'path'], threshold: 0.4 };

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = resolve(__dirname, '..');
const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf8'));

function printWelcome(kimiVersion, messages = []) {
  process.stdout.write('\x1B[2J\x1B[H');
  const title = t('welcome.title', { version: pkg.version });
  const width = 80;
  const leftPad = '  ';
  const logoPrefix = '▐█▛█▛█▌  ';
  const linePrefix = '▐█████▌  ';
  const line = (prefix, text) => {
    const visibleText = leftPad + prefix + text;
    const pad = width - stringWidth(visibleText);
    return '│' + visibleText + ' '.repeat(Math.max(0, pad)) + '│';
  };
  const border = '╭' + '─'.repeat(width) + '╮';
  const bottom = '╰' + '─'.repeat(width) + '╯';
  console.log(chalk.hex('#4A90E2')(border));
  console.log(chalk.hex('#4A90E2')('│' + ' '.repeat(width) + '│'));
  console.log(chalk.hex('#4A90E2')(line(logoPrefix, title)));
  console.log(chalk.hex('#4A90E2')(line(linePrefix, t('welcome.subtitle', { version: kimiVersion || 'unknown' }))));
  console.log(chalk.hex('#4A90E2')('│' + ' '.repeat(width) + '│'));
  console.log(chalk.hex('#4A90E2')(bottom));

  for (const msg of messages.slice(0, 5)) {
    const color = msg.level === 'error' ? chalk.red : msg.level === 'warning' ? chalk.yellow : chalk.cyan;
    console.log(color(msg.text));
  }
  console.log();
}

function getKimiHome(env = process.env) {
  const raw = env.KIMI_HOME?.trim();
  return raw ? resolve(raw) : resolve(homedir(), '.kimi-code');
}

function getKimiVersion(env = process.env) {
  const home = getKimiHome(env);
  try {
    const text = readFileSync(join(home, 'updates', 'latest.json'), 'utf8');
    const data = JSON.parse(text);
    return data.latest || data.version || data.manifest?.version || '';
  } catch {
    return '';
  }
}

import { spawn } from 'node:child_process';

function padEnd(str, width) {
  const len = stringWidth(str);
  if (len >= width) return str;
  return str + ' '.repeat(width - len);
}

function stringWidth(str) {
  let width = 0;
  for (const char of String(str)) {
    const code = char.codePointAt(0);
    width += (code >= 0x4e00 && code <= 0x9fff) ? 2 : 1;
  }
  return width;
}

export async function startTui(options = {}) {
  let env;
  let lockAcquired = false;
  try {
    env = options.home ? { ...process.env, KIMI_HOME: options.home } : process.env;

    const lock = acquireInstanceLock(env);
    if (!lock.acquired) {
      const message = lock.pid
        ? t('error.alreadyRunning', { pid: lock.pid })
        : t('error.lockFailed', { message: lock.error || '' });
      console.error(chalk.red(message));
      process.exitCode = 1;
      return;
    }
    lockAcquired = true;

    const config = loadKsmConfig(env);
    if (config.locale) setLocale(config.locale);

    const kimiVersion = getKimiVersion(env);
    printWelcome(kimiVersion);

    const versionPromise = Promise.all([
      checkKimiCodeVersion(env),
      checkKsmVersion(ROOT_DIR),
    ]);

    const initialCodeStatus = await checkKimiCodeVersion(env);
    if (!initialCodeStatus.installed) {
      const shouldInstall = await select({
        message: t('install.title'),
        theme: QUIET_SELECT_THEME,
        choices: [
          { name: t('install.yes'), value: true },
          { name: t('install.no'), value: false },
        ],
      });
      clearLastLine();
      if (shouldInstall) {
        const result = await updateKimiCode();
        if (result.success) {
          console.log(chalk.green(t('install.success')));
        } else {
          console.error(chalk.red(t('install.failed', { message: result.message })));
          console.log(chalk.yellow(t('install.manual')));
        }
      }
    }

    await mainMenu(env, { versionPromise, initialCodeStatus });
  } catch (err) {
    if (err?.message && /cancelled|prompt was canceled/i.test(err.message)) {
      return;
    }
    console.error(chalk.red(t('error.prefix', { message: err?.message || err })));
    process.exit(1);
  } finally {
    if (lockAcquired && env) {
      releaseInstanceLock(env);
    }
  }
}

async function mainMenu(env, options = {}) {
  const { versionPromise, initialCodeStatus = {} } = options;
  let messages = [];
  let checked = false;
  let pendingPromise = versionPromise || null;

  function buildMessages(kimiCodeStatus, ksmStatus) {
    const list = [];
    if (!kimiCodeStatus.installed) {
      list.push({ level: 'warning', text: t('install.title') });
    } else if (kimiCodeStatus.hasUpdate) {
      list.push({ level: 'warning', text: t('mainMenu.kimiCodeUpdate', { version: kimiCodeStatus.latest }) });
    }
    if (ksmStatus.hasUpdate) {
      list.push({ level: 'warning', text: t('mainMenu.ksmUpdate', { version: ksmStatus.latest }) });
    }
    return list;
  }

  if (!pendingPromise) {
    messages = buildMessages(initialCodeStatus, {});
  }

  while (true) {
    const kimiVersion = getKimiVersion(env);
    printWelcome(kimiVersion, messages);

    const prompt = select({
      message: t('mainMenu.title'),
      theme: QUIET_SELECT_THEME,
      choices: [
        { name: t('mainMenu.recent'), value: 'recent' },
        { name: t('mainMenu.update'), value: 'update' },
        { name: t('mainMenu.language'), value: 'language' },
        { name: t('mainMenu.messages'), value: 'messages' },
        { name: t('mainMenu.settings'), value: 'settings' },
        { name: t('mainMenu.exit'), value: 'exit' },
      ],
    });

    if (pendingPromise && !checked) {
      checked = true;
      pendingPromise.then(([kimiCodeStatus, ksmStatus]) => {
        messages = buildMessages(kimiCodeStatus, ksmStatus);
        try { prompt.cancel(); } catch {}
      }).catch(() => {
        messages = [];
      });
      pendingPromise = null;
    }

    let action;
    try {
      action = await prompt;
      clearLastLine();
    } catch (err) {
      if (err?.message && /cancelled|prompt was canceled/i.test(err.message)) {
        continue;
      }
      throw err;
    }

    switch (action) {
      case 'recent':
        await recentSessionsMenu(env);
        break;
      case 'update':
        await updateMenu(env, messages);
        break;
      case 'language':
        await languageMenu(env);
        break;
      case 'messages':
        await messagesMenu(messages);
        break;
      case 'settings':
        await shortcutSettingsMenu();
        break;
      case 'exit':
      default:
        return;
    }
  }
}

async function updateMenu(env, messages = []) {
  while (true) {
    const action = await select({
      message: t('updateMenu.title'),
      theme: QUIET_SELECT_THEME,
      default: 'ksm',
      choices: [
        { name: t('updateMenu.back'), value: 'back' },
        { name: t('updateMenu.ksm'), value: 'ksm' },
        { name: t('updateMenu.kimiCode'), value: 'kimiCode' },
      ],
    });
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
        printWelcome(getKimiVersion(env), messages);
        break;
      }
      case 'kimiCode': {
        const result = await updateKimiCode();
        if (result.success) {
          console.log(chalk.green(result.message));
          console.log(chalk.yellow(t('updateMenu.kimiCodeWindowOpened')));
        } else {
          console.error(chalk.red(t('updateMenu.ksmFailed', { message: result.message })));
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

async function languageMenu(env) {
  const current = getLocale();
  const action = await select({
    message: t('languageMenu.title'),
    theme: QUIET_SELECT_THEME,
    default: current,
    choices: [
      { name: t('languageMenu.zhCN'), value: 'zh-CN' },
      { name: t('languageMenu.en'), value: 'en' },
    ],
  });
  clearLastLine();
  if (action && action !== current) {
    setLocale(action);
    saveKsmConfig({ locale: action }, env);
  }
}

async function shortcutSettingsMenu() {
  while (true) {
    const action = await select({
      message: t('settingsMenu.title'),
      theme: QUIET_SELECT_THEME,
      default: 'desktop',
      choices: [
        { name: t('settingsMenu.back'), value: 'back' },
        { name: t('settingsMenu.desktop'), value: 'desktop' },
      ],
    });
    clearLastLine();

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
      case 'back':
      default:
        return;
    }
  }
}

async function recentSessionsMenu(env) {
  const sessions = await loadSessions(env);
  const projects = buildProjects(sessions);

  if (projects.length === 0) {
    console.log(chalk.yellow(t('recentMenu.noProjects')));
    return;
  }

  const fuse = new Fuse(projects, FUSE_OPTIONS);

  const selectedPath = await search({
    message: t('recentMenu.title'),
    theme: QUIET_SEARCH_THEME,
    source: (input = '') => {
      const term = input.trim();
      const results = term ? fuse.search(term).map(r => r.item) : projects;
      return [
        { name: t('recentMenu.back'), value: 'back' },
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
      ];
    },
  });

  if (selectedPath === 'back') return;

  const project = findProjectByPath(projects, selectedPath);
  if (!project) {
    console.warn(chalk.yellow(t('recentMenu.projectNotFound')));
    return;
  }

  await projectMenu(project, env);
  // 项目菜单返回后，回到主菜单
}

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

    const action = await select({
      message: t('projectMenu.title', { name: currentProject.name }),
      theme: QUIET_SELECT_THEME,
      default: 'continue-latest',
      choices,
    });
    clearLastLine();

    switch (action) {
      case 'continue-latest':
        if (latest) await continueSession(latest);
        break;
      case 'history':
        if (currentProject.sessions.length > 0) await historyMenu(currentProject);
        break;
      case 'new':
        await createSession(currentProject.path, currentProject.name);
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

async function messagesMenu(messages) {
  const choices = [
    { name: t('messagesMenu.back'), value: 'back' },
    ...messages.map((msg, index) => ({
      name: `${msg.time || '-'}  [${msg.level || 'info'}]  ${msg.text}`,
      value: index,
    })),
  ];

  if (messages.length === 0) {
    console.log(chalk.yellow(t('messagesMenu.empty')));
    return;
  }

  const selected = await select({
    message: t('messagesMenu.title'),
    theme: QUIET_SELECT_THEME,
    choices,
    pageSize: 15,
  });
  clearLastLine();
  if (selected === 'back') return;

  const msg = messages[selected];
  if (msg) {
    console.log(chalk.cyan(`${t('messagesMenu.time')}: ${msg.time || '-'}`));
    console.log(chalk.cyan(`${t('messagesMenu.level')}: ${msg.level || 'info'}`));
    console.log(chalk.cyan(`${t('messagesMenu.content')}: ${msg.text}`));
  }
}

async function historyMenu(project) {
  const choices = [
    { name: t('historyMenu.back'), value: 'back' },
    ...project.sessions.map(s => ({
      name: `${truncate(s.title, 40)}  ${chalk.gray(formatTime(s.updatedAt))}`,
      value: s.id,
      description: (s.lastPrompt || '').slice(0, 80),
    })),
  ];

  const sid = await select({
    message: t('historyMenu.title'),
    theme: QUIET_SELECT_THEME,
    choices,
    pageSize: 15,
    default: project.sessions[0]?.id,
  });
  clearLastLine();
  if (sid === 'back') return;
  const session = project.sessions.find(s => s.id === sid);
  if (session) await continueSession({ ...session, projectName: project.name });
}

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

  const ids = await checkbox({ message: t('cleanupMenu.title'), choices, theme: { prefix: '' } });
  if (ids.length === 0 || ids.includes('back')) return;

  const mode = await select({
    message: t('cleanupMenu.modeTitle'),
    theme: QUIET_SELECT_THEME,
    default: 'delete',
    choices: [
      { name: t('cleanupMenu.delete'), value: 'delete' },
      { name: t('cleanupMenu.archive'), value: 'archive' },
      { name: t('cleanupMenu.cancel'), value: 'cancel' },
    ],
  });
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

function truncate(str, max) {
  const safe = str || '';
  if (safe.length <= max) return safe;
  return safe.slice(0, max - 1) + '…';
}

function formatTime(iso) {
  const d = new Date(iso);
  const locale = getLocale() === 'zh-CN' ? 'zh-CN' : 'en-US';
  return isNaN(d) ? iso : d.toLocaleString(locale);
}
