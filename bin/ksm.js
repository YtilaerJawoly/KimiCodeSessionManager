#!/usr/bin/env node
import { program } from 'commander';
import { startTui } from '../src/tui.js';

program
  .name('ksm')
  .description('Kimi Code 会话管理器')
  .version('0.1.0')
  .option('-H, --home <path>', 'Kimi 主目录路径')
  .action(async (options) => {
    await startTui({ home: options.home });
  });

program.parse();
