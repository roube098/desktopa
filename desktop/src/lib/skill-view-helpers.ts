import type { Skill, SkillScope, SkillSource } from '../types/skills';

const SCRIPT_TRANSPORTS = new Set(['shell', 'script']);

/** Valid hex color for brand accent bar (#rgb or #rrggbb). */
export function isValidBrandHex(color: string | undefined): color is string {
  if (!color || typeof color !== 'string') return false;
  const t = color.trim();
  return /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(t);
}

export function hasBrandColor(skill: Skill): skill is Skill & { interface: { brandColor: string } } {
  const c = skill.interface?.brandColor;
  return isValidBrandHex(c);
}

/**
 * Prefer explicit scope; else map legacy source: official→system, community→user, custom→user.
 */
export function normalizeScope(skill: Skill): SkillScope {
  if (skill.scope) return skill.scope;
  const src = skill.source as SkillSource;
  if (src === 'official') return 'system';
  if (src === 'community') return 'user';
  return 'user';
}

export function listScriptTransports(skill: Skill): string[] {
  const out = new Set<string>();
  for (const t of skill.dependencies?.tools ?? []) {
    const tr = String(t.transport || '').toLowerCase().trim();
    if (SCRIPT_TRANSPORTS.has(tr)) {
      out.add(String(t.transport || tr));
    }
  }
  return [...out];
}

export function countEnvVarDeps(skill: Skill): number {
  let n = 0;
  for (const t of skill.dependencies?.tools ?? []) {
    if (String(t.type || '').toLowerCase() === 'env-var') n += 1;
  }
  return n;
}

export function formatSkillDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}
