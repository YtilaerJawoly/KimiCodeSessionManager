/**
 * 国际化模块
 *
 * 职责：
 *   1. 管理当前语言（zh-CN / en）。
 *   2. 提供翻译函数 t(key, placeholders) 并支持占位符替换。
 *   3. 在翻译缺失时按 zh-CN → key 本身回退，保证界面不报错。
 *
 * 设计原则：
 *   - 所有用户可见文案集中在此，便于多语言维护。
 *   - setLocale 对未知语言静默忽略，保持当前语言稳定。
 */

const locales = {
  'zh-CN': {
    'welcome.title': 'Kimi Code Session Manager {version}',
    'welcome.subtitle': 'Kimi Code: {version}',

    'mainMenu.title': '主菜单：',
    'mainMenu.recent': '继续最近会话',
    'mainMenu.update': '更新',
    'mainMenu.language': '语言',
    'mainMenu.messages': '查看历史消息',
    'mainMenu.settings': '快捷设置',
    'mainMenu.exit': '退出',
    'mainMenu.kimiCodeUpdate': 'Kimi Code 有新版本可用: {version}',
    'mainMenu.ksmUpdate': 'ksm 有新版本可用: {version}',

    'updateMenu.title': '更新：',
    'updateMenu.back': '返回上一级',
    'updateMenu.ksm': '更新 ksm',
    'updateMenu.kimiCode': '更新 Kimi Code',
    'updateMenu.ksmSuccess': 'ksm 更新成功：{message}',
    'updateMenu.ksmFailed': 'ksm 更新失败：{message}',
    'updateMenu.ksmManual': '请手动运行：git pull',
    'updateMenu.kimiCodeInstalling': '正在安装 Kimi Code，请稍候...',
    'updateMenu.kimiCodeSuccess': 'Kimi Code 安装成功。',
    'updateMenu.kimiCodeFailed': 'Kimi Code 安装失败：{message}',
    'updateMenu.kimiCodeRestart': '安装完成，请重新打开终端以使用新版本。',
    'updateMenu.kimiCodeManual': '请手动运行：irm https://code.kimi.com/kimi-code/install.ps1 | iex',

    'languageMenu.title': '语言：',
    'languageMenu.back': '返回上一级',
    'languageMenu.zhCN': '中文',
    'languageMenu.en': 'English',

    'settingsMenu.title': '快捷设置：',
    'settingsMenu.back': '返回上一级',
    'settingsMenu.desktop': '在桌面添加 start.exe 快捷方式',
    'settingsMenu.desktopSuccess': '已创建桌面快捷方式：{message}',
    'settingsMenu.desktopFailed': '创建失败：{message}',

    'recentMenu.title': '搜索并选择一个项目继续最新会话：',
    'recentMenu.noProjects': '未找到任何 Kimi 会话。',
    'recentMenu.projectNotFound': '未找到选择的项目。',
    'recentMenu.back': '返回上一级',
    'recentMenu.sessionMeta': '{count} 个会话, 最近 {time}',
    'recentMenu.latest': '最新: {title}',

    'projectMenu.title': '{name} — 选择操作：',
    'projectMenu.back': '返回上一级',
    'projectMenu.continueLatest': '继续最新会话: {title}',
    'projectMenu.continueLatestEmpty': '继续最新会话（无）',
    'projectMenu.history': '查看该项目的历史会话',
    'projectMenu.new': '为此项目新建会话',
    'projectMenu.cleanup': '清理/归档旧会话',
    'projectMenu.continueStarted': '已继续会话: {title}',
    'projectMenu.newStarted': '已新建 {name} 的会话',

    'historyMenu.title': '选择要继续的历史会话：',
    'historyMenu.back': '返回上一级',

    'cleanupMenu.title': '选择要清理的会话（支持多选）：',
    'cleanupMenu.back': '返回上一级',
    'cleanupMenu.modeTitle': '如何处理选中的会话？',
    'cleanupMenu.delete': '删除（释放磁盘空间）',
    'cleanupMenu.archive': '归档（移动到 archive 目录）',
    'cleanupMenu.cancel': '取消',
    'cleanupMenu.failed': '处理 {title} 失败：{message}',
    'cleanupMenu.result': '已{action} {count} 个会话。',
    'cleanupMenu.deleteAction': '删除',
    'cleanupMenu.archiveAction': '归档',
    'cleanupMenu.noSessions': '该项目已无会话，返回主界面。',

    'messagesMenu.title': '历史消息：',
    'messagesMenu.back': '返回上一级',
    'messagesMenu.empty': '暂无历史消息。',
    'messagesMenu.time': '时间',
    'messagesMenu.level': '级别',
    'select.hint': '↑↓ 导航 • ⏎ 选择',
    'select.hintPager': '↑↓ 导航 • ⏎ 选择 • 翻页',
    'checkbox.hint': '↑↓ 导航 • 空格 选择 • a 全选 • i 反选 • ⏎ 确认',
    'search.hint': '↑↓ 导航 • ⏎ 选择',
    'search.hintPager': '↑↓ 导航 • ⏎ 选择 • 翻页',
    'install.yes': '是',
    'install.no': '否',
    'install.success': 'Kimi Code 安装成功。',
    'install.failed': 'Kimi Code 安装失败：{message}',
    'install.manual': '请手动运行：irm https://code.kimi.com/kimi-code/install.ps1 | iex',

    'error.alreadyRunning': 'Kimi Code Session Manager 已在运行中（PID: {pid}）',
    'error.lockFailed': '无法获取单实例锁：{message}',
    'error.prefix': '错误：{message}',
  },
  en: {
    'welcome.title': 'Kimi Code Session Manager {version}',
    'welcome.subtitle': 'Kimi Code: {version}',

    'mainMenu.title': 'Main Menu:',
    'mainMenu.recent': 'Continue Recent Session',
    'mainMenu.update': 'Update',
    'mainMenu.language': 'Language',
    'mainMenu.messages': 'View History',
    'mainMenu.settings': 'Quick Settings',
    'mainMenu.exit': 'Exit',
    'mainMenu.kimiCodeUpdate': 'Kimi Code update available: {version}',
    'mainMenu.ksmUpdate': 'ksm update available: {version}',

    'updateMenu.title': 'Update:',
    'updateMenu.back': 'Back',
    'updateMenu.ksm': 'Update ksm',
    'updateMenu.kimiCode': 'Update Kimi Code',
    'updateMenu.ksmSuccess': 'ksm updated: {message}',
    'updateMenu.ksmFailed': 'ksm update failed: {message}',
    'updateMenu.ksmManual': 'Please run manually: git pull',
    'updateMenu.kimiCodeInstalling': 'Installing Kimi Code, please wait...',
    'updateMenu.kimiCodeSuccess': 'Kimi Code installed successfully.',
    'updateMenu.kimiCodeFailed': 'Kimi Code installation failed: {message}',
    'updateMenu.kimiCodeRestart': 'Installation complete. Please reopen the terminal to use the new version.',
    'updateMenu.kimiCodeManual': 'Please run manually: irm https://code.kimi.com/kimi-code/install.ps1 | iex',

    'languageMenu.title': 'Language:',
    'languageMenu.back': 'Back',
    'languageMenu.zhCN': '中文',
    'languageMenu.en': 'English',

    'settingsMenu.title': 'Quick Settings:',
    'settingsMenu.back': 'Back',
    'settingsMenu.desktop': 'Create desktop shortcut for start.exe',
    'settingsMenu.desktopSuccess': 'Desktop shortcut created: {message}',
    'settingsMenu.desktopFailed': 'Failed to create shortcut: {message}',

    'recentMenu.title': 'Search and select a project to continue:',
    'recentMenu.noProjects': 'No Kimi sessions found.',
    'recentMenu.projectNotFound': 'Selected project not found.',
    'recentMenu.back': 'Back',
    'recentMenu.sessionMeta': '{count} sessions, latest {time}',
    'recentMenu.latest': 'Latest: {title}',

    'projectMenu.title': '{name} — Select action:',
    'projectMenu.back': 'Back',
    'projectMenu.continueLatest': 'Continue latest session: {title}',
    'projectMenu.continueLatestEmpty': 'Continue latest session (none)',
    'projectMenu.history': 'View project history',
    'projectMenu.new': 'Create new session for this project',
    'projectMenu.cleanup': 'Cleanup / archive old sessions',
    'projectMenu.continueStarted': 'Continuing session: {title}',
    'projectMenu.newStarted': 'New session started for {name}',

    'historyMenu.title': 'Select a historical session to continue:',
    'historyMenu.back': 'Back',

    'cleanupMenu.title': 'Select sessions to clean up (multi-select):',
    'cleanupMenu.back': 'Back',
    'cleanupMenu.modeTitle': 'How to handle selected sessions?',
    'cleanupMenu.delete': 'Delete (free disk space)',
    'cleanupMenu.archive': 'Archive (move to archive folder)',
    'cleanupMenu.cancel': 'Cancel',
    'cleanupMenu.failed': 'Failed to process {title}: {message}',
    'cleanupMenu.result': '{count} sessions {action}.',
    'cleanupMenu.deleteAction': 'deleted',
    'cleanupMenu.archiveAction': 'archived',
    'cleanupMenu.noSessions': 'No sessions left for this project, returning to main menu.',

    'messagesMenu.title': 'History:',
    'messagesMenu.back': 'Back',
    'messagesMenu.empty': 'No history messages.',
    'messagesMenu.time': 'Time',
    'messagesMenu.level': 'Level',
    'select.hint': '↑↓ navigate • ⏎ select',
    'select.hintPager': '↑↓ navigate • ⏎ select • page',
    'checkbox.hint': '↑↓ navigate • space select • a all • i invert • ⏎ submit',
    'search.hint': '↑↓ navigate • ⏎ select',
    'search.hintPager': '↑↓ navigate • ⏎ select • page',
    'install.yes': 'Yes',
    'install.no': 'No',
    'install.success': 'Kimi Code installed successfully.',
    'install.failed': 'Kimi Code installation failed: {message}',
    'install.manual': 'Please run manually: irm https://code.kimi.com/kimi-code/install.ps1 | iex',

    'error.alreadyRunning': 'Kimi Code Session Manager is already running (PID: {pid})',
    'error.lockFailed': 'Unable to acquire instance lock: {message}',
    'error.prefix': 'Error: {message}',
  },
};

let currentLocale = 'zh-CN';

export function setLocale(locale) {
  if (locales[locale]) {
    currentLocale = locale;
  }
}

export function getLocale() {
  return currentLocale;
}

export function t(key, placeholders = {}) {
  const text = locales[currentLocale]?.[key] ?? locales['zh-CN']?.[key] ?? key;
  return text.replace(/\{(\w+)\}/g, (_, name) => String(placeholders[name] ?? ''));
}

export function listLocales() {
  return Object.keys(locales);
}
