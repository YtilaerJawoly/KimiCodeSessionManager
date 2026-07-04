import { readFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { select, search } from '@inquirer/prompts';
import chalk from 'chalk';
import Fuse from 'fuse.js';
import { loadSessions } from './loader.js';
import { buildProjects, getLatestSession, findProjectByPath } from './store.js';
import { continueSession, createSession } from './actions.js';
import { deleteSession, archiveSession } from './cleanup.js';

const NAME_WIDTH = 22;
const PATH_WIDTH = 42;
const FUSE_OPTIONS = { keys: ['name', 'path'], threshold: 0.4 };

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf8'));

function printWelcome(kimiVersion) {
  process.stdout.write('\x1B[2J\x1B[H');
  const title = `Kimi Code Session Manager ${pkg.version}`;
  const width = 80;
  const line = (text) => {
    const pad = width - stringWidth(text);
    return '│' + text + ' '.repeat(Math.max(0, pad)) + '│';
  };
  const border = '╭' + '─'.repeat(width) + '╮';
  const bottom = '╰' + '─'.repeat(width) + '╯';
  console.log(chalk.hex('#4A90E2')(border));
  console.log(chalk.hex('#4A90E2')(line('')));
  console.log(chalk.hex('#4A90E2')(line(`  ▐█▛█▛█▌  ${title}`)));
  console.log(chalk.hex('#4A90E2')(line(`  ▐█████▌  Kimi Code: ${kimiVersion || 'unknown'}`)));
  console.log(chalk.hex('#4A90E2')(line('')));
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
  try {
    const env = options.home ? { ...process.env, KIMI_HOME: options.home } : process.env;
    printWelcome(await getKimiVersion(env));
    const sessions = await loadSessions(env);
    const projects = buildProjects(sessions);

    if (projects.length === 0) {
      console.log(chalk.yellow('未找到任何 Kimi 会话。'));
      return;
    }

    const fuse = new Fuse(projects, FUSE_OPTIONS);

    const selectedPath = await search({
      message: '搜索并选择一个项目继续最新会话：',
      source: (input = '') => {
        const term = input.trim();
        const results = term ? fuse.search(term).map(r => r.item) : projects;
        return results.map(p => {
          const name = truncate(p.name, 20);
          const path = chalk.gray(truncate(p.path, PATH_WIDTH - 2));
          const meta = chalk.dim(`(${p.sessionCount} 个会话, 最近 ${formatTime(p.lastUpdated)})`);
          return {
            name: `${padEnd(name, NAME_WIDTH)}${padEnd(path, PATH_WIDTH)}${meta}`,
            value: p.path,
            description: `最新: ${truncate(getLatestSession(p).title, 60)}`,
          };
        });
      },
    });

    const project = findProjectByPath(projects, selectedPath);
    if (!project) {
      console.warn(chalk.yellow('未找到选择的项目。'));
      return;
    }

    await projectMenu(project, env);
    // 项目菜单返回后，重新进入项目选择循环
    await startTui(options);
  } catch (err) {
    if (err?.message && /cancelled|prompt was canceled/i.test(err.message)) {
      return;
    }
    console.error(chalk.red(`错误：${err?.message || err}`));
    process.exit(1);
  }
}

async function projectMenu(project, env) {
  const latest = getLatestSession(project);
  const choices = [
    { name: `继续最新会话: ${truncate(latest.title, 40)}`, value: 'continue-latest' },
    { name: '查看该项目的历史会话', value: 'history' },
    { name: '为此项目新建会话', value: 'new' },
    { name: '清理/归档旧会话', value: 'cleanup' },
    { name: '返回', value: 'back' },
  ];

  while (true) {
    const action = await select({ message: `${project.name} — 选择操作：`, choices });

    switch (action) {
      case 'continue-latest':
        await continueSession(latest);
        break;
      case 'history':
        await historyMenu(project);
        break;
      case 'new':
        await createSession(project.path, project.name);
        break;
      case 'cleanup':
        await cleanupMenu(project, env);
        break;
      case 'back':
      default:
        return;
    }
  }
}

async function historyMenu(project) {
  const choices = project.sessions.map(s => ({
    name: `${truncate(s.title, 40)}  ${chalk.gray(formatTime(s.updatedAt))}`,
    value: s.id,
    description: (s.lastPrompt || '').slice(0, 80),
  }));
  choices.push({ name: '返回', value: 'back' });

  const sid = await select({ message: '选择要继续的历史会话：', choices, pageSize: 15 });
  if (sid === 'back') return;
  const session = project.sessions.find(s => s.id === sid);
  await continueSession({ ...session, projectName: project.name });
}

async function cleanupMenu(project, env) {
  const { checkbox } = await import('@inquirer/prompts');
  const choices = project.sessions.map(s => ({
    name: `${truncate(s.title, 40)}  ${chalk.gray(formatTime(s.updatedAt))}`,
    value: s.id,
    checked: false,
  }));

  const ids = await checkbox({ message: '选择要清理的会话（支持多选）：', choices });
  if (ids.length === 0) return;

  const mode = await select({
    message: '如何处理选中的会话？',
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
  if (newProject && newProject.sessions.length > 0) {
    await projectMenu(newProject, env);
  } else {
    console.log(chalk.yellow('该项目已无会话，返回主界面。'));
    return;
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
