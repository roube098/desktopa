import type { FC, RefObject } from "react";
import type { Skill } from "../types/skills";

export interface SkillMentionPanelProps {
  skills: Skill[];
  activeIndex: number;
  loading: boolean;
  onSelect: (skill: Skill) => void;
  listRef?: RefObject<HTMLDivElement | null>;
}

export const SkillMentionPanel: FC<SkillMentionPanelProps> = ({
  skills,
  activeIndex,
  loading,
  onSelect,
  listRef,
}) => {
  return (
    <div className="aui-composer-file-mention-panel" role="listbox" aria-label="Skills">
      <div className="aui-composer-file-mention-header">
        <span className="aui-composer-file-mention-title">Skills</span>
        <span className="aui-composer-file-mention-hint">↑↓ Enter · Esc</span>
      </div>
      <div className="aui-composer-file-mention-list" ref={listRef}>
        {loading && (
          <div className="aui-composer-file-mention-empty" role="status">
            Loading skills…
          </div>
        )}
        {!loading && skills.length === 0 && (
          <div className="aui-composer-file-mention-empty">No matching skills</div>
        )}
        {!loading &&
          skills.map((skill, index) => (
            <button
              key={skill.id}
              type="button"
              role="option"
              aria-selected={index === activeIndex}
              className={`aui-composer-file-mention-item${index === activeIndex ? " is-active" : ""}`}
              onMouseDown={(e) => {
                e.preventDefault();
                onSelect(skill);
              }}
            >
              <span className="aui-composer-file-mention-name">${skill.name}</span>
              <span className="aui-composer-file-mention-meta">{skill.description.slice(0, 80)}</span>
            </button>
          ))}
      </div>
    </div>
  );
};
