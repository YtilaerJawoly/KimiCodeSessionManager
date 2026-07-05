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
      if (process.platform === 'win32' && process.stdin.isTTY) {
        console.error('\n按 Enter 键退出...');
        process.stdin.setRawMode(false);
        process.stdin.resume();
        await new Promise(resolve => process.stdin.once('data', resolve));
      }
      process.exit(1);
    }
  });

program.parse();
