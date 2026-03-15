/* ── Types ──────────────────────────────────────────────── */
export interface QuestionFlowOption {
    id: string;
    label: string;
    description?: string;
    disabled?: boolean;
}

export interface QuestionFlowDefinition {
    id: string;
    title: string;
    description?: string;
    options: QuestionFlowOption[];
    selectionMode?: "single" | "multi";
}

export interface QuestionFlowChoice {
    title?: string;
    summary: { label: string; value: string }[];
}

export interface SerializableQuestionFlow {
    id: string;
    step?: number;
    title?: string;
    description?: string;
    options?: QuestionFlowOption[];
    selectionMode?: "single" | "multi";
    steps?: QuestionFlowDefinition[];
    choice?: QuestionFlowChoice;
}

/* ── Safe Parse ────────────────────────────────────────── */
function isObj(v: unknown): v is Record<string, unknown> {
    return typeof v === "object" && v !== null;
}

function parseOption(v: unknown): QuestionFlowOption | null {
    if (!isObj(v)) return null;
    if (typeof v.id !== "string" || typeof v.label !== "string") return null;
    return {
        id: v.id,
        label: v.label,
        description: typeof v.description === "string" ? v.description : undefined,
        disabled: typeof v.disabled === "boolean" ? v.disabled : undefined,
    };
}

function parseOptions(v: unknown): QuestionFlowOption[] | null {
    if (!Array.isArray(v)) return null;
    const result: QuestionFlowOption[] = [];
    for (const item of v) {
        const opt = parseOption(item);
        if (!opt) return null;
        result.push(opt);
    }
    return result;
}

function parseStep(v: unknown): QuestionFlowDefinition | null {
    if (!isObj(v)) return null;
    if (typeof v.id !== "string" || typeof v.title !== "string") return null;
    const options = parseOptions(v.options);
    if (!options) return null;
    return {
        id: v.id,
        title: v.title,
        description: typeof v.description === "string" ? v.description : undefined,
        options,
        selectionMode:
            v.selectionMode === "single" || v.selectionMode === "multi"
                ? v.selectionMode
                : "single",
    };
}

function parseChoice(v: unknown): QuestionFlowChoice | null {
    if (!isObj(v)) return null;
    if (!Array.isArray(v.summary)) return null;
    const summary: { label: string; value: string }[] = [];
    for (const item of v.summary) {
        if (!isObj(item)) return null;
        if (typeof item.label !== "string" || typeof item.value !== "string") return null;
        summary.push({ label: item.label, value: item.value });
    }
    return {
        title: typeof v.title === "string" ? v.title : undefined,
        summary,
    };
}

export function safeParseSerializableQuestionFlow(
    data: unknown,
): SerializableQuestionFlow | null {
    if (!isObj(data)) return null;
    if (typeof data.id !== "string") return null;

    return {
        id: data.id,
        step: typeof data.step === "number" ? data.step : undefined,
        title: typeof data.title === "string" ? data.title : undefined,
        description: typeof data.description === "string" ? data.description : undefined,
        options: Array.isArray(data.options) ? (parseOptions(data.options) ?? undefined) : undefined,
        selectionMode:
            data.selectionMode === "single" || data.selectionMode === "multi"
                ? data.selectionMode
                : undefined,
        steps: Array.isArray(data.steps)
            ? (data.steps.map(parseStep).filter(Boolean) as QuestionFlowDefinition[])
            : undefined,
        choice: isObj(data.choice) ? (parseChoice(data.choice) ?? undefined) : undefined,
    };
}
