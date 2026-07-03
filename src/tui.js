import { select, search } from '@inquirer/prompts';
import chalk from 'chalk';
import Fuse from 'fuse.js';
import { loadSessions } from './loader.js';
import { buildProjects, getLatestSession, findProjectByPath } from './store.js';
import { continueSession, createSession } from './actions.js';
import { deleteSession, archiveSession } from './cleanup.js';

const FUSE_OPTIONS = { keys: ['name', 'path'], threshold: 0.4 };

export async function startTui(options = {}) {
  try {
    const env = options.home ? { ...process.env, KIMI_HOME: options.home } : process.env;
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
        return results.map(p => ({
          name: `${truncate(p.name, 20)}  ${chalk.gray(truncate(p.path, 40))}  ${chalk.dim(`(${p.sessionCount} 个会话, 最近 ${formatTime(p.lastUpdated)})`)}`,
          value: p.path,
          description: `最新: ${truncate(getLatestSession(p).title, 60)}`,
        }));
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
        await createSession(project.path);
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
  if (session) await continueSession(session);
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
