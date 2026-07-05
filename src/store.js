/**
 * 会话存储与查询模块
 *
 * 职责：
 *   1. 将平铺的 Session 列表按项目分组、排序。
 *   2. 提供项目的最新会话、按 ID 查找会话、按路径查找项目等查询接口。
 *
 * 设计原则：
 *   - 纯数据转换，无 I/O，便于单元测试。
 *   - 排序规则统一：updatedAt 降序，时间相同用 id 作为稳定 tie-breaker。
 *   - 无效时间统一视为最早，保证有效会话始终排在前面。
 */

/**
 * 安全解析 ISO 时间为时间戳，无效时返回 -Infinity。
 */
function dateOrMin(iso) {
  const time = new Date(iso).getTime();
  return Number.isFinite(time) ? time : -Infinity;
}

/**
 * 比较两个 ISO 时间。
 * 按时间降序排列；时间相同则按 tie-breaker id 字典序升序排列。
 */
function compareDate(aIso, bIso, tieA, tieB) {
  const a = dateOrMin(aIso);
  const b = dateOrMin(bIso);
  if (a !== b) return b - a;
  return tieA.localeCompare(tieB);
}

/**
 * 将 Session 数组分组为 Project 数组。
 *
 * 每个 Project 包含：
 *   - path: 项目路径
 *   - name: 项目名称
 *   - sessions: 按 updatedAt 降序排列的会话数组
 *   - lastUpdated: 最新会话时间
 *   - sessionCount: 会话数量
 *
 * 返回的 Project 数组按 lastUpdated 降序排列。
 */
export function buildProjects(sessions) {
  const map = new Map();
  for (const s of sessions) {
    if (!map.has(s.projectPath)) {
      map.set(s.projectPath, {
        path: s.projectPath,
        name: s.projectName,
        sessions: [],
      });
    }
    map.get(s.projectPath).sessions.push(s);
  }

  const projects = [];
  for (const p of map.values()) {
    p.sessions.sort((a, b) =>
      compareDate(a.updatedAt, b.updatedAt, a.id, b.id)
    );
    p.lastUpdated = p.sessions[0].updatedAt;
    p.sessionCount = p.sessions.length;
    projects.push(p);
  }

  return projects.sort((a, b) =>
    compareDate(a.lastUpdated, b.lastUpdated, a.path, b.path)
  );
}

/**
 * 返回项目的最新会话。
 */
export function getLatestSession(project) {
  return project.sessions[0];
}

/**
 * 在多个项目中按会话 ID 查找会话。
 */
export function findSessionById(projects, id) {
  for (const p of projects) {
    const s = p.sessions.find(x => x.id === id);
    if (s) return s;
  }
  return null;
}

/**
 * 按项目路径查找项目。
 */
export function findProjectByPath(projects, path) {
  return projects.find(p => p.path === path) || null;
}
