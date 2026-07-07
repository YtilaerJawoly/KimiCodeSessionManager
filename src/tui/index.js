import process from 'node:process';
import { select } from '@inquirer/prompts';
import chalk from 'chalk';
import {
  acquireInstanceLock,
  releaseInstanceLock,
  loadKsmConfig,
} from '../config.js';
import { setLocale, t } from '../i18n.js';
import {
  checkKimiCodeVersion,
  checkKsmVersion,
  updateKimiCode,
} from '../updater.js';
import { printWelcome, getKimiVersion } from './welcome.js';
import { clearLastLine, formatTime, ROOT_DIR, QUIET_SELECT_THEME } from './helpers.js';
import {
  recentSessionsMenu,
  updateMenu,
  languageMenu,
  messagesMenu,
  shortcutSettingsMenu,
} from './menus.js';

/**
 * TUI 入口与主菜单模块
 *
 * 职责：
 *   1. 启动时获取单实例锁、加载用户配置、设置语言。
 *   2. 绘制欢迎界面并检查 Kimi Code 安装状态。
 *   3. 进入主循环，根据用户选择分发到各子菜单。
 *
 * 设计原则：
 *   - 仅保留编排逻辑，具体菜单实现下沉到 menus.js。
 *   - 版本检查异步进行，避免阻塞欢迎界面首次显示。
 *   - 所有未捕获错误统一抛出，由 bin/ksm.js 注册的全局处理器接管。
 */

/**
 * 启动 TUI。
 *
 * @param {Object} options
 * @param {string} [options.home] 可选的 KIMI_HOME 覆盖路径
 */
export async function startTui(options = {}) {
  let env;
  let lockAcquired = false;

  try {
    env = options.home ? { ...process.env, KIMI_HOME: options.home } : process.env;

    // 单实例锁：防止同时运行多个 ksm 进程造成竞态
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

    // 加载持久化配置（目前仅语言）
    const config = loadKsmConfig(env);
    if (config.locale) setLocale(config.locale);

    const kimiVersion = await getKimiVersion(env);
    printWelcome(kimiVersion);

    // 并行检查 Kimi Code 与 ksm 更新，不阻塞菜单首次渲染
    const versionPromise = Promise.all([
      checkKimiCodeVersion(env),
      checkKsmVersion(ROOT_DIR),
    ]);

    // 如果 Kimi Code 未安装，先询问是否安装
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

/**
 * 根据版本检查结果构建顶部通知消息列表。
 */
function buildMessages(kimiCodeStatus, ksmStatus) {
  const time = formatTime(new Date().toISOString());
  const list = [];
  if (!kimiCodeStatus.installed) {
    list.push({ time, level: 'warning', text: t('install.title') });
  } else if (kimiCodeStatus.hasUpdate) {
    list.push({ time, level: 'warning', text: t('mainMenu.kimiCodeUpdate', { version: kimiCodeStatus.latest }) });
  }
  if (ksmStatus.hasUpdate) {
    list.push({ time, level: 'warning', text: t('mainMenu.ksmUpdate', { version: ksmStatus.latest }) });
  }
  return list;
}

/**
 * 主菜单循环。
 */
async function mainMenu(env, options = {}) {
  const { versionPromise, initialCodeStatus = {} } = options;
  let messages = [];
  let checked = false;
  let pendingPromise = versionPromise || null;

  if (!pendingPromise) {
    messages = buildMessages(initialCodeStatus, {});
  }

  while (true) {
    const kimiVersion = await getKimiVersion(env);
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

    // 第一次进入主菜单时，等待后台版本检查完成并刷新消息区
    if (pendingPromise && !checked) {
      checked = true;
      pendingPromise
        .then(([kimiCodeStatus, ksmStatus]) => {
          messages = buildMessages(kimiCodeStatus, ksmStatus);
          try { prompt.cancel(); } catch {}
        })
        .catch(() => {
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
