/** Illustrated empty state when the skills catalog has zero entries (scope: All). */
export function SkillsEmptyState() {
  return (
    <div className="skill-settings-empty-state">
      <div className="skill-settings-empty-icon" aria-hidden>
        <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M8 14h32v26H8z" />
          <path d="M8 14l4-6h24l4 6" />
          <path d="M20 22h8M20 26h8" strokeLinecap="round" />
        </svg>
      </div>
      <p className="skill-settings-empty-title">No skills yet</p>
      <p className="skill-settings-empty-hint">
        Add SKILL.md files under <code>~/.excelor/skills/</code> or your workspace <code>.excelor/skills/</code>, then refresh.
      </p>
    </div>
  );
}
