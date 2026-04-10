export function buildSkillProposalApprovalRequest({ proposal, name, description, body }) {
  const payload = {
    proposalId: String(proposal?.proposalId || "").trim(),
    action: String(proposal?.action || "").trim(),
    name: String(name || "").trim(),
    description: String(description || "").trim(),
    body: String(body || "").trim(),
  };

  if (payload.action === "update" && proposal?.skillNameToUpdate) {
    payload.skillNameToUpdate = String(proposal.skillNameToUpdate).trim();
  }

  return payload;
}

export async function submitSkillProposalApproval({
  electronAPI,
  proposal,
  name,
  description,
  body,
  scope = "main",
}) {
  if (!electronAPI?.approveSkillProposal) {
    throw new Error("Skill approval is not available.");
  }

  const payload = buildSkillProposalApprovalRequest({
    proposal,
    name,
    description,
    body,
  });

  const result = await electronAPI.approveSkillProposal(payload, scope);
  if (!result || result.ok !== true) {
    throw new Error(
      result && typeof result.error === "string" && result.error.trim()
        ? result.error
        : "Failed to approve skill proposal.",
    );
  }

  return result;
}
