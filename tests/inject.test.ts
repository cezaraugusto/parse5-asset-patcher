import { describe, expect, it } from 'vitest';
import {
  injectScript,
  injectStylesheet,
  parseHtml,
  serializeHtml,
} from '../src/index';
import type { HtmlNode } from '../src/index';

function findNode(doc: HtmlNode, name: string): HtmlNode {
  const html = doc.childNodes?.find((n) => n.nodeName === 'html');
  const node = html?.childNodes?.find((n) => n.nodeName === name);
  if (!node) throw new Error(`Node not found: ${name}`);
  return node;
}

describe('injectScript', () => {
  it('appends a script tag with the given src', () => {
    const doc = parseHtml('<html><head></head><body></body></html>');
    injectScript(findNode(doc, 'body'), '/feature/index.js');
    expect(serializeHtml(doc)).toContain(
      '<script src="/feature/index.js"></script>',
    );
  });

  it('propagates only type/defer/async from inherited attrs', () => {
    const doc = parseHtml('<html><head></head><body></body></html>');
    injectScript(findNode(doc, 'body'), '/a.js', [
      { name: 'type', value: 'module' },
      { name: 'defer', value: '' },
      { name: 'data-custom', value: 'nope' },
      { name: 'src', value: 'should-not-override.js' },
    ]);
    const out = serializeHtml(doc);
    expect(out).toContain('src="/a.js"');
    expect(out).toContain('type="module"');
    expect(out).toContain('defer');
    expect(out).not.toContain('data-custom');
    expect(out).not.toContain('should-not-override.js');
  });
});

describe('injectStylesheet', () => {
  it('appends a stylesheet link with the given href', () => {
    const doc = parseHtml('<html><head></head><body></body></html>');
    injectStylesheet(findNode(doc, 'head'), '/feature/index.css');
    expect(serializeHtml(doc)).toContain(
      '<link rel="stylesheet" href="/feature/index.css">',
    );
  });

  it('propagates only known link attrs from inherited attrs', () => {
    const doc = parseHtml('<html><head></head><body></body></html>');
    injectStylesheet(findNode(doc, 'head'), '/a.css', [
      { name: 'media', value: 'print' },
      { name: 'integrity', value: 'sha384-abc' },
      { name: 'onload', value: 'alert(1)' },
    ]);
    const out = serializeHtml(doc);
    expect(out).toContain('href="/a.css"');
    expect(out).toContain('media="print"');
    expect(out).toContain('integrity="sha384-abc"');
    expect(out).not.toContain('onload');
  });
});
