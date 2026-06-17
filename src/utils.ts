import * as path from 'node:path'

import type {FilepathList, HtmlNode} from './types'

/**
 * Returns `true` when `src` is an absolute URL (has a scheme parseable by
 * the WHATWG `URL` constructor, e.g. `https://...`, `data:...`).
 */
export function isUrl (src: string): boolean {
  try {
    new URL(src)

    return true
  } catch {
    return false
  }
}

/**
 * Returns `true` for `http://`, `https://`, and protocol-relative (`//...`)
 * URLs.
 */
export function isHttpLike (inputUrl: string): boolean {
  return /^https?:\/\//i.test(inputUrl) || inputUrl.startsWith('//')
}

/**
 * Returns `true` for non-fetchable / special schemes that should never be
 * treated as local assets (`data:`, `blob:`, `chrome-extension:`,
 * `javascript:`, `about:`).
 */
export function isSpecialScheme (u: string): boolean {
  return /^(data:|blob:|chrome-extension:|javascript:|about:)/i.test(u)
}

/**
 * Splits an asset URL into its path, query string, and fragment.
 *
 * @example
 * cleanAssetUrl('img/a.png?x=1#h')
 * // => { cleanPath: 'img/a.png', search: '?x=1', hash: '#h' }
 */
export function cleanAssetUrl (url: string): {
  cleanPath: string;
  hash: string;
  search: string;
} {
  const hashIndex = url.indexOf('#')
  const queryIndex = url.indexOf('?')
  let endIndex = url.length

  if (hashIndex !== -1 && queryIndex !== -1) {
    endIndex = Math.min(hashIndex, queryIndex)
  } else if (hashIndex !== -1) {
    endIndex = hashIndex
  } else if (queryIndex !== -1) {
    endIndex = queryIndex
  }

  const cleanPath = url.slice(0, endIndex)
  const hash = hashIndex !== -1 ? url.slice(hashIndex) : ''
  const search =
    queryIndex !== -1
      ? url.slice(queryIndex, hashIndex !== -1 ? hashIndex : undefined)
      : ''

  return {cleanPath, hash, search}
}

/**
 * Returns the extension (including the leading dot) of a file path.
 */
export function getExtname (filePath: string): string {
  return path.extname(filePath)
}

/**
 * Joins a file path with an extension, optionally prefixing it with `/` so
 * it resolves from the output/public root.
 */
export function getFilePath (
  filePath: string,
  extension: string,
  isPublic: boolean
): string {
  if (isPublic) {
    return `/${filePath}${extension}`
  }
  return `${filePath}${extension}`
}

/**
 * Returns `true` when `filePath` is one of the values of `filepathList`.
 */
export function isFromFilepathList (
  filePath: string,
  filepathList?: FilepathList
): boolean {
  return Object.values(filepathList || {}).some((value) => {
    return value === filePath
  })
}

/**
 * Computes a POSIX-style relative path from `fromPath`'s directory to
 * `toPath`. On Windows, cross-drive paths fall back to the basename so the
 * result never contains an absolute path.
 */
export function computePosixRelative (fromPath: string, toPath: string): string {
  const fromRoot = path.parse(fromPath).root
  const toRoot = path.parse(toPath).root

  if (
    fromRoot &&
    toRoot &&
    String(fromRoot).toLowerCase() !== String(toRoot).toLowerCase()
  ) {
    // Cross-drive on Windows: fall back to basename to avoid absolute-in-assets
    const base = path.basename(toPath)

    return base.split(path.sep).join('/')
  }

  const rel = path.relative(path.dirname(fromPath), toPath) || toPath

  return rel.split(path.sep).join('/')
}

/**
 * Reads the `href` of a `<base>` tag from a parsed HTML document, if any.
 * Used to resolve relative asset paths declared in documents that set a
 * base URL.
 */
export function getBaseHref (htmlDocument: HtmlNode): string | undefined {
  const htmlChildren = htmlDocument.childNodes || []

  for (const node of htmlChildren) {
    if (node?.nodeName !== 'html') continue

    for (const child of node.childNodes || []) {
      if (child?.nodeName !== 'head') continue

      for (const headChild of child.childNodes || []) {
        if (headChild?.nodeName === 'base') {
          const href = headChild.attrs?.find((a) => a.name === 'href')?.value

          if (href) return href
        }
      }
    }
  }

  return undefined
}
