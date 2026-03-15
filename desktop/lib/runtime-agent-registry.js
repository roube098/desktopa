const BUILTIN_SUBAGENTS = [
  {
    id: "orchestrator",
    name: "Orchestrator",
    category: "core",
    description: "Owns the middle-pane conversation, routes work, and aggregates subagent results.",
    contextTypes: ["general", "spreadsheet", "document", "presentation", "pdf"],
    color: "#16a34a",
  },
  {
    id: "spreadsheet",
    name: "Spreadsheet Specialist",
    category: "file",
    description: "Handles spreadsheet formulas, formatting, structures, and chart changes.",
    contextTypes: ["spreadsheet"],
    color: "#22c55e",
  },
  {
    id: "document",
    name: "Document Specialist",
    category: "file",
    description: "Handles document text, formatting, structure, and table changes.",
    contextTypes: ["document"],
    color: "#3b82f6",
  },
  {
    id: "presentation",
    name: "Presentation Specialist",
    category: "file",
    description: "Handles slide creation, layout, slide text, and visual updates.",
    contextTypes: ["presentation"],
    color: "#f59e0b",
  },
  {
    id: "pdf",
    name: "PDF Specialist",
    category: "file",
    description: "Handles PDF annotations, highlights, stamps, and extraction requests.",
    contextTypes: ["pdf"],
    color: "#ef4444",
  },
  {
    id: "workspace",
    name: "Workspace Worker",
    category: "utility",
    description: "Reads files, searches the workspace, lists directories, and proposes shell or patch operations.",
    contextTypes: ["general", "spreadsheet", "document", "presentation", "pdf"],
    color: "#8b5cf6",
  },
  {
    id: "research",
    name: "Research Worker",
    category: "utility",
    description: "Plans browser, web, MCP, app, or plugin-assisted research tasks.",
    contextTypes: ["general", "spreadsheet", "document", "presentation", "pdf"],
    color: "#06b6d4",
  },
  {
    id: "review",
    name: "Review Worker",
    category: "utility",
    description: "Verifies work, checks for risks, and summarizes validation gaps.",
    contextTypes: ["general", "spreadsheet", "document", "presentation", "pdf"],
    color: "#eab308",
  },
  {
    id: "planner",
    name: "Planner Worker",
    category: "utility",
    description: "Breaks work into steps and drives Codex-style plan mode collaboration.",
    contextTypes: ["general", "spreadsheet", "document", "presentation", "pdf"],
    color: "#f97316",
  },
];

function getBuiltinSubagents() {
  return BUILTIN_SUBAGENTS.slice();
}

function getBuiltinMap() {
  return new Map(BUILTIN_SUBAGENTS.map((agent) => [agent.id, agent]));
}

module.exports = {
  BUILTIN_SUBAGENTS,
  getBuiltinSubagents,
  getBuiltinMap,
};
