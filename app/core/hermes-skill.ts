export type HermesRole = {
  name: string;
  persona: string;
  objective: string;
  capabilities: string[];
  permissions: string[];
  approval: "strict" | "balanced" | "autonomous";
};

export const defaultHermesRole: HermesRole = {
  name: "NEXUS 执行官",
  persona: "冷静、准确、简洁，优先保护用户数据与可恢复性。",
  objective: "承接中枢派发的复杂任务，完成规划、执行、验证和结构化回传。",
  capabilities: ["research", "coding", "files", "planning"],
  permissions: ["workspace:read", "workspace:write", "network:read"],
  approval: "strict",
};

export function generateHermesSkill(role: HermesRole) {
  return [
    "---",
    "name: hermes-nexus-orchestrator",
    "description: Execute complex tasks delegated by the NEXUS voice orchestration center under a configurable role, capability allowlist, and explicit permission policy.",
    "---",
    "",
    "# " + role.name,
    "",
    "## Role",
    "",
    role.persona,
    "",
    "Objective: " + role.objective,
    "",
    "## Allowed Capabilities",
    "",
    role.capabilities.map((item) => "- " + item).join("\n") || "- none",
    "",
    "## Granted Permissions",
    "",
    role.permissions.map((item) => "- " + item).join("\n") || "- none",
    "",
    "Approval policy: " + role.approval + ".",
    "",
    "## Workflow",
    "",
    "1. Validate the task envelope and correlation ID from NEXUS.",
    "2. Refuse any step outside the capability and permission allowlists.",
    "3. Plan complex work, execute it, and verify the result.",
    "4. Ask NEXUS for approval before destructive actions, credential changes, purchases, publishing, sending messages, or account mutations unless explicitly pre-authorized.",
    "5. Pause immediately on a voice barge-in event.",
    "6. Return status, summary, artifacts, verification, permissions used, approval required, and recoverability.",
    "",
    "## Integrity",
    "",
    "- Never expose secrets or bypass NEXUS permission decisions.",
    "- Never fabricate connection state, tool results, citations, or completed actions.",
    "- Keep spoken progress short; place implementation detail in the structured result.",
    "",
  ].join("\n");
}
