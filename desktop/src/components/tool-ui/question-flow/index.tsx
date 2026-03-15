import { type FC, useState, useCallback, useMemo } from "react";
import type {
    QuestionFlowOption,
    QuestionFlowDefinition,
    QuestionFlowChoice,
} from "./schema";

/* ═══════════════════════════════════════════════════════════
   QuestionFlow — Multi-step decision wizard
   ═══════════════════════════════════════════════════════════ */

/* ── Props ─────────────────────────────────────────────── */
interface ProgressiveProps {
    id: string;
    step: number;
    title: string;
    description?: string;
    options: QuestionFlowOption[];
    selectionMode?: "single" | "multi";
    defaultValue?: string[];
    onSelect?: (optionIds: string[]) => void | Promise<void>;
    onBack?: () => void;
}

interface UpfrontProps {
    id: string;
    steps: QuestionFlowDefinition[];
    onStepChange?: (stepId: string) => void;
    onComplete?: (answers: Record<string, string[]>) => void | Promise<void>;
}

interface ReceiptProps {
    id: string;
    choice: QuestionFlowChoice;
}

type QuestionFlowProps = ProgressiveProps | UpfrontProps | ReceiptProps;

/* ── Type Guards ───────────────────────────────────────── */
function isReceipt(p: QuestionFlowProps): p is ReceiptProps {
    return "choice" in p && !!p.choice;
}

function isUpfront(p: QuestionFlowProps): p is UpfrontProps {
    return "steps" in p && Array.isArray(p.steps);
}

/* ── Main Component ────────────────────────────────────── */
export const QuestionFlow: FC<QuestionFlowProps> = (props) => {
    if (isReceipt(props)) return <ReceiptView {...props} />;
    if (isUpfront(props)) return <UpfrontView {...props} />;
    return <ProgressiveView {...props} />;
};

/* ── Receipt View ──────────────────────────────────────── */
const ReceiptView: FC<ReceiptProps> = ({ choice }) => (
    <div className="qf-root qf-receipt">
        <div className="qf-receipt-header">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                <polyline points="22 4 12 14.01 9 11.01" />
            </svg>
            <span>{choice.title ?? "Complete"}</span>
        </div>
        <div className="qf-receipt-summary">
            {choice.summary.map((item, i) => (
                <div key={i} className="qf-receipt-row">
                    <span className="qf-receipt-label">{item.label}</span>
                    <span className="qf-receipt-value">{item.value}</span>
                </div>
            ))}
        </div>
    </div>
);

/* ── Upfront View ──────────────────────────────────────── */
const UpfrontView: FC<UpfrontProps> = ({ id, steps, onStepChange, onComplete }) => {
    const [currentIdx, setCurrentIdx] = useState(0);
    const [answers, setAnswers] = useState<Record<string, string[]>>({});
    const [selected, setSelected] = useState<Set<string>>(new Set());

    const step = steps[currentIdx];
    if (!step) return null;

    const mode = step.selectionMode ?? "single";

    const handleToggle = (optId: string) => {
        setSelected((prev) => {
            const next = new Set(prev);
            if (mode === "single") {
                next.clear();
                next.add(optId);
            } else {
                if (next.has(optId)) next.delete(optId);
                else next.add(optId);
            }
            return next;
        });
    };

    const handleNext = () => {
        if (selected.size === 0) return;
        const newAnswers = { ...answers, [step.id]: Array.from(selected) };
        setAnswers(newAnswers);
        setSelected(new Set());

        if (currentIdx < steps.length - 1) {
            const nextIdx = currentIdx + 1;
            setCurrentIdx(nextIdx);
            onStepChange?.(steps[nextIdx].id);
        } else {
            onComplete?.(newAnswers);
        }
    };

    const handleBack = () => {
        if (currentIdx === 0) return;
        const prevIdx = currentIdx - 1;
        setCurrentIdx(prevIdx);
        setSelected(new Set(answers[steps[prevIdx].id] ?? []));
        onStepChange?.(steps[prevIdx].id);
    };

    return (
        <StepView
            step={currentIdx + 1}
            totalSteps={steps.length}
            title={step.title}
            description={step.description}
            options={step.options}
            selectionMode={mode}
            selected={selected}
            onToggle={handleToggle}
            onNext={handleNext}
            onBack={currentIdx > 0 ? handleBack : undefined}
            isLast={currentIdx === steps.length - 1}
        />
    );
};

/* ── Progressive View ──────────────────────────────────── */
const ProgressiveView: FC<ProgressiveProps> = ({
    step,
    title,
    description,
    options,
    selectionMode = "single",
    defaultValue,
    onSelect,
    onBack,
}) => {
    const [selected, setSelected] = useState<Set<string>>(
        new Set(defaultValue ?? []),
    );

    const handleToggle = (optId: string) => {
        setSelected((prev) => {
            const next = new Set(prev);
            if (selectionMode === "single") {
                next.clear();
                next.add(optId);
            } else {
                if (next.has(optId)) next.delete(optId);
                else next.add(optId);
            }
            return next;
        });
    };

    const handleNext = () => {
        if (selected.size === 0) return;
        onSelect?.(Array.from(selected));
    };

    return (
        <StepView
            step={step}
            title={title}
            description={description}
            options={options}
            selectionMode={selectionMode}
            selected={selected}
            onToggle={handleToggle}
            onNext={handleNext}
            onBack={onBack}
        />
    );
};

/* ── Shared Step View ──────────────────────────────────── */
interface StepViewProps {
    step: number;
    totalSteps?: number;
    title: string;
    description?: string;
    options: QuestionFlowOption[];
    selectionMode: "single" | "multi";
    selected: Set<string>;
    onToggle: (id: string) => void;
    onNext: () => void;
    onBack?: () => void;
    isLast?: boolean;
}

const StepView: FC<StepViewProps> = ({
    step,
    totalSteps,
    title,
    description,
    options,
    selectionMode,
    selected,
    onToggle,
    onNext,
    onBack,
    isLast,
}) => (
    <div className="qf-root">
        {/* Progress */}
        <div className="qf-progress">
            <span className="qf-step-badge">Step {step}{totalSteps ? ` of ${totalSteps}` : ""}</span>
            {totalSteps && (
                <div className="qf-progress-track">
                    <div
                        className="qf-progress-fill"
                        style={{ width: `${(step / totalSteps) * 100}%` }}
                    />
                </div>
            )}
        </div>

        {/* Header */}
        <div className="qf-header">
            <h3 className="qf-title">{title}</h3>
            {description && <p className="qf-description">{description}</p>}
            {selectionMode === "multi" && (
                <span className="qf-multi-hint">Select one or more</span>
            )}
        </div>

        {/* Options */}
        <div className="qf-options">
            {options.map((opt) => (
                <button
                    key={opt.id}
                    className={`qf-option ${selected.has(opt.id) ? "selected" : ""}`}
                    onClick={() => !opt.disabled && onToggle(opt.id)}
                    disabled={opt.disabled}
                    type="button"
                >
                    <div className="qf-option-check">
                        {selectionMode === "multi" ? (
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                {selected.has(opt.id) ? (
                                    <>
                                        <rect x="3" y="3" width="18" height="18" rx="4" fill="currentColor" opacity="0.15" />
                                        <rect x="3" y="3" width="18" height="18" rx="4" />
                                        <polyline points="9 12 11 14 15 10" />
                                    </>
                                ) : (
                                    <rect x="3" y="3" width="18" height="18" rx="4" />
                                )}
                            </svg>
                        ) : (
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <circle cx="12" cy="12" r="9" />
                                {selected.has(opt.id) && (
                                    <circle cx="12" cy="12" r="5" fill="currentColor" />
                                )}
                            </svg>
                        )}
                    </div>
                    <div className="qf-option-content">
                        <span className="qf-option-label">{opt.label}</span>
                        {opt.description && (
                            <span className="qf-option-desc">{opt.description}</span>
                        )}
                    </div>
                </button>
            ))}
        </div>

        {/* Navigation */}
        <div className="qf-nav">
            {onBack && (
                <button className="qf-nav-btn qf-nav-back" onClick={onBack} type="button">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="15 18 9 12 15 6" />
                    </svg>
                    Back
                </button>
            )}
            <div style={{ flex: 1 }} />
            <button
                className="qf-nav-btn qf-nav-next"
                onClick={onNext}
                disabled={selected.size === 0}
                type="button"
            >
                {isLast ? "Finish" : "Next"}
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="9 18 15 12 9 6" />
                </svg>
            </button>
        </div>
    </div>
);
