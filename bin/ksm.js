#!/usr/bin/env node
/**
 * ksm CLI 入口模块
 *
 * 职责：
 *   1. 解析命令行参数（commander）。
 *   2. 注册全局异常处理器。
 *   3. 启动 TUI（src/tui/index.js 的 startTui）。
 *
 * 注意：
 *   - 本文件保持最小化，不处理业务逻辑、不处理国际化、不处理错误展示。
 *   - 所有错误处理委托给 src/error-handler.js。
 */

import { readFileSync } from 'node:fs';
import { program } from 'commander';
import { startTui } from '../src/tui/index.js';
import { registerGlobalHandlers, handleFatalError } from '../src/error-handler.js';

// 从 package.json 读取元数据，避免硬编码版本与描述。
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

// 注册全局异常钩子，确保未捕获的同步/异步异常不会导致窗口默默关闭。
registerGlobalHandlers();

program
  .name('ksm')
  .description(pkg.description)
  .version(pkg.version)
  .option('-H, --home <path>', 'Kimi home directory')
  .action(async (options) => {
    // 启动 TUI，所有错误由 handleFatalError 统一处理。
    try {
      await startTui({ home: options.home });
    } catch (err) {
      await handleFatalError(err);
    }
  });

program.parse();
