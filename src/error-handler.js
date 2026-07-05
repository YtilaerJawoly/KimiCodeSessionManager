import process from 'node:process';

/**
 * 全局错误处理模块
 *
 * 职责：
 *   1. 提供 registerGlobalHandlers() 注册 uncaughtException / unhandledRejection 兜底。
 *   2. 提供 handleFatalError(err) 统一输出错误、按需打印堆栈、Windows 交互环境下暂停窗口。
 *
 * 设计原则：
 *   - 与 CLI 入口解耦，便于单元测试和复用。
 *   - CI 环境下不暂停，避免阻塞自动化流程。
 *   - DEBUG 环境才打印堆栈，普通用户只看到友好错误信息。
 */

function isDebugMode() {
  return !!process.env.DEBUG;
}

function isCiEnvironment() {
  return !!process.env.CI || !!process.env.TF_BUILD || !!process.env.GITHUB_ACTIONS;
}

function isInteractiveTerminal() {
  return process.stdin.isTTY === true && !isCiEnvironment();
}

/**
 * 注册进程级异常兜底钩子。
 * 确保未捕获的同步/异步异常都能被 handleFatalError 处理，不会导致窗口默默关闭。
 */
export function registerGlobalHandlers() {
  process.on('uncaughtException', async (err) => {
    console.error('Uncaught exception:', err?.message ?? err);
    await handleFatalError(err);
  });

  process.on('unhandledRejection', async (reason) => {
    const err = reason instanceof Error ? reason : new Error(String(reason));
    console.error('Unhandled rejection:', err.message);
    await handleFatalError(err);
  });
}

/**
 * 统一致命错误处理。
 *
 * @param {Error|unknown} err
 *
 * 行为：
 *   - 打印错误消息。
 *   - DEBUG 模式下打印堆栈。
 *   - Windows 交互终端下暂停等待用户按键，防止窗口闪退。
 *   - 最终 process.exit(1)。
 */
export async function handleFatalError(err) {
  const message = err?.message ?? String(err) ?? 'Unknown error';
  console.error(message);

  if (isDebugMode() && err?.stack) {
    console.error(err.stack);
  }

  if (process.platform === 'win32' && isInteractiveTerminal()) {
    console.error('\n按 Enter 键退出...');
    try {
      process.stdin.setRawMode(false);
    } catch {
      // 如果当前不在 raw mode，setRawMode(false) 会抛错，忽略即可。
    }
    process.stdin.resume();
    await new Promise(resolve => process.stdin.once('data', resolve));
  }

  process.exit(1);
}
