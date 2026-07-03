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
    p.sessions.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
    p.lastUpdated = p.sessions[0].updatedAt;
    p.sessionCount = p.sessions.length;
    projects.push(p);
  }

  return projects.sort((a, b) => new Date(b.lastUpdated) - new Date(a.lastUpdated));
}

export function getLatestSession(project) {
  return project.sessions[0];
}

export function findSessionById(projects, id) {
  for (const p of projects) {
    const s = p.sessions.find(x => x.id === id);
    if (s) return s;
  }
  return null;
}

export function findProjectByPath(projects, path) {
  return projects.find(p => p.path === path) || null;
}
