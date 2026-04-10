const test = require("node:test");
const assert = require("node:assert/strict");

async function loadApprovalHelpers() {
  return await import("../lib/skill-proposal-approval.mjs");
}

test("buildSkillProposalApprovalRequest maps update proposals onto the dedicated approval payload", async () => {
  const { buildSkillProposalApprovalRequest } = await loadApprovalHelpers();
  const payload = buildSkillProposalApprovalRequest({
    proposal: {
      proposalId: "proposal-42",
      action: "update",
      skillNameToUpdate: "mcp-connector-exploration",
    },
    name: "mcp-connector-exploration",
    description: "Updated MCP exploration workflow.",
    body: "# Updated body",
  });

  assert.deepEqual(payload, {
    proposalId: "proposal-42",
    action: "update",
    name: "mcp-connector-exploration",
    description: "Updated MCP exploration workflow.",
    body: "# Updated body",
    skillNameToUpdate: "mcp-connector-exploration",
  });
});

test("submitSkillProposalApproval uses approveSkillProposal and never falls back to excelorLaunch", async () => {
  const { submitSkillProposalApproval } = await loadApprovalHelpers();
  const calls = [];
  let excelorLaunchCalled = false;

  const result = await submitSkillProposalApproval({
    electronAPI: {
      approveSkillProposal: async (payload, scope) => {
        calls.push({ payload, scope });
        return { ok: true, skillsChanged: true, message: "Created skill." };
      },
      excelorLaunch: async () => {
        excelorLaunchCalled = true;
      },
    },
    proposal: {
      proposalId: "proposal-7",
      action: "create",
    },
    name: "mcp-connector-exploration",
    description: "Systematic MCP connector workflow.",
    body: "# Skill body",
  });

  assert.equal(result.ok, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].scope, "main");
  assert.equal(calls[0].payload.proposalId, "proposal-7");
  assert.equal(calls[0].payload.action, "create");
  assert.equal(excelorLaunchCalled, false);
});
