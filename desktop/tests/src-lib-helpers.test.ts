import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeInlineThreadItems } from "../src/lib/inline-thread-merge";
import { getMcpAppDisplayHostFields } from "../src/lib/mcp-app-host-context";

test("mergeInlineThreadItems interleaves mcp_app by createdAtMs", () => {
    const merged = mergeInlineThreadItems({
        threadMessages: [
            { id: "a", createdAt: new Date("2026-01-01T12:00:00.000Z") },
            { id: "b", createdAt: new Date("2026-01-01T12:00:05.000Z") },
        ],
        promptBlocks: [],
        visibleSkillProposals: [],
        inlineMcpApps: [
            { sessionId: "s1", createdAtMs: Date.parse("2026-01-01T12:00:02.000Z") },
        ],
    });

    assert.equal(merged.length, 3);
    assert.equal(merged[0].kind, "message");
    assert.equal(merged[1].kind, "mcp_app");
    if (merged[1].kind === "mcp_app") {
        assert.equal(merged[1].sessionId, "s1");
    }
    assert.equal(merged[2].kind, "message");
});

test("mergeInlineThreadItems sorts mcp_app after earlier messages and before later ones", () => {
    const merged = mergeInlineThreadItems({
        threadMessages: [{ id: "m1", createdAt: "2026-04-10T10:00:00.000Z" }],
        promptBlocks: [],
        visibleSkillProposals: [],
        inlineMcpApps: [{ sessionId: "td", createdAtMs: Date.parse("2026-04-10T10:00:01.000Z") }],
    });
    assert.deepEqual(
        merged.map((row) => row.kind),
        ["message", "mcp_app"],
    );
});

test("getMcpAppDisplayHostFields(inline) reports inline-only modes", () => {
    const fields = getMcpAppDisplayHostFields("inline");
    assert.equal(fields.displayMode, "inline");
    assert.deepEqual(fields.availableDisplayModes, ["inline"]);
});

test("getMcpAppDisplayHostFields(fullscreen) reports fullscreen-only modes", () => {
    const fields = getMcpAppDisplayHostFields("fullscreen");
    assert.equal(fields.displayMode, "fullscreen");
    assert.deepEqual(fields.availableDisplayModes, ["fullscreen"]);
});
