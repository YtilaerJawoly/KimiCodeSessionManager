# Kimi Code Session Manager

A Node.js CLI/TUI tool for managing and quickly resuming Kimi Code sessions. It groups sessions by project, lets you resume the latest session, bulk clean up or archive old sessions, switch between Chinese and English, and update Kimi Code / ksm itself.

---

## Features

- **Project-based session grouping**: Automatically scans `~/.kimi-code/sessions` and groups sessions that share the same working directory.
- **One-click resume**: “Continue latest session” is highlighted by default after entering a project.
- **Browse and search history**: View all historical sessions within a project, with fuzzy search by project name or path.
- **Create new sessions**: Quickly start a new Kimi Code session for a selected project.
- **Bulk cleanup and archiving**: Select multiple old sessions and delete them to free space, or archive them to `~/.kimi-code/session-manager-archive`.
- **Single-instance guard**: Uses `~/.kimi-code/ksm.lock` to prevent multiple ksm instances from running at the same time.
- **Chinese / English UI**: A “Language” option in the main menu takes effect immediately and persists to config.
- **Update checks**: Integrated update entry in the main menu for updating ksm or Kimi Code.
- **Quick settings**: One-click creation of a desktop shortcut for `start.exe`.

---

## Installation

### Global install

```bash
npm install -g .
```

For local development you can also use `npm link`:

```bash
npm link
```

### Quick start on Windows

Double-click `start.exe`, or run in PowerShell:

```powershell
./start.ps1
```

---

## Usage

Once installed in PATH, run in your terminal:

```bash
ksm
# or specify a custom Kimi home directory
ksm --home /path/to/.kimi-code
```

After launch you enter the interactive TUI:

1. **Continue recent session**: Search and select a project to resume its latest Kimi Code session.
2. **Update**: Update ksm or Kimi Code.
3. **Language**: Switch between 中文 and English.
4. **View history messages**: See version update hints detected at startup.
5. **Quick settings**: Create a desktop shortcut.
6. **Exit**: Close ksm.

---

## Directory structure

```
.
├── bin/ksm.js          CLI entry
├── src/
│   ├── actions.js      Session continue / create actions
│   ├── cleanup.js      Session delete and archive
│   ├── config.js       Config and single-instance lock
│   ├── i18n.js         Chinese / English internationalization
│   ├── loader.js       Session scanning and loading
│   ├── shortcut.js     Desktop shortcut creation
│   ├── store.js        Project grouping and queries
│   ├── tui.js          Interactive TUI
│   └── updater.js      Update logic
├── tests/              Unit tests
├── start.ps1           Windows PowerShell launcher
└── start.exe           Windows executable launcher
```

---

## Development

Local development and debugging:

```bash
npm link
ksm
```

Run tests:

```bash
npm test
```

---

## Dependencies

- Node.js >= 20
- `@inquirer/prompts`
- `chalk`
- `commander`
- `fuse.js`

---

## Version

Current version: `v1.0.0`

---

## License

MIT
