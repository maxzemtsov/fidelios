import { isValidElement, useEffect, useId, useState, type ReactNode } from "react";
import Markdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "../lib/utils";
import { useTheme } from "../context/ThemeContext";
import { mentionChipInlineStyle, parseMentionChipHref } from "../lib/mention-chips";
import { FileViewerDialog } from "./FileViewerDialog";

interface MarkdownBodyProps {
  children: string;
  className?: string;
  /** Optional resolver for relative image paths (e.g. within export packages) */
  resolveImageSrc?: (src: string) => string | null;
  /**
   * When both `issueId` and `companyId` are provided, inline code that looks
   * like a filename becomes a clickable in-app file viewer (see FID comment
   * file viewer). Omit them to keep inline code rendered verbatim.
   */
  issueId?: string;
  companyId?: string;
}

// Filename-like inline code — a path ending in a letter-led extension (so version strings like `v1.2.3` are skipped).
const FILENAME_INLINE_CODE_RE = /^[\w.\-/]+\.[a-z][a-z0-9]{0,9}$/i;

let mermaidLoaderPromise: Promise<typeof import("mermaid").default> | null = null;

function loadMermaid() {
  if (!mermaidLoaderPromise) {
    mermaidLoaderPromise = import("mermaid").then((module) => module.default);
  }
  return mermaidLoaderPromise;
}

function flattenText(value: ReactNode): string {
  if (value == null) return "";
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (Array.isArray(value)) return value.map((item) => flattenText(item)).join("");
  return "";
}

// FID-43: Some clients (notably iOS keyboards in both Telegram and the
// FideliOS UI comment editor) emit trailing whitespace as numeric HTML
// entities (e.g. `&#x20;`, `&#xA0;`) which `react-markdown` intentionally
// does NOT decode — they survive the pipeline and render as literal text.
// We pre-normalize these whitespace entities (and consume an optional
// leading backslash from the markdown-escaped form `\&#x20;`) so the
// rendered output stays clean regardless of how the comment was authored.
//
// Scope is intentionally narrow — only whitespace entities — to avoid
// changing semantics for content that legitimately mentions `&#xNN;`.
const WHITESPACE_ENTITY_RE = /\\?&#(?:x(20|09|0[Aa]|0[Dd]|[Aa]0)|(32|9|10|13|160));/g;

export function decodeWhitespaceEntities(input: string): string {
  return input.replace(WHITESPACE_ENTITY_RE, (_match, hex: string | undefined, dec: string | undefined) => {
    const code = hex !== undefined ? parseInt(hex, 16) : parseInt(dec ?? "0", 10);
    return Number.isFinite(code) && code > 0 ? String.fromCharCode(code) : "";
  });
}

function extractMermaidSource(children: ReactNode): string | null {
  if (!isValidElement(children)) return null;
  const childProps = children.props as { className?: unknown; children?: ReactNode };
  if (typeof childProps.className !== "string") return null;
  if (!/\blanguage-mermaid\b/i.test(childProps.className)) return null;
  return flattenText(childProps.children).replace(/\n$/, "");
}

function MermaidDiagramBlock({ source, darkMode }: { source: string; darkMode: boolean }) {
  const renderId = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setSvg(null);
    setError(null);

    loadMermaid()
      .then(async (mermaid) => {
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "strict",
          theme: darkMode ? "dark" : "default",
          fontFamily: "inherit",
          suppressErrorRendering: true,
        });
        const rendered = await mermaid.render(`fidelios-mermaid-${renderId}`, source);
        if (!active) return;
        setSvg(rendered.svg);
      })
      .catch((err) => {
        if (!active) return;
        const message =
          err instanceof Error && err.message
            ? err.message
            : "Failed to render Mermaid diagram.";
        setError(message);
      });

    return () => {
      active = false;
    };
  }, [darkMode, renderId, source]);

  return (
    <div className="fidelios-mermaid">
      {svg ? (
        <div dangerouslySetInnerHTML={{ __html: svg }} />
      ) : (
        <>
          <p className={cn("fidelios-mermaid-status", error && "fidelios-mermaid-status-error")}>
            {error ? `Unable to render Mermaid diagram: ${error}` : "Rendering Mermaid diagram..."}
          </p>
          <pre className="fidelios-mermaid-source">
            <code className="language-mermaid">{source}</code>
          </pre>
        </>
      )}
    </div>
  );
}

export function MarkdownBody({
  children,
  className,
  resolveImageSrc,
  issueId,
  companyId,
}: MarkdownBodyProps) {
  const { theme } = useTheme();
  const [viewingPath, setViewingPath] = useState<string | null>(null);
  const fileViewerEnabled = Boolean(issueId && companyId);
  const components: Components = {
    pre: ({ node: _node, children: preChildren, ...preProps }) => {
      const mermaidSource = extractMermaidSource(preChildren);
      if (mermaidSource) {
        return <MermaidDiagramBlock source={mermaidSource} darkMode={theme === "dark"} />;
      }
      return <pre {...preProps}>{preChildren}</pre>;
    },
    code: ({ node: _node, className: codeClassName, children: codeChildren, ...codeProps }) => {
      // Fenced/indented code blocks carry a `language-*` class (when tagged)
      // and always render inside <pre>; only treat untagged single-token code
      // as a candidate inline file reference.
      const isBlockCode = typeof codeClassName === "string" && /\blanguage-/.test(codeClassName);
      const text = flattenText(codeChildren);
      if (
        fileViewerEnabled &&
        !isBlockCode &&
        !text.includes("\n") &&
        FILENAME_INLINE_CODE_RE.test(text.trim()) &&
        !text.includes("://")
      ) {
        return (
          <button
            type="button"
            className="fidelios-file-ref"
            onClick={() => setViewingPath(text.trim())}
          >
            {codeChildren}
          </button>
        );
      }
      return (
        <code {...codeProps} className={codeClassName}>
          {codeChildren}
        </code>
      );
    },
    a: ({ href, children: linkChildren }) => {
      const parsed = href ? parseMentionChipHref(href) : null;
      if (parsed) {
        const targetHref = parsed.kind === "project"
          ? `/projects/${parsed.projectId}`
          : `/agents/${parsed.agentId}`;
        return (
          <a
            href={targetHref}
            className={cn(
              "fidelios-mention-chip",
              `fidelios-mention-chip--${parsed.kind}`,
              parsed.kind === "project" && "fidelios-project-mention-chip",
            )}
            data-mention-kind={parsed.kind}
            style={mentionChipInlineStyle(parsed)}
          >
            {linkChildren}
          </a>
        );
      }
      return (
        <a href={href} rel="noreferrer">
          {linkChildren}
        </a>
      );
    },
  };
  if (resolveImageSrc) {
    components.img = ({ node: _node, src, alt, ...imgProps }) => {
      const resolved = src ? resolveImageSrc(src) : null;
      return <img {...imgProps} src={resolved ?? src} alt={alt ?? ""} />;
    };
  }

  return (
    <>
      <div
        className={cn(
          "fidelios-markdown prose prose-sm max-w-none break-words overflow-hidden",
          theme === "dark" && "prose-invert",
          className,
        )}
      >
        <Markdown remarkPlugins={[remarkGfm]} components={components} urlTransform={(url) => url}>
          {decodeWhitespaceEntities(children)}
        </Markdown>
      </div>
      {fileViewerEnabled && viewingPath ? (
        <FileViewerDialog
          companyId={companyId as string}
          issueId={issueId as string}
          path={viewingPath}
          open={viewingPath !== null}
          onOpenChange={(next) => {
            if (!next) setViewingPath(null);
          }}
        />
      ) : null}
    </>
  );
}

