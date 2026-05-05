import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { agentRoutes } from "../routes/agents.js";
import { errorHandler } from "../middleware/index.js";

// FID-17 — PATCH /api/agents/:id must clear the runtime session when the
// adapter type changes, or when codex_local model/effort changes, so that
// a stale sessionId/threadId never leaks into the new runtime.

const agentId = "11111111-1111-4111-8111-111111111111";
const companyId = "company-1";

const mockAgentService = vi.hoisted(() => ({
  getById: vi.fn(),
  update: vi.fn(),
  resolveByReference: vi.fn(),
}));

const mockHeartbeatService = vi.hoisted(() => ({
  resetRuntimeSession: vi.fn(),
}));

const mockAccessService = vi.hoisted(() => ({
  canUser: vi.fn(),
  hasPermission: vi.fn(),
}));

const mockSecretService = vi.hoisted(() => ({
  resolveAdapterConfigForRuntime: vi.fn(),
  normalizeAdapterConfigForPersistence: vi.fn(
    async (_companyId: string, config: Record<string, unknown>) => config,
  ),
}));

const mockLogActivity = vi.hoisted(() => vi.fn());

vi.mock("../services/index.js", () => ({
  agentService: () => mockAgentService,
  agentInstructionsService: () => ({}),
  accessService: () => mockAccessService,
  approvalService: () => ({}),
  companySkillService: () => ({ listRuntimeSkillEntries: vi.fn() }),
  budgetService: () => ({}),
  heartbeatService: () => mockHeartbeatService,
  issueApprovalService: () => ({}),
  issueService: () => ({}),
  logActivity: mockLogActivity,
  secretService: () => mockSecretService,
  syncInstructionsBundleConfigFromFilePath: vi.fn((_agent, config) => config),
  workspaceOperationService: () => ({}),
}));

vi.mock("../adapters/index.js", () => ({
  findServerAdapter: vi.fn(),
  listAdapterModels: vi.fn(),
}));

function createApp() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).actor = {
      type: "board",
      userId: "local-board",
      companyIds: [companyId],
      source: "local_implicit",
      isInstanceAdmin: true,
    };
    next();
  });
  app.use("/api", agentRoutes({} as any));
  app.use(errorHandler);
  return app;
}

function makeAgent(overrides: Record<string, unknown> = {}) {
  return {
    id: agentId,
    companyId,
    name: "Engineer",
    role: "engineer",
    title: "Engineer",
    status: "active",
    reportsTo: null,
    capabilities: null,
    adapterType: "claude_local",
    adapterConfig: { model: "claude-sonnet-4" },
    runtimeConfig: {},
    permissions: null,
    updatedAt: new Date(),
    ...overrides,
  };
}

describe("FID-17 PATCH /api/agents/:id runtime session reset on adapter/model swap", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAgentService.getById.mockResolvedValue(makeAgent());
    mockAgentService.update.mockImplementation(
      async (_id: string, patch: Record<string, unknown>) => ({
        ...makeAgent(),
        ...patch,
      }),
    );
    mockHeartbeatService.resetRuntimeSession.mockResolvedValue({
      sessionId: null,
      stateJson: {},
      clearedTaskSessions: 0,
    });
    mockLogActivity.mockResolvedValue(undefined);
  });

  it("clears runtime session when adapter type changes claude_local → codex_local", async () => {
    const res = await request(createApp())
      .patch(`/api/agents/${agentId}?companyId=${companyId}`)
      .send({
        adapterType: "codex_local",
        adapterConfig: { model: "gpt-5.5" },
      });

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(mockHeartbeatService.resetRuntimeSession).toHaveBeenCalledTimes(1);
    expect(mockHeartbeatService.resetRuntimeSession).toHaveBeenCalledWith(agentId);

    const resetLog = mockLogActivity.mock.calls.find(
      ([, entry]) => entry.action === "agent.runtime_session_reset",
    );
    expect(resetLog, "expected agent.runtime_session_reset activity entry").toBeTruthy();
    expect(resetLog?.[1].details).toMatchObject({
      reason: "adapter_swap",
      source: "agent_patch",
    });
    expect(resetLog?.[1].entityId).toBe(agentId);
  });

  it("clears runtime session when codex_local model changes", async () => {
    mockAgentService.getById.mockResolvedValue(
      makeAgent({
        adapterType: "codex_local",
        adapterConfig: { model: "gpt-5.5", modelReasoningEffort: "high" },
      }),
    );

    const res = await request(createApp())
      .patch(`/api/agents/${agentId}?companyId=${companyId}`)
      .send({
        adapterConfig: { model: "gpt-5.5-codex" },
      });

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(mockHeartbeatService.resetRuntimeSession).toHaveBeenCalledWith(agentId);

    const resetLog = mockLogActivity.mock.calls.find(
      ([, entry]) => entry.action === "agent.runtime_session_reset",
    );
    expect(resetLog?.[1].details).toMatchObject({
      reason: "model_change",
      source: "agent_patch",
    });
  });

  it("clears runtime session when codex_local modelReasoningEffort changes", async () => {
    mockAgentService.getById.mockResolvedValue(
      makeAgent({
        adapterType: "codex_local",
        adapterConfig: { model: "gpt-5.5", modelReasoningEffort: "high" },
      }),
    );

    const res = await request(createApp())
      .patch(`/api/agents/${agentId}?companyId=${companyId}`)
      .send({
        adapterConfig: { modelReasoningEffort: "xhigh" },
      });

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(mockHeartbeatService.resetRuntimeSession).toHaveBeenCalledTimes(1);

    const resetLog = mockLogActivity.mock.calls.find(
      ([, entry]) => entry.action === "agent.runtime_session_reset",
    );
    expect(resetLog?.[1].details.reason).toBe("model_change");
  });

  it("does NOT reset when codex_local config patch leaves model and effort unchanged", async () => {
    mockAgentService.getById.mockResolvedValue(
      makeAgent({
        adapterType: "codex_local",
        adapterConfig: { model: "gpt-5.5", modelReasoningEffort: "high" },
      }),
    );

    const res = await request(createApp())
      .patch(`/api/agents/${agentId}?companyId=${companyId}`)
      .send({
        adapterConfig: { command: "codex --profile engineer" },
      });

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(mockHeartbeatService.resetRuntimeSession).not.toHaveBeenCalled();

    const resetLog = mockLogActivity.mock.calls.find(
      ([, entry]) => entry.action === "agent.runtime_session_reset",
    );
    expect(resetLog).toBeUndefined();
  });

  it("does NOT reset when only non-adapter fields change", async () => {
    const res = await request(createApp())
      .patch(`/api/agents/${agentId}?companyId=${companyId}`)
      .send({ title: "Senior Engineer" });

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(mockHeartbeatService.resetRuntimeSession).not.toHaveBeenCalled();
  });

  it("does NOT reset for non-codex same-adapter model changes (e.g. claude_local model)", async () => {
    // claude_local supports --resume across model boundaries; only codex CLI rejects model mismatch on resume
    const res = await request(createApp())
      .patch(`/api/agents/${agentId}?companyId=${companyId}`)
      .send({
        adapterConfig: { model: "claude-opus-4" },
      });

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(mockHeartbeatService.resetRuntimeSession).not.toHaveBeenCalled();
  });
});
