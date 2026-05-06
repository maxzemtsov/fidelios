import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { issueRoutes } from "../routes/issues.js";
import { errorHandler } from "../middleware/index.js";

const mockIssueService = vi.hoisted(() => ({
  getById: vi.fn(),
  update: vi.fn(),
  addComment: vi.fn(),
  findMentionedAgents: vi.fn(),
}));

const mockAccessService = vi.hoisted(() => ({
  canUser: vi.fn(),
  hasPermission: vi.fn(),
}));

const mockHeartbeatService = vi.hoisted(() => ({
  wakeup: vi.fn(async () => undefined),
  reportRunActivity: vi.fn(async () => undefined),
}));

const mockAgentService = vi.hoisted(() => ({
  getById: vi.fn(),
}));

const mockLogActivity = vi.hoisted(() => vi.fn(async () => undefined));

vi.mock("../services/index.js", () => ({
  accessService: () => mockAccessService,
  agentService: () => mockAgentService,
  documentService: () => ({}),
  executionWorkspaceService: () => ({}),
  goalService: () => ({}),
  heartbeatService: () => mockHeartbeatService,
  issueApprovalService: () => ({}),
  issueService: () => mockIssueService,
  logActivity: mockLogActivity,
  projectService: () => ({}),
  routineService: () => ({
    syncRunStatusForIssue: vi.fn(async () => undefined),
  }),
  workProductService: () => ({}),
}));

const ASSIGNEE_ID = "22222222-2222-4222-8222-222222222222";
const MENTIONED_ID = "33333333-3333-4333-8333-333333333333";
const SECOND_MENTIONED_ID = "44444444-4444-4444-8444-444444444444";
const ISSUE_ID = "11111111-1111-4111-8111-111111111111";
const COMPANY_ID = "company-1";
const COMMENT_ID = "55555555-5555-4555-8555-555555555555";

function createApp(actor?: Record<string, unknown>) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).actor = actor ?? {
      type: "board",
      userId: "local-board",
      companyIds: [COMPANY_ID],
      source: "local_implicit",
      isInstanceAdmin: false,
    };
    next();
  });
  app.use("/api", issueRoutes({} as any, {} as any));
  app.use(errorHandler);
  return app;
}

function makeIssue(overrides: Record<string, unknown> = {}) {
  return {
    id: ISSUE_ID,
    companyId: COMPANY_ID,
    status: "todo",
    assigneeAgentId: ASSIGNEE_ID,
    assigneeUserId: null,
    createdByUserId: "local-board",
    identifier: "TST-1",
    title: "Test issue",
    ...overrides,
  };
}

async function flushAsync() {
  // The route fires wakeups via `void (async () => {...})()`.
  // Yield twice so the microtask queue drains before assertions.
  await Promise.resolve();
  await Promise.resolve();
  await new Promise((resolve) => setImmediate(resolve));
}

describe("issue comment mention-wake (FID-44)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIssueService.addComment.mockResolvedValue({
      id: COMMENT_ID,
      issueId: ISSUE_ID,
      companyId: COMPANY_ID,
      body: "stub",
      createdAt: new Date(),
      updatedAt: new Date(),
      authorAgentId: null,
      authorUserId: "local-board",
    });
    mockIssueService.findMentionedAgents.mockResolvedValue([]);
  });

  it("wakes a non-assignee mentioned agent with issue_comment_mentioned + commentId", async () => {
    mockIssueService.getById.mockResolvedValue(makeIssue());
    mockIssueService.findMentionedAgents.mockResolvedValue([MENTIONED_ID]);

    const res = await request(createApp())
      .post(`/api/issues/${ISSUE_ID}/comments`)
      .send({ body: "@Bob please look" });

    expect(res.status).toBe(201);
    await flushAsync();

    expect(mockIssueService.findMentionedAgents).toHaveBeenCalledWith(
      COMPANY_ID,
      "@Bob please look",
    );

    const calls = mockHeartbeatService.wakeup.mock.calls;
    const mentionCall = calls.find(([agentId]) => agentId === MENTIONED_ID);
    expect(mentionCall).toBeTruthy();
    expect(mentionCall![1]).toMatchObject({
      reason: "issue_comment_mentioned",
      payload: { issueId: ISSUE_ID, commentId: COMMENT_ID },
      contextSnapshot: expect.objectContaining({
        wakeReason: "issue_comment_mentioned",
        wakeCommentId: COMMENT_ID,
        commentId: COMMENT_ID,
      }),
    });
  });

  it("does NOT double-wake the assignee when assignee is also mentioned", async () => {
    mockIssueService.getById.mockResolvedValue(makeIssue());
    mockIssueService.findMentionedAgents.mockResolvedValue([ASSIGNEE_ID]);

    const res = await request(createApp())
      .post(`/api/issues/${ISSUE_ID}/comments`)
      .send({ body: "@assignee ping" });

    expect(res.status).toBe(201);
    await flushAsync();

    const calls = mockHeartbeatService.wakeup.mock.calls;
    const assigneeCalls = calls.filter(([agentId]) => agentId === ASSIGNEE_ID);
    expect(assigneeCalls).toHaveLength(1);
    expect(assigneeCalls[0]![1]).toMatchObject({ reason: "issue_commented" });
  });

  it("fans out multiple mentions but de-dupes per agent", async () => {
    mockIssueService.getById.mockResolvedValue(makeIssue());
    mockIssueService.findMentionedAgents.mockResolvedValue([
      MENTIONED_ID,
      SECOND_MENTIONED_ID,
      MENTIONED_ID, // duplicate, defensive
    ]);

    const res = await request(createApp())
      .post(`/api/issues/${ISSUE_ID}/comments`)
      .send({ body: "@bob @carol look" });

    expect(res.status).toBe(201);
    await flushAsync();

    const calls = mockHeartbeatService.wakeup.mock.calls;
    const mentionedAgentIds = calls
      .map(([agentId, w]) => [agentId, (w as any).reason])
      .filter(([, reason]) => reason === "issue_comment_mentioned")
      .map(([agentId]) => agentId);
    expect(new Set(mentionedAgentIds)).toEqual(
      new Set([MENTIONED_ID, SECOND_MENTIONED_ID]),
    );
  });

  it("does NOT wake the author agent when they self-mention", async () => {
    mockIssueService.getById.mockResolvedValue(makeIssue());
    mockIssueService.findMentionedAgents.mockResolvedValue([MENTIONED_ID]);

    const authorActor = {
      type: "agent",
      agentId: MENTIONED_ID,
      runId: null,
      companyId: COMPANY_ID,
      source: "agent_jwt",
      isInstanceAdmin: false,
    };

    const res = await request(createApp(authorActor))
      .post(`/api/issues/${ISSUE_ID}/comments`)
      .send({ body: "talking to @myself" });

    expect(res.status).toBe(201);
    await flushAsync();

    const calls = mockHeartbeatService.wakeup.mock.calls;
    const selfMentionCalls = calls.filter(
      ([agentId, w]) =>
        agentId === MENTIONED_ID &&
        (w as any).reason === "issue_comment_mentioned",
    );
    expect(selfMentionCalls).toHaveLength(0);
  });

  it("ignores empty mention results (unknown handle)", async () => {
    mockIssueService.getById.mockResolvedValue(makeIssue());
    mockIssueService.findMentionedAgents.mockResolvedValue([]);

    const res = await request(createApp())
      .post(`/api/issues/${ISSUE_ID}/comments`)
      .send({ body: "@nobody such agent" });

    expect(res.status).toBe(201);
    await flushAsync();

    const mentionWakes = mockHeartbeatService.wakeup.mock.calls.filter(
      ([, w]) => (w as any).reason === "issue_comment_mentioned",
    );
    expect(mentionWakes).toHaveLength(0);
  });

  it("still wakes mentioned agent when issue has no assignee", async () => {
    mockIssueService.getById.mockResolvedValue(
      makeIssue({ assigneeAgentId: null }),
    );
    mockIssueService.findMentionedAgents.mockResolvedValue([MENTIONED_ID]);

    const res = await request(createApp())
      .post(`/api/issues/${ISSUE_ID}/comments`)
      .send({ body: "@bob please own this" });

    expect(res.status).toBe(201);
    await flushAsync();

    const calls = mockHeartbeatService.wakeup.mock.calls;
    expect(calls).toHaveLength(1);
    expect(calls[0]![0]).toBe(MENTIONED_ID);
    expect(calls[0]![1]).toMatchObject({ reason: "issue_comment_mentioned" });
  });
});
