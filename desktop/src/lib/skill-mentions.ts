import type { Skill } from "../types/skills";

function isWhitespaceBoundary(value: string | undefined): boolean {
  return !value || /[\s()[\]{}<>,;:!?'"`]/.test(value);
}

export type SkillMentionMatch = {
  type: "skill";
  start: number;
  end: number;
  query: string;
  token: string;
};

/**
 * Active `$skillName` token at caret (same line / token scan as workspace @-mentions).
 */
export function getActiveSkillMention(
  text: string,
  caretStart: number,
  caretEnd: number,
): SkillMentionMatch | null {
  if (caretStart !== caretEnd) return null;
  if (!text) return null;

  const safeStart = Math.max(0, Math.min(caretStart, text.length));
  const safeEnd = Math.max(0, Math.min(caretEnd, text.length));

  let tokenStart = safeStart;
  while (tokenStart > 0 && !isWhitespaceBoundary(text[tokenStart - 1])) {
    tokenStart -= 1;
  }

  let tokenEnd = safeEnd;
  while (tokenEnd < text.length && !isWhitespaceBoundary(text[tokenEnd])) {
    tokenEnd += 1;
  }

  const token = text.slice(tokenStart, tokenEnd);
  if (!token.startsWith("$")) return null;

  const query = token.slice(1);
  if (!/^[a-zA-Z0-9_-]*$/.test(query)) return null;

  return {
    type: "skill",
    start: tokenStart,
    end: tokenEnd,
    query,
    token,
  };
}

const MAX_RESULTS = 50;

export function rankSkills(skills: Skill[], query: string): Skill[] {
  const enabled = skills.filter((s) => s.isEnabled !== false && !s.isHidden);
  const q = query.trim().toLowerCase();
  if (!q) {
    return enabled.slice(0, MAX_RESULTS);
  }

  const ranked = enabled
    .map((skill) => {
      const name = skill.name.toLowerCase();
      const desc = skill.description.toLowerCase();
      let rank: number | null = null;
      if (name === q) rank = 0;
      else if (name.startsWith(q)) rank = 1;
      else if (name.includes(q)) rank = 2;
      else if (desc.includes(q)) rank = 3;
      return rank === null ? null : { skill, rank };
    })
    .filter((x): x is { skill: Skill; rank: number } => x !== null)
    .sort((a, b) => a.rank - b.rank || a.skill.name.localeCompare(b.skill.name));

  return ranked.slice(0, MAX_RESULTS).map((x) => x.skill);
}

export function formatSkillLink(skill: Skill): string {
  const p = skill.filePath.replace(/\\/g, "/");
  return `[$${skill.name}](${p})`;
}
