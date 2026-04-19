import type { Skill, SkillScope } from '../types/skills';
import {
  countEnvVarDeps,
  listScriptTransports,
  normalizeScope,
} from '../lib/skill-view-helpers';

const SCOPE_LABEL: Record<SkillScope, string> = {
  user: 'User',
  repo: 'Repo',
  system: 'System',
  admin: 'Admin',
};

const SCOPE_CLASS: Record<SkillScope, string> = {
  user: 'skill-scope-chip skill-scope-chip--user',
  repo: 'skill-scope-chip skill-scope-chip--repo',
  system: 'skill-scope-chip skill-scope-chip--system',
  admin: 'skill-scope-chip skill-scope-chip--admin',
};

/** Scope pill; reused in skill list rows and detail hero. */
export function SkillScopeChip({ skill }: { skill: Skill }) {
  const scope = normalizeScope(skill);
  return (
    <span className={SCOPE_CLASS[scope]} title={`Scope: ${scope}`}>
      {SCOPE_LABEL[scope]}
    </span>
  );
}

export function SkillListRowMeta({ skill }: { skill: Skill }) {
  const transports = listScriptTransports(skill);
  const envCount = countEnvVarDeps(skill);

  return (
    <span className="skill-settings-row-meta">
      <span className="skill-settings-row-command font-mono text-[11px] text-[color:var(--text-muted)]">
        {skill.command || '—'}
      </span>
      <span className="skill-settings-row-badges">
        <SkillScopeChip skill={skill} />
        {transports.map((tr) => (
          <span
            key={tr}
            className={`skill-transport-badge ${String(tr).toLowerCase() === 'script' ? 'is-script' : 'is-shell'}`}
          >
            {tr}
          </span>
        ))}
        {envCount > 0 ? (
          <span className="skill-envvar-badge" title="Env-var dependencies">
            {envCount} env
          </span>
        ) : null}
        {skill.isVerified ? (
          <span className="skill-verified-check" title="Verified">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
            </svg>
          </span>
        ) : null}
      </span>
    </span>
  );
}
