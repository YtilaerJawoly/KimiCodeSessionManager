#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { program } from 'commander';
import { startTui } from '../src/tui.js';

const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

program
  .name('ksm')
  .description('Kimi Code 会话管理器')
  .version(version)
  .option('-H, --home <path>', 'Kimi 主目录路径')
  .action(async (options) => {
    try {
      await startTui({ home: options.home });
    } catch (err) {
      console.error(err?.message ?? err);
      if (err?.stack) console.error(err.stack);
      process.exit(1);
    }
  });

program.parse();
