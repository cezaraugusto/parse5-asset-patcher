import { describe, expect, it } from 'vitest';
import {
  cleanAssetUrl,
  getBaseHref,
  isHttpLike,
  isSpecialScheme,
  isUrl,
  parseHtml,
} from '../src/index';

describe('cleanAssetUrl', () => {
  it('splits path, query and hash', () => {
    const r1 = cleanAssetUrl('img/a.png?x=1#h');
    expect(r1).toEqual({ cleanPath: 'img/a.png', search: '?x=1', hash: '#h' });
    const r2 = cleanAssetUrl('img/a.png#h?ignored');
    expect(r2).toEqual({
      cleanPath: 'img/a.png',
      search: '',
      hash: '#h?ignored',
    });
    const r3 = cleanAssetUrl('img/a.png');
    expect(r3).toEqual({ cleanPath: 'img/a.png', search: '', hash: '' });
  });
});

describe('isUrl', () => {
  it('detects absolute urls', () => {
    expect(isUrl('https://x.com')).toBe(true);
    expect(isUrl('http://x.com')).toBe(true);
    expect(isUrl('/x.png')).toBe(false);
    expect(isUrl('x.png')).toBe(false);
  });
});

describe('isHttpLike', () => {
  it('detects http(s) and protocol-relative urls', () => {
    expect(isHttpLike('https://x.com')).toBe(true);
    expect(isHttpLike('http://x.com')).toBe(true);
    expect(isHttpLike('//cdn.x.com/a.js')).toBe(true);
    expect(isHttpLike('img/a.png')).toBe(false);
  });
});

describe('isSpecialScheme', () => {
  it('detects non-fetchable schemes', () => {
    expect(isSpecialScheme('data:image/png;base64,xyz')).toBe(true);
    expect(isSpecialScheme('blob:abc')).toBe(true);
    expect(isSpecialScheme('javascript:void(0)')).toBe(true);
    expect(isSpecialScheme('about:blank')).toBe(true);
    expect(isSpecialScheme('chrome-extension://id/a.js')).toBe(true);
    expect(isSpecialScheme('https://x.com')).toBe(false);
    expect(isSpecialScheme('img/a.png')).toBe(false);
  });
});

describe('getBaseHref', () => {
  it('returns <base href> when present', () => {
    const doc = parseHtml(
      '<html><head><base href="/sub/"></head><body></body></html>',
    );
    expect(getBaseHref(doc)).toBe('/sub/');
    const doc2 = parseHtml('<html><head></head><body></body></html>');
    expect(getBaseHref(doc2)).toBeUndefined();
  });
});
