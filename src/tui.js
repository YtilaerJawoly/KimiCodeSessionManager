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
import { acquireInstanceLock, releaseInstanceLock } from './config.js';

const QUIET_SELECT_THEME = {
  prefix: '',
  style: {
    message: () => '',
    answer: () => '',
  },
};

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

function printWelcome(kimiVersion, notices = []) {
  process.stdout.write('\x1B[2J\x1B[H');
  const title = `Kimi Code Session Manager ${pkg.version}`;
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
  console.log(chalk.hex('#4A90E2')(line(linePrefix, `Kimi Code: ${kimiVersion || 'unknown'}`)));
  for (const notice of notices) {
    console.log(chalk.hex('#4A90E2')(line(linePrefix, notice)));
  }
  console.log(chalk.hex('#4A90E2')('│' + ' '.repeat(width) + '│'));
  console.log(chalk.hex('#4A90E2')(bottom));
  console.log();
}

function getKimiHome(env = process.env) {
  const raw = env.KIMI_HOME?.trim();
  return raw ? resolve(raw) : resolve(homedir(), '.kimi-code');
}

function getKimiVersion(env = process.env) {
  return new Promise((resolve) => {
    const exe = join(getKimiHome(env), 'bin', 'kimi.exe');
    if (!existsSync(exe)) {
      resolve('');
      return;
    }
    const child = spawn(exe, ['--version'], { shell: false });
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (data) => { stdout += data; });
    child.stderr?.on('data', (data) => { stderr += data; });
    child.on('error', () => resolve(''));
    child.on('close', (code) => {
      const output = (stdout || stderr).trim();
      if (code !== 0 || !output) {
        resolve('');
        return;
      }
      const match = output.match(/(?:kimi\s+)?v?(\d+\.\d+(?:\.\d+)?)/i);
      resolve(match ? match[1] : output);
    });
  });
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
        ? `Kimi Code Session Manager 已在运行中（PID: ${lock.pid}）`
        : `无法获取单实例锁：${lock.error || '未知错误'}`;
      console.error(chalk.red(message));
      process.exitCode = 1;
      return;
    }
    lockAcquired = true;

    const [kimiVersion, kimiCodeStatus] = await Promise.all([
      getKimiVersion(env),
      checkKimiCodeVersion(env),
    ]);
    const ksmStatus = await checkKsmVersion(ROOT_DIR);

    const notices = [];
    if (!kimiCodeStatus.installed) {
      notices.push(chalk.yellow('Kimi Code 未安装'));
    } else if (kimiCodeStatus.hasUpdate) {
      notices.push(chalk.yellow(`Kimi Code 有新版本可用: ${kimiCodeStatus.latest}`));
    }
    if (ksmStatus.hasUpdate) {
      notices.push(chalk.yellow(`ksm 有新版本可用: ${ksmStatus.latest}`));
    }

    printWelcome(kimiVersion, notices);

    if (!kimiCodeStatus.installed) {
      const shouldInstall = await select({
        message: 'Kimi Code 未安装，是否立即安装？',
        theme: QUIET_SELECT_THEME,
        choices: [
          { name: '是', value: true },
          { name: '否', value: false },
        ],
      });
      if (shouldInstall) {
        const result = await updateKimiCode();
        if (result.success) {
          console.log(chalk.green('Kimi Code 安装成功。'));
        } else {
          console.error(chalk.red(`Kimi Code 安装失败：${result.message}`));
          console.log(chalk.yellow('请手动运行：irm https://code.kimi.com/kimi-code/install.ps1 | iex'));
        }
      }
    }

    await mainMenu(env);
  } catch (err) {
    if (err?.message && /cancelled|prompt was canceled/i.test(err.message)) {
      return;
    }
    console.error(chalk.red(`错误：${err?.message || err}`));
    process.exit(1);
  } finally {
    if (lockAcquired && env) {
      releaseInstanceLock(env);
    }
  }
}

async function mainMenu(env) {
  while (true) {
    const action = await select({
      message: '主菜单：',
      theme: QUIET_SELECT_THEME,
      choices: [
        { name: '继续最近会话', value: 'recent' },
        { name: '更新', value: 'update' },
        { name: '快捷设置', value: 'settings' },
        { name: '退出', value: 'exit' },
      ],
    });

    switch (action) {
      case 'recent':
        await recentSessionsMenu(env);
        break;
      case 'update':
        await updateMenu();
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

async function updateMenu() {
  while (true) {
    const action = await select({
      message: '更新：',
      theme: QUIET_SELECT_THEME,
      default: 'ksm',
      choices: [
        { name: '返回上一级', value: 'back' },
        { name: '更新 ksm', value: 'ksm' },
        { name: '更新 Kimi Code', value: 'kimiCode' },
      ],
    });

    switch (action) {
      case 'ksm': {
        const result = await updateKsm(ROOT_DIR);
        if (result.success) {
          console.log(chalk.green(`ksm 更新成功：${result.message}`));
        } else {
          console.error(chalk.red(`ksm 更新失败：${result.message}`));
          console.log(chalk.yellow('请手动运行：git pull'));
        }
        break;
      }
      case 'kimiCode': {
        const result = await updateKimiCode();
        if (result.success) {
          console.log(chalk.green(`Kimi Code 更新成功：${result.message}`));
        } else {
          console.error(chalk.red(`Kimi Code 更新失败：${result.message}`));
          console.log(chalk.yellow('请手动运行：irm https://code.kimi.com/kimi-code/install.ps1 | iex'));
        }
        break;
      }
      case 'back':
      default:
        return;
    }
  }
}

async function shortcutSettingsMenu() {
  while (true) {
    const action = await select({
      message: '快捷设置：',
      theme: QUIET_SELECT_THEME,
      default: 'desktop',
      choices: [
        { name: '返回上一级', value: 'back' },
        { name: '在桌面添加 start.exe 快捷方式', value: 'desktop' },
      ],
    });

    switch (action) {
      case 'desktop': {
        const result = await createDesktopShortcut(join(ROOT_DIR, 'start.exe'));
        if (result.success) {
          console.log(chalk.green(`已创建桌面快捷方式：${result.message}`));
        } else {
          console.error(chalk.red(`创建失败：${result.message}`));
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
    console.log(chalk.yellow('未找到任何 Kimi 会话。'));
    return;
  }

  const fuse = new Fuse(projects, FUSE_OPTIONS);

  const selectedPath = await search({
    message: '搜索并选择一个项目继续最新会话：',
    theme: QUIET_SEARCH_THEME,
    source: (input = '') => {
      const term = input.trim();
      const results = term ? fuse.search(term).map(r => r.item) : projects;
      return [
        { name: '返回上一级', value: 'back' },
        ...results.map(p => {
          const name = truncate(p.name, 20);
          const path = chalk.gray(truncate(p.path, PATH_WIDTH - 2));
          const meta = chalk.dim(`(${p.sessionCount} 个会话, 最近 ${formatTime(p.lastUpdated)})`);
          return {
            name: `${padEnd(name, NAME_WIDTH)}${padEnd(path, PATH_WIDTH)}${meta}`,
            value: p.path,
            description: `最新: ${truncate(getLatestSession(p).title, 60)}`,
          };
        }),
      ];
    },
  });

  if (selectedPath === 'back') return;

  const project = findProjectByPath(projects, selectedPath);
  if (!project) {
    console.warn(chalk.yellow('未找到选择的项目。'));
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
      { name: '返回上一级', value: 'back' },
      { name: latest ? `继续最新会话: ${truncate(latest.title, 40)}` : '继续最新会话（无）', value: 'continue-latest', disabled: !latest },
      { name: '查看该项目的历史会话', value: 'history', disabled: currentProject.sessions.length === 0 },
      { name: '为此项目新建会话', value: 'new' },
      { name: '清理/归档旧会话', value: 'cleanup', disabled: currentProject.sessions.length === 0 },
    ];

    const action = await select({
      message: `${currentProject.name} — 选择操作：`,
      theme: QUIET_SELECT_THEME,
      default: 'continue-latest',
      choices,
    });

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

async function historyMenu(project) {
  const choices = [
    { name: '返回上一级', value: 'back' },
    ...project.sessions.map(s => ({
      name: `${truncate(s.title, 40)}  ${chalk.gray(formatTime(s.updatedAt))}`,
      value: s.id,
      description: (s.lastPrompt || '').slice(0, 80),
    })),
  ];

  const sid = await select({
    message: '选择要继续的历史会话：',
    theme: QUIET_SELECT_THEME,
    choices,
    pageSize: 15,
    default: project.sessions[0]?.id,
  });
  if (sid === 'back') return;
  const session = project.sessions.find(s => s.id === sid);
  if (session) await continueSession({ ...session, projectName: project.name });
}

async function cleanupMenu(project, env) {
  const { checkbox } = await import('@inquirer/prompts');
  const choices = [
    { name: '返回上一级', value: 'back' },
    ...project.sessions.map(s => ({
      name: `${truncate(s.title, 40)}  ${chalk.gray(formatTime(s.updatedAt))}`,
      value: s.id,
      checked: false,
    })),
  ];

  const ids = await checkbox({ message: '选择要清理的会话（支持多选）：', choices, theme: { prefix: '' } });
  if (ids.length === 0 || ids.includes('back')) return;

  const mode = await select({
    message: '如何处理选中的会话？',
    theme: QUIET_SELECT_THEME,
    default: 'delete',
    choices: [
      { name: '删除（释放磁盘空间）', value: 'delete' },
      { name: '归档（移动到 archive 目录）', value: 'archive' },
      { name: '取消', value: 'cancel' },
    ],
  });

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
      console.error(chalk.red(`处理 ${truncate(session.title, 40)} 失败：${err.message}`));
    }
  }
  console.log(chalk.green(`已${mode === 'delete' ? '删除' : '归档'} ${ids.length} 个会话。`));

  const sessions = await loadSessions(env);
  const projects = buildProjects(sessions);
  const newProject = findProjectByPath(projects, project.path);
  if (!newProject || newProject.sessions.length === 0) {
    console.log(chalk.yellow('该项目已无会话，返回主界面。'));
  }
}

function truncate(str, max) {
  const safe = str || '';
  if (safe.length <= max) return safe;
  return safe.slice(0, max - 1) + '…';
}

function formatTime(iso) {
  const d = new Date(iso);
  return isNaN(d) ? iso : d.toLocaleString('zh-CN');
}
