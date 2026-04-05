/**
 * Copy as Markdown — injected on every page by Mintlify.
 *
 * Adds a "Copy as Markdown" button after the page <h1>.
 * When clicked, extracts the article content, converts it to clean
 * Markdown, and writes it to the clipboard. Ideal for LLM / agent use.
 *
 * Inspired by the Neon docs UX pattern.
 */
(function () {
  'use strict';

  var BUTTON_ID = 'fidelios-copy-md-btn';

  // ---------------------------------------------------------------------------
  // DOM → Markdown converter
  // ---------------------------------------------------------------------------
  function domToMarkdown(root) {
    var lines = [];

    var SKIP_TAGS = new Set([
      'script', 'style', 'nav', 'aside', 'footer',
      'button', 'head', 'noscript',
    ]);

    function walk(node) {
      if (node.nodeType === 3 /* TEXT_NODE */) {
        var t = node.textContent.trim();
        if (t) lines.push(t);
        return;
      }
      if (node.nodeType !== 1 /* ELEMENT_NODE */) return;

      var tag = node.tagName.toLowerCase();
      if (SKIP_TAGS.has(tag)) return;

      var hMatch = tag.match(/^h([1-6])$/);
      if (hMatch) {
        lines.push('\n' + '#'.repeat(Number(hMatch[1])) + ' ' + node.textContent.trim() + '\n');
        return;
      }

      if (tag === 'pre') {
        var codeEl = node.querySelector('code');
        var langMatch = codeEl && codeEl.className.match(/language-(\w+)/);
        var lang = langMatch ? langMatch[1] : '';
        var content = (codeEl || node).textContent.trim();
        lines.push('\n```' + lang + '\n' + content + '\n```\n');
        return;
      }

      if (tag === 'li') {
        var parentTag = node.parentElement && node.parentElement.tagName.toLowerCase();
        if (parentTag === 'ol') {
          var idx = Array.prototype.indexOf.call(node.parentElement.children, node) + 1;
          lines.push(idx + '. ' + node.textContent.trim());
        } else {
          lines.push('- ' + node.textContent.trim());
        }
        return;
      }

      if (tag === 'tr') {
        var cells = Array.prototype.slice.call(node.querySelectorAll('th,td'))
          .map(function (c) { return c.textContent.trim(); })
          .join(' | ');
        if (cells) lines.push('| ' + cells + ' |');
        return;
      }

      if (tag === 'p') {
        lines.push('\n' + node.textContent.trim() + '\n');
        return;
      }

      if (tag === 'blockquote') {
        lines.push('\n> ' + node.textContent.trim() + '\n');
        return;
      }

      if (tag === 'hr') {
        lines.push('\n---\n');
        return;
      }

      // containers: recurse into children
      node.childNodes.forEach(walk);
    }

    root.childNodes.forEach(walk);

    return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  }

  // ---------------------------------------------------------------------------
  // Build the Markdown string for the current page
  // ---------------------------------------------------------------------------
  function getMarkdown() {
    var article =
      document.querySelector('article') ||
      document.querySelector('.prose') ||
      document.querySelector('main');
    if (!article) return '';

    var clone = article.cloneNode(true);

    // Remove the button itself so it doesn't appear in the copied content
    var existing = clone.querySelector('#' + BUTTON_ID);
    if (existing) existing.parentNode.removeChild(existing);

    var md = domToMarkdown(clone);
    return 'Source: ' + window.location.href + '\n\n' + md;
  }

  // ---------------------------------------------------------------------------
  // Button element
  // ---------------------------------------------------------------------------
  function createButton() {
    var btn = document.createElement('button');
    btn.id = BUTTON_ID;

    var icon =
      '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" ' +
      'stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">' +
      '<rect width="14" height="14" x="8" y="8" rx="2" ry="2"/>' +
      '<path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>' +
      '</svg>';

    var span = document.createElement('span');
    span.textContent = 'Copy as Markdown';

    btn.insertAdjacentHTML('afterbegin', icon);
    btn.appendChild(span);

    btn.style.cssText = [
      'display:inline-flex',
      'align-items:center',
      'gap:5px',
      'padding:5px 10px',
      'font-size:12px',
      'font-weight:500',
      'color:#6b7280',
      'background:transparent',
      'border:1px solid #e5e7eb',
      'border-radius:6px',
      'cursor:pointer',
      'transition:color .15s,border-color .15s',
      'font-family:inherit',
      'line-height:1.4',
    ].join(';');

    btn.addEventListener('mouseenter', function () {
      if (btn.dataset.state !== 'copied') {
        btn.style.color = '#2563EB';
        btn.style.borderColor = '#2563EB';
      }
    });
    btn.addEventListener('mouseleave', function () {
      if (btn.dataset.state !== 'copied') {
        btn.style.color = '#6b7280';
        btn.style.borderColor = '#e5e7eb';
      }
    });

    btn.addEventListener('click', function () {
      var md = getMarkdown();

      function onCopied() {
        btn.dataset.state = 'copied';
        span.textContent = '✓ Copied';
        btn.style.color = '#16a34a';
        btn.style.borderColor = '#86efac';
        setTimeout(function () {
          delete btn.dataset.state;
          span.textContent = 'Copy as Markdown';
          btn.style.color = '#6b7280';
          btn.style.borderColor = '#e5e7eb';
        }, 2000);
      }

      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(md).then(onCopied).catch(function () {
          fallbackCopy(md);
          onCopied();
        });
      } else {
        fallbackCopy(md);
        onCopied();
      }
    });

    return btn;
  }

  function fallbackCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;pointer-events:none';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch (e) { /* ignore */ }
    document.body.removeChild(ta);
  }

  // ---------------------------------------------------------------------------
  // Inject button into the page
  // ---------------------------------------------------------------------------
  function injectButton() {
    if (document.getElementById(BUTTON_ID)) return;

    var article =
      document.querySelector('article') ||
      document.querySelector('.prose') ||
      document.querySelector('main');
    if (!article) return;

    var btn = createButton();
    var wrapper = document.createElement('div');
    wrapper.style.cssText = 'display:flex;justify-content:flex-end;margin-bottom:8px;';
    wrapper.appendChild(btn);

    var h1 = article.querySelector('h1');
    if (h1) {
      h1.insertAdjacentElement('afterend', wrapper);
    } else {
      article.insertBefore(wrapper, article.firstChild);
    }
  }

  // ---------------------------------------------------------------------------
  // Init — handle both initial load and Mintlify SPA navigation
  // ---------------------------------------------------------------------------
  function init() {
    injectButton();

    // Re-inject after client-side navigation (Mintlify replaces article content)
    var observer = new MutationObserver(function () {
      if (!document.getElementById(BUTTON_ID)) {
        injectButton();
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
