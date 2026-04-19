export type PlanModeStatus = 'inactive' | 'active' | 'awaiting_approval' | 'approved';

export interface ApprovedPlanEntry {
  planId: string;
  proposalId: string;
  title: string;
  summary: string;
  body: string;
  revision: number;
  approvedAt?: string;
  draftPath?: string;
}

export interface PlanModeEntry {
  active: boolean;
  status: PlanModeStatus;
  planId?: string;
  revision: number;
  enteredAt?: string;
  previousMode: 'default' | 'plan';
  approvedPlan?: ApprovedPlanEntry | null;
  draftPath?: string;
}

export interface PlanProposalEntry {
  id: string;
  proposalId: string;
  planId: string;
  title: string;
  summary: string;
  body: string;
  revision: number;
  createdAt: string;
  status?: 'pending' | 'approved' | 'rejected' | 'revision_requested';
  draftPath?: string;
}
