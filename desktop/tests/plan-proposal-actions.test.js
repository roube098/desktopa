const test = require("node:test");
const assert = require("node:assert/strict");

async function loadActions() {
  return await import("../lib/plan-proposal-actions.mjs");
}

test("buildPlanApprovalRequest maps the plan proposal onto the approval payload", async () => {
  const { buildPlanApprovalRequest } = await loadActions();
  const payload = buildPlanApprovalRequest({
    proposal: {
      proposalId: "proposal-9",
      planId: "plan-3",
      title: "Implement plan mode",
      summary: "Add runtime state and UI wiring.",
      body: "## Summary\n\nShip it.",
      revision: 4,
      draftPath: "C:\\Users\\test\\.excelor\\plans\\conv.md",
    },
  });

  assert.deepEqual(payload, {
    proposalId: "proposal-9",
    planId: "plan-3",
    title: "Implement plan mode",
    summary: "Add runtime state and UI wiring.",
    body: "## Summary\n\nShip it.",
    revision: 4,
    draftPath: "C:\\Users\\test\\.excelor\\plans\\conv.md",
  });
});

test("submitPlanApproval uses the dedicated approval IPC", async () => {
  const { submitPlanApproval } = await loadActions();
  const calls = [];

  const result = await submitPlanApproval({
    electronAPI: {
      approvePlanProposal: async (payload, scope) => {
        calls.push({ payload, scope });
        return { ok: true, approvedAt: "2026-04-13T12:00:00.000Z" };
      },
    },
    proposal: {
      proposalId: "proposal-11",
      planId: "plan-11",
      title: "Approved plan",
      summary: "Summary",
      body: "Body",
      revision: 1,
    },
  });

  assert.equal(result.ok, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].scope, "main");
  assert.equal(calls[0].payload.proposalId, "proposal-11");
});

test("submitPlanRevision uses the revision IPC", async () => {
  const { submitPlanRevision } = await loadActions();
  const calls = [];

  const result = await submitPlanRevision({
    electronAPI: {
      requestPlanProposalRevision: async (payload, scope) => {
        calls.push({ payload, scope });
        return { ok: true };
      },
    },
    proposal: { proposalId: "proposal-12" },
    note: "Tighten rollout and acceptance criteria.",
  });

  assert.equal(result.ok, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].payload.proposalId, "proposal-12");
  assert.equal(calls[0].payload.note, "Tighten rollout and acceptance criteria.");
});
