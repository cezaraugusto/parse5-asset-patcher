import * as parse5utilities from 'parse5-utilities'

import {cleanAssetUrl, isUrl} from './utils'

import type {AssetReference, HtmlNode} from './types'

/**
 * Parses an HTML string into a parse5 document (or fragment, when the
 * string is not a full document). Thin wrapper over `parse5-utilities`.
 */
export function parseHtml (html: string): HtmlNode {
  return parse5utilities.parse(html) as unknown as HtmlNode
}

/**
 * Serializes a parse5 node (document, fragment, or element) back to an
 * HTML string.
 */
export function serializeHtml (node: HtmlNode): string {
  // Biome-ignore lint/suspicious/noExplicitAny: parse5-utilities expects its own node union
  return parse5utilities.stringify(node as any)
}

/**
 * Recursively walks an HTML tree and invokes `onAssetFound` for every
 * local asset reference it finds:
 *
 * - `<script src>` → `script`
 * - `<link rel="stylesheet" href>` → `css`
 * - `<link>` with non-stylesheet rel (icon, manifest, preload, prefetch,
 *   preconnect, dns-prefetch, modulepreload, prerender) → `staticHref`
 * - `<link imagesrcset>` candidates → `staticHref`
 * - `src` of audio/embed/iframe/img/input/source/track/video → `staticSrc`
 * - `srcset` candidates → `staticSrc`
 * - `<video poster>` → `staticSrc`
 *
 * Absolute URLs (`https://...` etc.) are skipped; only local references
 * are reported.
 *
 * @param node – Any parse5 node (document, `<head>`, `<body>`, element).
 * @param onAssetFound – Callback invoked once per discovered reference.
 */
export function visitHtmlAssets (
  node: HtmlNode,
  onAssetFound: (reference: AssetReference) => void
): void {
  // Skip comment and text nodes
  if (node.nodeName === '#comment' || node.nodeName === '#text') {
    return
  }

  // Handle the current node first
  if (node.nodeName === 'script') {
    const src = node.attrs?.find((attr) => attr.name === 'src')?.value

    // Some scripts have no src
    if (!src) return

    // Do nothing for urls
    if (isUrl(src)) return

    onAssetFound({
      filePath: src,
      childNode: node,
      assetType: 'script'
    })
  } else if (node.nodeName === 'link') {
    const href = node.attrs?.find((attr) => attr.name === 'href')?.value
    const rel = node.attrs?.find((attr) => attr.name === 'rel')?.value
    const imagesrcset = node.attrs?.find(
      (attr) => attr.name === 'imagesrcset'
    )?.value

    if (imagesrcset) {
      for (const candidate of imagesrcset.split(',')) {
        const url = candidate.trim().split(/\s+/)[0]

        if (!url) continue

        const {cleanPath} = cleanAssetUrl(url)

        if (cleanPath && !isUrl(cleanPath)) {
          onAssetFound({
            filePath: cleanPath,
            childNode: node,
            assetType: 'staticHref'
          })
        }
      }
    }

    // Some links have no href
    if (!href) return

    // Do nothing for urls
    if (isUrl(href)) return

    // Assume users ignored the "stylesheet" attribute,
    // but ensure it's not an icon or something else.
    // See https://developer.mozilla.org/en-US/docs/Web/HTML/Link_types.
    if (
      rel === 'dns-prefetch' ||
      rel === 'icon' ||
      rel === 'manifest' ||
      rel === 'modulepreload' ||
      rel === 'preconnect' ||
      rel === 'prefetch' ||
      rel === 'preload' ||
      rel === 'prerender'
    ) {
      onAssetFound({
        filePath: href,
        childNode: node,
        assetType: 'staticHref'
      })
    } else {
      onAssetFound({
        filePath: href,
        childNode: node,
        assetType: 'css'
      })
    }
  } else if (
    node.nodeName === 'audio' ||
    node.nodeName === 'embed' ||
    node.nodeName === 'iframe' ||
    node.nodeName === 'img' ||
    node.nodeName === 'input' ||
    node.nodeName === 'source' ||
    node.nodeName === 'track' ||
    node.nodeName === 'video'
  ) {
    // Static assets with src attribute
    const src = node.attrs?.find((attr) => attr.name === 'src')?.value

    // Some elements have no src
    if (!src) return

    // Do nothing for urls
    if (isUrl(src)) return

    onAssetFound({
      filePath: src,
      childNode: node,
      assetType: 'staticSrc'
    })

    // Handle srcset for responsive images and sources
    const srcset = node.attrs?.find((attr) => attr.name === 'srcset')?.value

    if (srcset) {
      // Format: "image1.png 1x, image2.png 2x" or with widths
      const candidates = srcset.split(',')

      for (const candidate of candidates) {
        const parts = candidate.trim().split(/\s+/)
        const url = parts[0]

        if (!url) continue

        const {cleanPath} = cleanAssetUrl(url)

        if (cleanPath && !isUrl(cleanPath)) {
          onAssetFound({
            filePath: cleanPath,
            childNode: node,
            assetType: 'staticSrc'
          })
        }
      }
    }

    // Handle video poster
    if (node.nodeName === 'video') {
      const poster = node.attrs?.find((attr) => attr.name === 'poster')?.value

      if (poster && !isUrl(poster)) {
        const {cleanPath} = cleanAssetUrl(poster)

        if (cleanPath) {
          onAssetFound({
            filePath: cleanPath,
            childNode: node,
            assetType: 'staticSrc'
          })
        }
      }
    }
  }

  // Then handle child nodes recursively
  const {childNodes = []} = node

  for (const childNode of childNodes) {
    // Skip comment and text nodes
    if (childNode.nodeName === '#comment' || childNode.nodeName === '#text') {
      continue
    }

    visitHtmlAssets(childNode, onAssetFound)
  }
}
