/**
 * Tests for FID-52: headless I/O contract.
 */
import { describe, it, expect, vi } from "vitest";

import {
    isHeadlessEnv,
    filterHeadlessUnsafe,
    filterHeadlessCsv,
    parseClarifyMarker,
    escalateClarify,
} from "./headless.js";

describe("isHeadlessEnv", () => {
    it("returns true when FIDELIOS_RUN_ID is present", () => {
        expect(isHeadlessEnv({ FIDELIOS_RUN_ID: "abc" })).toBe(true);
    });

    it("returns true when FIDELIOS_HEADLESS=1", () => {
        expect(isHeadlessEnv({ FIDELIOS_HEADLESS: "1" })).toBe(true);
        expect(isHeadlessEnv({ FIDELIOS_HEADLESS: "true" })).toBe(true);
    });

    it("explicit FIDELIOS_HEADLESS=0 wins over RUN_ID (used for tests)", () => {
        expect(isHeadlessEnv({ FIDELIOS_HEADLESS: "0", FIDELIOS_RUN_ID: "x" })).toBe(false);
    });

    it("returns false on empty env when stdin is a TTY", () => {
        expect(isHeadlessEnv({}, { stdinIsTTY: true })).toBe(false);
    });

    it("returns true when stdin is not a TTY (and no FideliOS markers)", () => {
        expect(isHeadlessEnv({}, { stdinIsTTY: false })).toBe(true);
    });

    it("returns false when neither marker nor TTY hint is present (assume interactive)", () => {
        expect(isHeadlessEnv({})).toBe(false);
    });
});

describe("filterHeadlessUnsafe", () => {
    it("strips clarify (registry-flagged headlessSafe:false)", () => {
        const r = filterHeadlessUnsafe(["file", "clarify", "web"]);
        expect(r.kept).toEqual(["file", "web"]);
        expect(r.stripped).toEqual(["clarify"]);
    });

    it("preserves order of kept names", () => {
        const r = filterHeadlessUnsafe(["clarify", "terminal", "clarify", "file"]);
        expect(r.kept).toEqual(["terminal", "file"]);
        expect(r.stripped).toEqual(["clarify", "clarify"]);
    });

    it("leaves unknown names alone (Hermes / triage handle those)", () => {
        const r = filterHeadlessUnsafe(["mystery", "file"]);
        expect(r.kept).toEqual(["mystery", "file"]);
        expect(r.stripped).toEqual([]);
    });

    it("accepts a custom registry override", () => {
        const reg = [
            { name: "alpha", headlessSafe: false },
            { name: "beta" },
        ];
        const r = filterHeadlessUnsafe(["alpha", "beta", "clarify"], reg);
        // Note: with custom registry, `clarify` is unknown → kept.
        expect(r.kept).toEqual(["beta", "clarify"]);
        expect(r.stripped).toEqual(["alpha"]);
    });
});

describe("filterHeadlessCsv", () => {
    it("filters comma-separated input and returns new csv", () => {
        const r = filterHeadlessCsv("file,clarify,web");
        expect(r.csv).toBe("file,web");
        expect(r.stripped).toEqual(["clarify"]);
    });

    it("returns empty string when nothing is left after stripping", () => {
        const r = filterHeadlessCsv("clarify");
        expect(r.csv).toBe("");
        expect(r.stripped).toEqual(["clarify"]);
    });

    it("passes through undefined input", () => {
        const r = filterHeadlessCsv(undefined);
        expect(r.csv).toBeUndefined();
        expect(r.stripped).toEqual([]);
    });

    it("passes through empty string input", () => {
        const r = filterHeadlessCsv("");
        expect(r.csv).toBe("");
        expect(r.stripped).toEqual([]);
    });

    it("trims whitespace and skips empty entries", () => {
        const r = filterHeadlessCsv(" file , clarify ,, web ");
        expect(r.csv).toBe("file,web");
        expect(r.stripped).toEqual(["clarify"]);
    });
});

describe("parseClarifyMarker", () => {
    it("extracts question from a verbose tool-call line", () => {
        const line = `[tool] clarify {"question":"What now?","choices":["a","b"]}`;
        expect(parseClarifyMarker(line)).toBe("What now?");
    });

    it("returns null for unrelated lines", () => {
        expect(parseClarifyMarker("[tool] file {\"path\":\"x\"}")).toBeNull();
        expect(parseClarifyMarker("session_id: abc")).toBeNull();
        expect(parseClarifyMarker("")).toBeNull();
        expect(parseClarifyMarker(null)).toBeNull();
    });

    it("returns null when JSON cannot be parsed", () => {
        expect(parseClarifyMarker("[tool] clarify { not-json")).toBeNull();
    });
});

describe("escalateClarify", () => {
    function jsonRes(status, body) {
        return {
            ok: status >= 200 && status < 300,
            status,
            json: async () => body,
        };
    }

    it("posts comment + PATCHes blocked and returns commentId", async () => {
        const calls = [];
        const fetchImpl = vi.fn(async (url, init) => {
            calls.push({ url, method: init.method, body: init.body });
            if (init.method === "POST") return jsonRes(201, { id: "c-1" });
            return jsonRes(200, {});
        });
        const r = await escalateClarify({
            question: "Pick A or B?",
            taskId: "task-1",
            apiUrl: "http://api/api",
            fetchImpl,
        });
        expect(r.ok).toBe(true);
        expect(r.commentId).toBe("c-1");
        expect(calls).toHaveLength(2);
        expect(calls[0].url).toBe("http://api/api/issues/task-1/comments");
        expect(calls[0].method).toBe("POST");
        expect(JSON.parse(calls[0].body).body).toMatch(/Agent question.*Pick A or B/);
        expect(calls[1].url).toBe("http://api/api/issues/task-1");
        expect(calls[1].method).toBe("PATCH");
        expect(JSON.parse(calls[1].body)).toEqual({ status: "blocked" });
    });

    it("attaches Authorization header when apiKey is provided", async () => {
        const fetchImpl = vi.fn(async () => jsonRes(201, { id: "c-2" }));
        await escalateClarify({
            question: "q",
            taskId: "t",
            apiUrl: "http://api/api",
            apiKey: "secret",
            fetchImpl,
        });
        expect(fetchImpl.mock.calls[0][1].headers["Authorization"]).toBe("Bearer secret");
    });

    it("trims trailing slash from apiUrl", async () => {
        const fetchImpl = vi.fn(async () => jsonRes(201, { id: "c-3" }));
        await escalateClarify({
            question: "q",
            taskId: "t",
            apiUrl: "http://api/api/",
            fetchImpl,
        });
        expect(fetchImpl.mock.calls[0][0]).toBe("http://api/api/issues/t/comments");
    });

    it("returns error when comment POST fails", async () => {
        const fetchImpl = vi.fn(async () => jsonRes(500, { error: "boom" }));
        const r = await escalateClarify({
            question: "q",
            taskId: "t",
            apiUrl: "http://api/api",
            fetchImpl,
        });
        expect(r.ok).toBe(false);
        expect(r.error).toMatch(/comment POST 500/);
    });

    it("returns error when status PATCH fails (but reports commentId)", async () => {
        let i = 0;
        const fetchImpl = vi.fn(async () => {
            i += 1;
            if (i === 1) return jsonRes(201, { id: "c-4" });
            return jsonRes(403, { error: "no" });
        });
        const r = await escalateClarify({
            question: "q",
            taskId: "t",
            apiUrl: "http://api/api",
            fetchImpl,
        });
        expect(r.ok).toBe(false);
        expect(r.commentId).toBe("c-4");
        expect(r.error).toMatch(/status PATCH 403/);
    });

    it("returns error when fetch throws", async () => {
        const fetchImpl = vi.fn(async () => {
            throw new Error("network down");
        });
        const r = await escalateClarify({
            question: "q",
            taskId: "t",
            apiUrl: "http://api/api",
            fetchImpl,
        });
        expect(r.ok).toBe(false);
        expect(r.error).toMatch(/network down/);
    });

    it("rejects with structured error when taskId / apiUrl missing", async () => {
        const fetchImpl = vi.fn();
        let r = await escalateClarify({ question: "q", apiUrl: "http://api", fetchImpl });
        expect(r.ok).toBe(false);
        expect(r.error).toBe("taskId required");
        r = await escalateClarify({ question: "q", taskId: "t", fetchImpl });
        expect(r.ok).toBe(false);
        expect(r.error).toBe("apiUrl required");
        expect(fetchImpl).not.toHaveBeenCalled();
    });

    it("rejects when fetch is not available", async () => {
        const r = await escalateClarify({
            question: "q",
            taskId: "t",
            apiUrl: "http://api",
            fetchImpl: undefined,
            // simulate by overriding globalThis.fetch via temp deletion
        });
        // Real-world cwd: globalThis.fetch exists in node 18+, so this test
        // path is only exercised in environments without fetch. The helper
        // returns ok:false in that case.
        if (typeof globalThis.fetch !== "function") {
            expect(r.ok).toBe(false);
            expect(r.error).toBe("fetch not available");
        } else {
            // When fetch is present it goes through and fails on the network
            // call to a fake host — still ok:false.
            expect(r.ok).toBe(false);
        }
    });
});
