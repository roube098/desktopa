export const PLAN_MODE_ACTIVATED_MESSAGE = "Plan mode active. Tell me what you want to plan.";

export interface PlanSlashCommand {
    command: "plan";
    prompt: string;
}

export function parsePlanSlashCommand(value: string): PlanSlashCommand | null {
    const raw = String(value || "");
    const match = raw.match(/^\/plan(?:\s+([\s\S]*))?$/i);
    if (!match) {
        return null;
    }

    return {
        command: "plan",
        prompt: String(match[1] || "").trim(),
    };
}
