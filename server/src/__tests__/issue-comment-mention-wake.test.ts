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
  issueFileService: () => ({}),
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
const CEO_ID = "66666666-6666-4666-8666-666666666666";
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

describe("issue update mention-wake — reassign + reopen + comment + mention (FID-44)", () => {
  // Reproduces Board's exact flow: open the picker, choose CEO, write text,
  // tick re-open, set assignee = CEO, submit. The UI sends this through
  // PATCH /issues/:id (not POST /comments) because the assignee changed.
  // Without the FID-44 fix, the new assignee got an `issue_assigned` wake
  // with no `wakeCommentId`, so the heartbeat never surfaced the trigger
  // comment and the agent appeared to do nothing.
  beforeEach(() => {
    vi.clearAllMocks();
    mockIssueService.findMentionedAgents.mockResolvedValue([]);
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
  });

  it("includes wakeCommentId in the assigneeʼs wake when reassign + comment + mention happen together", async () => {
    // Existing issue: closed, no assignee.
    mockIssueService.getById.mockResolvedValue(
      makeIssue({ status: "done", assigneeAgentId: null }),
    );
    // After update: reopened to todo, assigned to CEO.
    mockIssueService.update.mockResolvedValue(
      makeIssue({ status: "todo", assigneeAgentId: CEO_ID }),
    );
    // The picker emits `[@CEO](agent://<uuid>)`; the resolver returns CEO's id.
    mockIssueService.findMentionedAgents.mockResolvedValue([CEO_ID]);

    const res = await request(createApp())
      .patch(`/api/issues/${ISSUE_ID}`)
      .send({
        comment: "[@CEO](agent://" + CEO_ID + ") please take a look",
        reopen: true,
        assigneeAgentId: CEO_ID,
      });

    expect(res.status).toBe(200);
    await flushAsync();

    const calls = mockHeartbeatService.wakeup.mock.calls;
    const ceoCalls = calls.filter(([agentId]) => agentId === CEO_ID);
    // CEO is woken exactly once (assignment + mention dedup to a single wake).
    expect(ceoCalls).toHaveLength(1);
    // The wake carries the comment id so the heartbeat surfaces the trigger
    // comment, even though the primary reason is `issue_assigned`.
    expect(ceoCalls[0]![1]).toMatchObject({
      payload: expect.objectContaining({ commentId: COMMENT_ID }),
      contextSnapshot: expect.objectContaining({
        commentId: COMMENT_ID,
        wakeCommentId: COMMENT_ID,
      }),
    });
  });

  it("includes wakeCommentId on a plain reassign + comment (no mention) too", async () => {
    mockIssueService.getById.mockResolvedValue(
      makeIssue({ status: "todo", assigneeAgentId: ASSIGNEE_ID }),
    );
    mockIssueService.update.mockResolvedValue(
      makeIssue({ status: "todo", assigneeAgentId: CEO_ID }),
    );
    mockIssueService.findMentionedAgents.mockResolvedValue([]);

    const res = await request(createApp())
      .patch(`/api/issues/${ISSUE_ID}`)
      .send({
        comment: "passing this to you",
        assigneeAgentId: CEO_ID,
      });

    expect(res.status).toBe(200);
    await flushAsync();

    const calls = mockHeartbeatService.wakeup.mock.calls;
    const ceoCalls = calls.filter(([agentId]) => agentId === CEO_ID);
    expect(ceoCalls).toHaveLength(1);
    expect(ceoCalls[0]![1]).toMatchObject({
      reason: "issue_assigned",
      payload: expect.objectContaining({ commentId: COMMENT_ID }),
      contextSnapshot: expect.objectContaining({
        commentId: COMMENT_ID,
        wakeCommentId: COMMENT_ID,
      }),
    });
  });

  it("does not inject wakeCommentId when the PATCH carries no comment body", async () => {
    mockIssueService.getById.mockResolvedValue(
      makeIssue({ status: "todo", assigneeAgentId: ASSIGNEE_ID }),
    );
    mockIssueService.update.mockResolvedValue(
      makeIssue({ status: "todo", assigneeAgentId: CEO_ID }),
    );

    const res = await request(createApp())
      .patch(`/api/issues/${ISSUE_ID}`)
      .send({ assigneeAgentId: CEO_ID });

    expect(res.status).toBe(200);
    await flushAsync();

    const calls = mockHeartbeatService.wakeup.mock.calls;
    const ceoCalls = calls.filter(([agentId]) => agentId === CEO_ID);
    expect(ceoCalls).toHaveLength(1);
    // No comment in this PATCH → contextSnapshot must NOT carry a wakeCommentId.
    const ctx = (ceoCalls[0]![1] as any).contextSnapshot;
    expect(ctx.wakeCommentId).toBeUndefined();
    expect(ctx.commentId).toBeUndefined();
    // Also: addComment must NOT be called when no body was sent.
    expect(mockIssueService.addComment).not.toHaveBeenCalled();
  });
});
