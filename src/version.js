/**
 * 语义化版本（SemVer）工具模块
 *
 * 职责：
 *   1. 解析形如 `v1.2.3` 或 `1.2.3` 的版本字符串。
 *   2. 比较两个版本的优先级。
 *   3. 判断版本是否为稳定版（无 prerelease 后缀）。
 *
 * 设计原则：
 *   - 纯函数，无 I/O，便于单元测试。
 *   - 只支持 SemVer 2.0.0 的核心规则（MAJOR.MINOR.PATCH[-prerelease]），
 *     忽略 build metadata（+xxx）。
 */

/**
 * 解析 SemVer 字符串。
 *
 * @param {string} input 例如 `v1.2.3` 或 `1.2.3-beta.1`
 * @returns {{major: number, minor: number, patch: number, prerelease: string}|null}
 */
export function parseSemver(input) {
  const text = String(input).trim();
  // 支持可选的 v 前缀
  const match = text.match(/^v?(\d+)\.(\d+)\.(\d+)(?:-([a-zA-Z0-9.]+))?$/);
  if (!match) return null;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4] || '',
  };
}

/**
 * 判断是否为稳定版（无 prerelease）。
 */
export function isStable(version) {
  if (typeof version === 'string') {
    const parsed = parseSemver(version);
    return parsed !== null && !parsed.prerelease;
  }
  return version && !version.prerelease;
}

/**
 * 比较两个 SemVer 版本。
 *
 * @returns {number} -1: a < b, 0: a === b, 1: a > b
 */
export function compareSemver(a, b) {
  const pa = typeof a === 'string' ? parseSemver(a) : a;
  const pb = typeof b === 'string' ? parseSemver(b) : b;
  if (!pa || !pb) return 0;

  if (pa.major !== pb.major) return pa.major > pb.major ? 1 : -1;
  if (pa.minor !== pb.minor) return pa.minor > pb.minor ? 1 : -1;
  if (pa.patch !== pb.patch) return pa.patch > pb.patch ? 1 : -1;

  // 按 SemVer 2.0.0：有 prerelease 的版本优先级低于无 prerelease 的稳定版
  if (pa.prerelease && !pb.prerelease) return -1;
  if (!pa.prerelease && pb.prerelease) return 1;

  // 两者都有 prerelease 时按点号分段比较数字 / 字符串
  const sa = pa.prerelease.split('.');
  const sb = pb.prerelease.split('.');
  const len = Math.max(sa.length, sb.length);
  for (let i = 0; i < len; i++) {
    const ea = sa[i];
    const eb = sb[i];
    if (ea === undefined) return -1;
    if (eb === undefined) return 1;
    const na = Number(ea);
    const nb = Number(eb);
    const bothNumbers = Number.isInteger(na) && Number.isInteger(nb) && !Number.isNaN(na) && !Number.isNaN(nb);
    if (bothNumbers) {
      if (na !== nb) return na > nb ? 1 : -1;
    } else if (ea !== eb) {
      return ea > eb ? 1 : -1;
    }
  }

  return 0;
}

/**
 * 判断 a 是否严格大于 b。
 */
export function isNewer(a, b) {
  return compareSemver(a, b) > 0;
}

/**
 * 从一组候选 tag 名称中找出最新的稳定版。
 *
 * @param {string[]} tags
 * @returns {string|null}
 */
export function findLatestStable(tags) {
  let latest = null;
  for (const tag of tags) {
    if (!isStable(tag)) continue;
    if (!latest || isNewer(tag, latest)) {
      latest = tag;
    }
  }
  return latest;
}
