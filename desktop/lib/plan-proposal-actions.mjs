export function buildPlanApprovalRequest({ proposal }) {
  return {
    proposalId: String(proposal?.proposalId || "").trim(),
    planId: String(proposal?.planId || "").trim(),
    title: String(proposal?.title || "").trim(),
    summary: String(proposal?.summary || "").trim(),
    body: String(proposal?.body || "").trim(),
    revision: Number.isFinite(proposal?.revision) ? Number(proposal.revision) : 0,
    draftPath: String(proposal?.draftPath || "").trim() || undefined,
  };
}

export async function submitPlanApproval({
  electronAPI,
  proposal,
  scope = "main",
}) {
  if (!electronAPI?.approvePlanProposal) {
    throw new Error("Plan approval is not available.");
  }

  const payload = buildPlanApprovalRequest({ proposal });
  const result = await electronAPI.approvePlanProposal(payload, scope);
  if (!result || result.ok !== true) {
    throw new Error(
      result && typeof result.error === "string" && result.error.trim()
        ? result.error
        : "Failed to approve plan proposal.",
    );
  }

  return result;
}

export async function submitPlanRevision({
  electronAPI,
  proposal,
  note,
  scope = "main",
}) {
  if (!electronAPI?.requestPlanProposalRevision) {
    throw new Error("Plan revision is not available.");
  }

  const result = await electronAPI.requestPlanProposalRevision({
    proposalId: String(proposal?.proposalId || "").trim(),
    note: String(note || "").trim(),
  }, scope);

  if (!result || result.ok !== true) {
    throw new Error(
      result && typeof result.error === "string" && result.error.trim()
        ? result.error
        : "Failed to request a plan revision.",
    );
  }

  return result;
}

export async function submitPlanRejection({
  electronAPI,
  proposal,
  scope = "main",
}) {
  if (!electronAPI?.rejectPlanProposal) {
    throw new Error("Plan rejection is not available.");
  }

  const result = await electronAPI.rejectPlanProposal({
    proposalId: String(proposal?.proposalId || "").trim(),
  }, scope);

  if (!result || result.ok !== true) {
    throw new Error(
      result && typeof result.error === "string" && result.error.trim()
        ? result.error
        : "Failed to reject plan proposal.",
    );
  }

  return result;
}
