// @vitest-environment node

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { buildAgentMentionHref, buildProjectMentionHref } from "@fideliosai/shared";
import { ThemeProvider } from "../context/ThemeContext";
import { MarkdownBody, decodeWhitespaceEntities } from "./MarkdownBody";

describe("MarkdownBody", () => {
  it("renders markdown images without a resolver", () => {
    const html = renderToStaticMarkup(
      <ThemeProvider>
        <MarkdownBody>{"![](/api/attachments/test/content)"}</MarkdownBody>
      </ThemeProvider>,
    );

    expect(html).toContain('<img src="/api/attachments/test/content" alt=""/>');
  });

  it("resolves relative image paths when a resolver is provided", () => {
    const html = renderToStaticMarkup(
      <ThemeProvider>
        <MarkdownBody resolveImageSrc={(src) => `/resolved/${src}`}>
          {"![Org chart](images/org-chart.png)"}
        </MarkdownBody>
      </ThemeProvider>,
    );

    expect(html).toContain('src="/resolved/images/org-chart.png"');
    expect(html).toContain('alt="Org chart"');
  });

  // FID-43: numeric whitespace HTML entities (`&#x20;`, `\&#x20;`, `&#xA0;`,
  // ...) leak through `react-markdown` and render as literal text. The
  // render-side normalizer in MarkdownBody is the catch-all fix that covers
  // every authoring path (Telegram, UI editor, paste from iOS, etc.).
  describe("FID-43: decodes whitespace HTML entities at render", () => {
    it("strips a literal `&#x20;` so it does not appear in rendered output", () => {
      const html = renderToStaticMarkup(
        <ThemeProvider>
          <MarkdownBody>{"hello&#x20;world"}</MarkdownBody>
        </ThemeProvider>,
      );
      expect(html).not.toContain("&amp;#x20;");
      expect(html).not.toContain("&#x20;");
      expect(html).toContain("hello world");
    });

    it("strips the markdown-escaped `\\&#x20;` form (the FID-39 c76450dd shape)", () => {
      const html = renderToStaticMarkup(
        <ThemeProvider>
          <MarkdownBody>{"plan revision\\&#x20;done"}</MarkdownBody>
        </ThemeProvider>,
      );
      expect(html).not.toContain("&amp;#x20;");
      expect(html).not.toContain("\\&");
      expect(html).toContain("plan revision done");
    });
  });

  it("renders agent and project mentions as chips", () => {
    const html = renderToStaticMarkup(
      <ThemeProvider>
        <MarkdownBody>
          {`[@CodexCoder](${buildAgentMentionHref("agent-123", "code")}) [@FideliOS App](${buildProjectMentionHref("project-456", "#336699")})`}
        </MarkdownBody>
      </ThemeProvider>,
    );

    expect(html).toContain('href="/agents/agent-123"');
    expect(html).toContain('data-mention-kind="agent"');
    expect(html).toContain("--fidelios-mention-icon-mask");
    expect(html).toContain('href="/projects/project-456"');
    expect(html).toContain('data-mention-kind="project"');
    expect(html).toContain("--fidelios-mention-project-color:#336699");
  });
});

describe("decodeWhitespaceEntities (FID-43)", () => {
  it("decodes hex and decimal space entities", () => {
    expect(decodeWhitespaceEntities("a&#x20;b")).toBe("a b");
    expect(decodeWhitespaceEntities("a&#32;b")).toBe("a b");
  });

  it("consumes the optional leading backslash from `\\&#x20;`", () => {
    expect(decodeWhitespaceEntities("a\\&#x20;b")).toBe("a b");
  });

  it("decodes non-breaking space, tab, LF, and CR entities", () => {
    expect(decodeWhitespaceEntities("a&#xA0;b")).toBe("a\u00A0b");
    expect(decodeWhitespaceEntities("a&#xa0;b")).toBe("a\u00A0b");
    expect(decodeWhitespaceEntities("a&#160;b")).toBe("a\u00A0b");
    expect(decodeWhitespaceEntities("a&#x09;b")).toBe("a\tb");
    expect(decodeWhitespaceEntities("a&#x0A;b")).toBe("a\nb");
    expect(decodeWhitespaceEntities("a&#x0D;b")).toBe("a\rb");
  });

  it("preserves non-whitespace numeric entities verbatim", () => {
    // Narrow scope: comments that legitimately mention `&#x41;` (A) or
    // similar are NOT touched.
    expect(decodeWhitespaceEntities("M&#x26;Ms")).toBe("M&#x26;Ms");
    expect(decodeWhitespaceEntities("char &#x41; here")).toBe("char &#x41; here");
  });

  it("is a no-op for plain strings", () => {
    expect(decodeWhitespaceEntities("plain text")).toBe("plain text");
    expect(decodeWhitespaceEntities("")).toBe("");
  });
});
