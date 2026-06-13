import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { extractAssets, parseHtml, visitHtmlAssets } from '../src/index';
import type { AssetReference } from '../src/index';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'parse5-asset-patcher-'));

afterAll(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe('extractAssets', () => {
  it('returns empty when file missing', () => {
    const res = extractAssets(path.join(tmp, 'missing.html'));
    expect(res).toEqual({ css: [], js: [], static: [] });
  });

  it('returns empty when no path given', () => {
    expect(extractAssets(undefined)).toEqual({ css: [], js: [], static: [] });
  });

  it('extracts js, css, and static with base href and preserves public-root', () => {
    const html = `
		<html>
		<head>
		  <base href="/root/">
		  <link rel="stylesheet" href="styles.css">
		  <link rel="icon" href="/public/favicon.png">
		</head>
		<body>
		  <script src="main.js"></script>
		  <img src="/public/logo.png">
		</body>
		</html>
		`;
    const htmlPath = path.join(tmp, 'index.html');
    fs.writeFileSync(htmlPath, html, 'utf8');
    const res = extractAssets(htmlPath);
    const baseDir = path.join(tmp, 'root');
    expect(res.js).toEqual([path.join(baseDir, 'main.js')]);
    expect(res.css).toEqual([path.join(baseDir, 'styles.css')]);
    expect(res.static).toEqual(['/public/favicon.png', '/public/logo.png']);
  });

  it('collects <link> imagesrcset candidates as static assets', () => {
    const html = `
		<html>
		<head>
		  <link rel="preload" as="image" imagesrcset="hero.png 1x, hero-2x.png 2x">
		</head>
		<body></body>
		</html>
		`;
    const dir = path.join(tmp, 'imgset');
    fs.mkdirSync(dir, { recursive: true });
    const htmlPath = path.join(dir, 'index.html');
    fs.writeFileSync(htmlPath, html, 'utf8');
    const res = extractAssets(htmlPath);
    expect(res.static).toEqual([
      path.join(dir, 'hero.png'),
      path.join(dir, 'hero-2x.png'),
    ]);
  });

  it('extracts a representative fixture: scripts, css, img src, srcset, poster', () => {
    const html = `
		<html>
		<head>
		  <link rel="stylesheet" href="css/app.css">
		  <link rel="icon" href="icons/favicon.ico">
		</head>
		<body>
		  <script src="js/app.js"></script>
		  <script src="https://cdn.example.com/remote.js"></script>
		  <img src="img/photo.png" srcset="img/photo.png 1x, img/photo-2x.png 2x">
		  <video src="media/movie.mp4" poster="img/poster.jpg"></video>
		  <iframe src="frames/embed.html"></iframe>
		</body>
		</html>
		`;
    const dir = path.join(tmp, 'fixture');
    fs.mkdirSync(dir, { recursive: true });
    const htmlPath = path.join(dir, 'index.html');
    fs.writeFileSync(htmlPath, html, 'utf8');

    const res = extractAssets(htmlPath);

    expect(res.js).toEqual([path.join(dir, 'js/app.js')]);
    expect(res.css).toEqual([path.join(dir, 'css/app.css')]);
    // remote script is skipped entirely
    expect(res.js.some((p) => p.includes('remote.js'))).toBe(false);
    expect(res.static).toEqual([
      path.join(dir, 'icons/favicon.ico'),
      // img src + both srcset candidates
      path.join(dir, 'img/photo.png'),
      path.join(dir, 'img/photo.png'),
      path.join(dir, 'img/photo-2x.png'),
      // video src + poster
      path.join(dir, 'media/movie.mp4'),
      path.join(dir, 'img/poster.jpg'),
      // iframe src
      path.join(dir, 'frames/embed.html'),
    ]);
  });

  it('accepts in-memory html content', () => {
    const res = extractAssets(
      path.join(tmp, 'virtual.html'),
      '<html><body><script src="a.js"></script></body></html>',
    );
    expect(res.js).toEqual([path.join(tmp, 'a.js')]);
  });
});

describe('visitHtmlAssets', () => {
  it('reports asset types for each reference', () => {
    const doc = parseHtml(
      `<html><head><link rel="stylesheet" href="a.css"></head>` +
        `<body><script src="a.js"></script><img src="a.png"></body></html>`,
    );
    const found: Array<Pick<AssetReference, 'filePath' | 'assetType'>> = [];
    visitHtmlAssets(doc, ({ filePath, assetType }) => {
      found.push({ filePath, assetType });
    });
    expect(found).toEqual([
      { filePath: 'a.css', assetType: 'css' },
      { filePath: 'a.js', assetType: 'script' },
      { filePath: 'a.png', assetType: 'staticSrc' },
    ]);
  });
});
