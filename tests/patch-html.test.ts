import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

import {afterAll, describe, expect, it} from 'vitest'

import {
  parseHtml,
  patchHtml,
  patchHtmlNested,
  serializeHtml,
  setAssetReference
} from '../src/index'

import type {PatchWarning} from '../src/index'

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'p5ap-patch-'))

afterAll(() => {
  fs.rmSync(tmpRoot, {recursive: true, force: true})
})

function makeTmp (name: string) {
  const tmp = path.join(tmpRoot, name)

  fs.rmSync(tmp, {recursive: true, force: true})
  fs.mkdirSync(tmp, {recursive: true})

  return tmp
}

describe('patchHtml', () => {
  it('removes non-public script/link and injects bundle tags', () => {
    const tmp = makeTmp('patch')
    const htmlPath = path.join(tmp, 'index.html')

    fs.writeFileSync(
      htmlPath,
      '<html><head><link rel="stylesheet" href="a.css"></head><body><script src="a.js"></script></body></html>'
    )
    const updated = patchHtml(htmlPath, 'feature/index', {
      includeList: {'feature/index': htmlPath}
    })

    expect(updated).toContain('href="/feature/index.css"')
    expect(updated).toContain('src="/feature/index.js"')
    expect(updated).not.toContain('href="a.css"')
    expect(updated).not.toContain('src="a.js"')
  })

  it('keeps public-root absolute assets as-is', () => {
    const tmp = makeTmp('public')
    const htmlPath = path.join(tmp, 'index.html')

    fs.writeFileSync(
      htmlPath,
      '<html><head><link rel="stylesheet" href="/public/missing.css"></head><body><script src="/public/missing.js"></script></body></html>'
    )
    const updated = patchHtml(htmlPath, 'feature/index', {
      includeList: {'feature/index': htmlPath}
    })

    expect(updated).toContain('href="/public/missing.css"')
    expect(updated).toContain('src="/public/missing.js"')
    // No relative scripts/styles found, so no bundle tags are injected
    expect(updated).not.toContain('href="/feature/index.css"')
    expect(updated).not.toContain('src="/feature/index.js"')
  })

  it('rewrites relative static asset to assets/... and preserves ?query/#hash', () => {
    const tmp = makeTmp('queryhash')
    const htmlFilePath = path.join(tmp, 'index.html')
    const imageDirectoryPath = path.join(tmp, 'img')

    fs.mkdirSync(imageDirectoryPath, {recursive: true})

    const imageFilePath = path.join(imageDirectoryPath, 'a.png')

    fs.writeFileSync(imageFilePath, 'x')

    fs.writeFileSync(
      htmlFilePath,
      '<html><head></head><body><img src="img/a.png?x=1#h"></body></html>',
      'utf8'
    )

    const updatedHtml = patchHtml(htmlFilePath, 'feature/index', {
      includeList: {'feature/index': htmlFilePath}
    })

    expect(updatedHtml).toContain('src="/assets/img/a.png?x=1#h"')
  })

  it('preserves query/hash for public-root absolute URLs as-is', () => {
    const tmp = makeTmp('public-queryhash')
    const htmlFilePath = path.join(tmp, 'index.html')

    fs.writeFileSync(
      htmlFilePath,
      '<html><head><link rel="stylesheet" href="/public/x.css?ver=123#sec"></head><body><script src="/public/x.js?v=1#h"></script></body></html>',
      'utf8'
    )

    const updatedHtml = patchHtml(htmlFilePath, 'feature/index', {
      includeList: {'feature/index': htmlFilePath}
    })

    expect(updatedHtml).toContain('href="/public/x.css?ver=123#sec"')
    expect(updatedHtml).toContain('src="/public/x.js?v=1#h"')
  })

  it('injects the bundle script when alwaysInjectScript is set, even with no scripts in HTML', () => {
    const tmp = makeTmp('always-inject')
    const htmlPath = path.join(tmp, 'index.html')

    fs.writeFileSync(htmlPath, '<html><head></head><body></body></html>')
    const updated = patchHtml(htmlPath, 'feature/index', {
      alwaysInjectScript: true
    })

    expect(updated).toContain('src="/feature/index.js"')
  })

  it('honors cssHref/scriptSrc overrides and hasCssEntry', () => {
    const tmp = makeTmp('overrides')
    const htmlPath = path.join(tmp, 'index.html')

    fs.writeFileSync(
      htmlPath,
      '<html><head></head><body><script src="a.js"></script></body></html>'
    )
    const updated = patchHtml(htmlPath, 'feature/index', {
      hasCssEntry: true,
      cssHref: '/chunks/split.css',
      scriptSrc: '/runtime/main.js'
    })

    expect(updated).toContain('href="/chunks/split.css"')
    expect(updated).toContain('src="/runtime/main.js"')
  })

  it('propagates type/defer/async from the first removed script', () => {
    const tmp = makeTmp('script-attrs')
    const htmlPath = path.join(tmp, 'index.html')

    fs.writeFileSync(
      htmlPath,
      '<html><head></head><body><script type="module" defer="" src="a.js"></script></body></html>'
    )
    const updated = patchHtml(htmlPath, 'feature/index')

    expect(updated).toContain('src="/feature/index.js"')
    expect(updated).toContain('type="module"')
    expect(updated).toContain('defer')
  })
})

describe('patchHtmlNested', () => {
  it('preserves script/link tags and rewrites existing static assets', () => {
    const tmp = makeTmp('nested')

    fs.mkdirSync(path.join(tmp, 'img'), {recursive: true})
    fs.writeFileSync(path.join(tmp, 'img', 'a.png'), 'x')
    const htmlPath = path.join(tmp, 'page.html')

    fs.writeFileSync(
      htmlPath,
      '<html><head><link rel="stylesheet" href="a.css"></head><body><script src="a.js"></script><img src="img/a.png"></body></html>'
    )
    const updated = patchHtmlNested(htmlPath)

    expect(updated).toContain('href="a.css"')
    expect(updated).toContain('src="a.js"')
    expect(updated).toContain('src="/assets/img/a.png"')
  })

  it('warns about missing public-root assets via onWarning', () => {
    const tmp = makeTmp('nested-warn')
    const pagesDir = path.join(tmp, 'pages')

    fs.mkdirSync(pagesDir, {recursive: true})
    const htmlPath = path.join(pagesDir, 'page.html')

    fs.writeFileSync(
      htmlPath,
      '<html><head></head><body><img src="/missing.png"></body></html>'
    )
    const warnings: PatchWarning[] = []
    const updated = patchHtmlNested(htmlPath, {
      onWarning: (warning) => warnings.push(warning)
    })

    expect(updated).toContain('src="/missing.png"')
    expect(warnings).toHaveLength(1)
    expect(warnings[0].file).toBe(htmlPath)
    expect(warnings[0].assetPath).toBe('/missing.png')
    expect(warnings[0].message).toContain('Missing asset')
  })

  it('does not warn when the public-root asset exists', () => {
    const tmp = makeTmp('nested-nowarn')
    const pagesDir = path.join(tmp, 'pages')

    fs.mkdirSync(path.join(tmp, 'public'), {recursive: true})
    fs.mkdirSync(pagesDir, {recursive: true})
    fs.writeFileSync(path.join(tmp, 'public', 'logo.png'), 'x')
    const htmlPath = path.join(pagesDir, 'page.html')

    fs.writeFileSync(
      htmlPath,
      '<html><head></head><body><img src="/logo.png"></body></html>'
    )
    const warnings: PatchWarning[] = []

    patchHtmlNested(htmlPath, {
      onWarning: (warning) => warnings.push(warning)
    })
    expect(warnings).toHaveLength(0)
  })
})

describe('setAssetReference', () => {
  it('sets src for script/staticSrc and href for css/staticHref', () => {
    const doc = parseHtml(
      '<html><head><link rel="stylesheet" href="a.css"></head><body><img src="a.png"></body></html>'
    )

    const html = doc.childNodes?.find((n) => n.nodeName === 'html')
    const head = html?.childNodes?.find((n) => n.nodeName === 'head')
    const body = html?.childNodes?.find((n) => n.nodeName === 'body')
    const link = head?.childNodes?.find((n) => n.nodeName === 'link')
    const img = body?.childNodes?.find((n) => n.nodeName === 'img')

    if (!link || !img) throw new Error('Fixture nodes not found')

    setAssetReference(link, 'css', '/styles/b.css')
    setAssetReference(img, 'staticSrc', '/assets/b.png?v=2')

    const out = serializeHtml(doc)

    expect(out).toContain('href="/styles/b.css"')
    expect(out).toContain('src="/assets/b.png?v=2"')
  })
})
