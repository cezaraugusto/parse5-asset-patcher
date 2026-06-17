import * as fs from 'node:fs'
import * as path from 'node:path'

import * as parse5utilities from 'parse5-utilities'

import {getDeclaredAssetPath} from './extract-assets'
import {injectScript, injectStylesheet} from './inject'
import {visitHtmlAssets} from './parse-html'
import {
  cleanAssetUrl,
  getBaseHref,
  getExtname,
  getFilePath,
  isFromFilepathList
} from './utils'

import type {AssetType, FilepathList, HtmlAttribute, HtmlNode} from './types'

/**
 * A warning emitted while patching, e.g. when a root-relative reference
 * does not exist under the project's public directory.
 */
export interface PatchWarning {
  /** Human-readable description of the problem. */
  message: string;
  /** The HTML file being patched. */
  file: string;
  /** The offending asset path as written in the HTML. */
  assetPath: string;
}

/**
 * Options accepted by {@link patchHtml}.
 */
export interface PatchHtmlOptions {
  /**
   * Map of entry names to source file paths. Static assets whose absolute
   * path matches an entry are rewritten to `/<entryname><ext>` instead of
   * being relocated under `assets/`.
   */
  includeList?: FilepathList;
  /**
   * Set `true` when a stylesheet bundle exists for this entry even if the
   * HTML declares no `<link rel="stylesheet">` (e.g. CSS imported from JS),
   * forcing the stylesheet link injection.
   */
  hasCssEntry?: boolean;
  /** Override the href of the injected stylesheet (default `/<feature>.css`). */
  cssHref?: string;
  /** Override the src of the injected script (default `/<feature>.js`). */
  scriptSrc?: string;
  /**
   * Inject the bundle `<script>` even when the HTML declares no scripts
   * (useful in dev/watch mode where a runtime client must always load).
   */
  alwaysInjectScript?: boolean;
  /** Receives a {@link PatchWarning} when a public-root asset is missing. */
  onWarning?: (warning: PatchWarning) => void;
}

/**
 * Sets the reference attribute (`src` or `href`, depending on `assetType`)
 * of a parse5 node to `url`.
 *
 * @param node – The element node to update.
 * @param assetType – Determines the attribute: `script`/`staticSrc` set
 *   `src`; `css`/`staticHref` set `href`.
 * @param url – The new reference value (query/hash included as desired).
 * @returns The updated node.
 */
export function setAssetReference (
  node: HtmlNode,
  assetType: AssetType,
  url: string
): HtmlNode {
  const attribute =
    assetType === 'script' || assetType === 'staticSrc' ? 'src' : 'href'

  // Biome-ignore lint/suspicious/noExplicitAny: parse5-utilities expects its own node union
  return parse5utilities.setAttribute(node as any, attribute, url) as HtmlNode
}

/**
 * Rewrites the reference of a single static asset node:
 *
 * 1. If the asset is a known entry (`includeList`), the reference becomes
 *    the entry's output path (`/<entryname><ext>`).
 * 2. If the reference is root-relative (`/...`), it is preserved as-is.
 * 3. Otherwise, when the file exists on disk, the reference is rewritten
 *    to `/assets/<path relative to the HTML file>` (honoring `<base href>`
 *    when it points to a local directory).
 *
 * Query strings and hashes are preserved in all cases.
 */
export function patchStaticAsset (params: {
  /** Path of the HTML file being patched. */
  htmlEntry: string;
  /** Directory of the HTML file. */
  htmlDir: string;
  /** Absolute filesystem path the reference resolves to. */
  absolutePath: string;
  /** Whether the reference lives in a `src` or `href` attribute. */
  assetType: 'staticSrc' | 'staticHref';
  /** Reference path without query/hash. */
  cleanPath: string;
  /** Query string (including `?`), if any. */
  search: string | undefined;
  /** Fragment (including `#`), if any. */
  hash: string | undefined;
  /** Value of `<base href>`, if the document declares one. */
  baseHref: string | undefined;
  /** Map of entry names to source file paths. */
  includeList: FilepathList;
  /** Extension of the asset (including the leading dot). */
  extname: string;
  /** The parse5 node holding the reference. */
  node: HtmlNode;
}): HtmlNode {
  const {
    htmlDir,
    absolutePath,
    assetType,
    cleanPath,
    search,
    hash,
    baseHref,
    includeList,
    extname
  } = params

  let {node} = params

  if (isFromFilepathList(absolutePath, includeList)) {
    const filepath = getDeclaredAssetPath(includeList, absolutePath, extname)

    node = setAssetReference(
      node,
      assetType,
      filepath + (search || '') + (hash || '')
    )

    return node
  }

  if (cleanPath.startsWith('/')) {
    // Root-relative (public-root) references are preserved as-is
    node = setAssetReference(
      node,
      assetType,
      cleanPath + (search || '') + (hash || '')
    )

    return node
  }

  const baseJoin =
    baseHref && !/^\w+:\/\//.test(baseHref)
      ? path.resolve(htmlDir, baseHref)
      : htmlDir

  const fromRoot = path.parse(baseJoin).root
  const toRoot = path.parse(absolutePath).root
  const relativeFromHtml =
    fromRoot &&
    toRoot &&
    String(fromRoot).toLowerCase() !== String(toRoot).toLowerCase()
      ? path.basename(absolutePath)
      : path.relative(baseJoin, absolutePath)

  const posixRelative = relativeFromHtml.split(path.sep).join('/')
  const filepath = path.posix.join('assets', posixRelative)

  if (fs.existsSync(absolutePath)) {
    node = setAssetReference(
      node,
      assetType,
      getFilePath(filepath, '', true) + (search || '') + (hash || '')
    )
  }
  return node
}

function warnIfPublicRootAssetMissing (
  htmlEntry: string,
  cleanPath: string,
  onWarning?: (warning: PatchWarning) => void
): void {
  if (!onWarning) return

  const projectDir = path.dirname(path.dirname(htmlEntry))
  const publicCandidate = path.join(projectDir, 'public', cleanPath.slice(1))

  if (fs.existsSync(publicCandidate)) return

  onWarning({
    message: `Missing asset in ${htmlEntry}. Paths starting with '/' are resolved from the output root (served from 'public/'), not the source directory. Update the reference to point to a file that exists.`,
    file: htmlEntry,
    assetPath: cleanPath
  })
}

const removeNode = (node: HtmlNode): HtmlNode =>
  // Biome-ignore lint/suspicious/noExplicitAny: parse5-utilities expects its own node union
  parse5utilities.remove(node as any) as HtmlNode

/**
 * Patches an HTML entry file for bundling:
 *
 * - Relative `<script src>` tags are removed; a single bundle script
 *   (`/<feature>.js` by default) is appended to `<body>` instead. The
 *   first removed script's `type`/`defer`/`async` attributes carry over.
 * - Relative `<link rel="stylesheet">` tags are removed; a single bundle
 *   stylesheet link (`/<feature>.css` by default) is appended to `<head>`.
 *   `media`/`crossorigin`/`integrity`/… attributes carry over.
 * - Root-relative (`/...`) scripts/styles are preserved as-is (with
 *   query/hash kept).
 * - Static assets (images, srcset, poster, icons, …) are rewritten via
 *   {@link patchStaticAsset}.
 *
 * @param htmlEntry – Path of the HTML file to patch.
 * @param feature – Entry name used for the injected bundle references
 *   (e.g. `pages/main` → `/pages/main.js` / `/pages/main.css`).
 * @param options – See {@link PatchHtmlOptions}.
 * @returns The patched HTML string, or `''` when no `<html>` node exists.
 */
export function patchHtml (
  htmlEntry: string,
  feature: string,
  options: PatchHtmlOptions = {}
): string {
  const {includeList = {}, cssHref, scriptSrc} = options

  const htmlFile = fs.readFileSync(htmlEntry, {encoding: 'utf8'})
  const htmlDocument = parse5utilities.parse(htmlFile) as unknown as HtmlNode
  const baseHref = getBaseHref(htmlDocument)

  let hasCssEntry = Boolean(options.hasCssEntry)
  let hasJsEntry = false
  let firstScriptAttrs: HtmlAttribute[] | undefined
  let firstLinkAttrs: HtmlAttribute[] | undefined

  for (const node of htmlDocument.childNodes || []) {
    if (node.nodeName !== 'html') continue

    for (const htmlChildNode of node.childNodes || []) {
      // We don't really care whether the asset is in the head or body
      // element, as long as it's not a regular text node, we're good.
      if (
        htmlChildNode.nodeName === 'head' ||
        htmlChildNode.nodeName === 'body'
      ) {
        visitHtmlAssets(htmlChildNode, ({filePath, childNode, assetType}) => {
          const htmlDir = path.dirname(htmlEntry)
          const {cleanPath, hash, search} = cleanAssetUrl(filePath)
          const absolutePath = path.resolve(htmlDir, cleanPath)
          const extname = getExtname(absolutePath)
          // Public-root absolute paths are preserved; others become bundled entries

          let thisChildNode = childNode

          switch (assetType) {
            // For script types, we have two cases:
            // 1. If the path is root-relative, we preserve the reference.
            // 2. Otherwise we remove the script tag from the HTML file
            // since all scripts are compiled into a single bundle that
            // gets injected at the end.
            case 'script': {
              if (cleanPath.startsWith('/')) {
                // Public-root absolute scripts are preserved as-is
                thisChildNode = setAssetReference(
                  thisChildNode,
                  'script',
                  cleanPath + (search || '') + (hash || '')
                )
              } else {
                if (!firstScriptAttrs) {
                  firstScriptAttrs = Array.isArray(thisChildNode.attrs)
                    ? [...thisChildNode.attrs]
                    : []
                }

                thisChildNode = removeNode(thisChildNode)
                hasJsEntry = true
              }

              break
            }

            // For CSS types, we have the same cases as script types.
            case 'css': {
              if (cleanPath.startsWith('/')) {
                // Public-root absolute styles are preserved as-is
                thisChildNode = setAssetReference(
                  thisChildNode,
                  'css',
                  cleanPath + (search || '') + (hash || '')
                )
              } else {
                if (!firstLinkAttrs) {
                  firstLinkAttrs = Array.isArray(thisChildNode.attrs)
                    ? [...thisChildNode.attrs]
                    : []
                }

                thisChildNode = removeNode(thisChildNode)
                hasCssEntry = true
              }

              break
            }

            // For static assets:
            // 1. If the file is a known entry, the reference is rewritten
            // to the entry's output path.
            // 2. If the path is root-relative, the reference is preserved.
            // 3. Otherwise, the reference is rewritten into the assets
            // folder, relative to the HTML file.
            case 'staticHref':
            case 'staticSrc': {
              thisChildNode = patchStaticAsset({
                htmlEntry,
                htmlDir,
                absolutePath,
                assetType,
                cleanPath,
                search,
                hash,
                baseHref,
                includeList,
                extname,
                node: thisChildNode
              })
              break
            }

            default:
              break
          }
        })
      }

      if (htmlChildNode.nodeName === 'head') {
        // Create the link tag for the CSS bundle.
        if (hasCssEntry) {
          injectStylesheet(
            htmlChildNode,
            cssHref || getFilePath(feature, '.css', true),
            firstLinkAttrs
          )
        }
      }

      // Create the script tag for the JS bundle
      if (htmlChildNode.nodeName === 'body') {
        // We want a single JS entry point even when the HTML declares
        // multiple scripts, so the bundle script is only injected once.
        if (hasJsEntry || options.alwaysInjectScript) {
          injectScript(
            htmlChildNode,
            scriptSrc || getFilePath(feature, '.js', true),
            firstScriptAttrs
          )
        }
      }
    }

    // Biome-ignore lint/suspicious/noExplicitAny: parse5-utilities expects its own node union
    return parse5utilities.stringify(htmlDocument as any)
  }

  // If we get here, we didn't find an html node
  return ''
}

/**
 * Patches a nested (non-entry) HTML file: original `<script>`/`<link>`
 * tags are preserved, only static asset references are rewritten into the
 * `assets/` folder, and missing public-root references are reported via
 * `onWarning`.
 *
 * @param htmlEntry – Path of the HTML file to patch.
 * @param options.onWarning – Receives a {@link PatchWarning} when a
 *   root-relative reference does not exist under `<projectRoot>/public`.
 * @returns The patched HTML string, or `''` when no `<html>` node exists.
 */
export function patchHtmlNested (
  htmlEntry: string,
  options: {onWarning?: (warning: PatchWarning) => void} = {}
): string {
  const {onWarning} = options

  const htmlFile = fs.readFileSync(htmlEntry, {encoding: 'utf8'})
  const htmlDocument = parse5utilities.parse(htmlFile) as unknown as HtmlNode

  for (const node of htmlDocument.childNodes || []) {
    if (node.nodeName !== 'html') continue

    for (const htmlChildNode of node.childNodes || []) {
      if (
        htmlChildNode.nodeName === 'head' ||
        htmlChildNode.nodeName === 'body'
      ) {
        visitHtmlAssets(htmlChildNode, ({filePath, childNode, assetType}) => {
          const htmlDir = path.dirname(htmlEntry)
          const {cleanPath, hash, search} = cleanAssetUrl(filePath)
          const absolutePath = path.resolve(htmlDir, cleanPath)
          // Public-root absolute paths are preserved; others are emitted or linked

          let thisChildNode = childNode

          switch (assetType) {
            case 'script':
            case 'css': {
              if (cleanPath.startsWith('/')) {
                warnIfPublicRootAssetMissing(htmlEntry, cleanPath, onWarning)

                // Keep as-is (but normalize URL for query/hash)
                thisChildNode = setAssetReference(
                  thisChildNode,
                  assetType,
                  cleanPath + (search || '') + (hash || '')
                )
              }

              break
            }

            case 'staticHref':
            case 'staticSrc': {
              if (cleanPath.startsWith('/')) {
                warnIfPublicRootAssetMissing(htmlEntry, cleanPath, onWarning)
                thisChildNode = setAssetReference(
                  thisChildNode,
                  assetType,
                  cleanPath + (search || '') + (hash || '')
                )
              } else {
                if (fs.existsSync(absolutePath)) {
                  const relativeFromHtml = path.relative(htmlDir, absolutePath)
                  const posixRelative = relativeFromHtml
                    .split(path.sep)
                    .join('/')

                  const filepath = path.posix.join('assets', posixRelative)

                  thisChildNode = setAssetReference(
                    thisChildNode,
                    assetType,
                    getFilePath(filepath, '', true) +
                      (search || '') +
                      (hash || '')
                  )
                }
              }

              break
            }

            default:
              break
          }
        })
      }
    }

    // Biome-ignore lint/suspicious/noExplicitAny: parse5-utilities expects its own node union
    return parse5utilities.stringify(htmlDocument as any)
  }

  return ''
}
