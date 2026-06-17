import * as parse5utilities from 'parse5-utilities'

import type {HtmlAttribute, HtmlNode} from './types'

/**
 * Creates a `<script src="...">` node and appends it to `parentNode`
 * (typically a `<body>` node).
 *
 * @param parentNode – The parse5 node to append the script to.
 * @param src – Value of the `src` attribute (e.g. `/feature/index.js`).
 * @param inheritAttrs – Attributes captured from a user-authored `<script>`
 *   tag; `type`, `defer`, and `async` are propagated to the injected tag.
 * @returns The injected script node.
 */
export function injectScript (
  parentNode: HtmlNode,
  src: string,
  inheritAttrs?: HtmlAttribute[]
): HtmlNode {
  const scriptTag = parse5utilities.createNode('script')

  scriptTag.attrs = [{name: 'src', value: src}]
  const propagateScriptAttrs = new Set(['type', 'defer', 'async'])

  if (inheritAttrs) {
    for (const attr of inheritAttrs) {
      if (
        propagateScriptAttrs.has(attr.name) &&
        !scriptTag.attrs.find((a) => a.name === attr.name)
      ) {
        scriptTag.attrs.push({name: attr.name, value: attr.value})
      }
    }
  }

  // Biome-ignore lint/suspicious/noExplicitAny: parse5-utilities expects its own node union
  parse5utilities.append(parentNode as any, scriptTag)

  return scriptTag as unknown as HtmlNode
}

/**
 * Creates a `<link rel="stylesheet" href="...">` node and appends it to
 * `parentNode` (typically a `<head>` node).
 *
 * @param parentNode – The parse5 node to append the link to.
 * @param href – Value of the `href` attribute (e.g. `/feature/index.css`).
 * @param inheritAttrs – Attributes captured from a user-authored `<link>`
 *   tag; `media`, `crossorigin`, `integrity`, `referrerpolicy`, `type`,
 *   and `disabled` are propagated to the injected tag.
 * @returns The injected link node.
 */
export function injectStylesheet (
  parentNode: HtmlNode,
  href: string,
  inheritAttrs?: HtmlAttribute[]
): HtmlNode {
  const linkTag = parse5utilities.createNode('link')

  linkTag.attrs = [
    {name: 'rel', value: 'stylesheet'},
    {name: 'href', value: href}
  ]
  const propagateLinkAttrs = new Set([
    'media',
    'crossorigin',
    'integrity',
    'referrerpolicy',
    'type',
    'disabled'
  ])

  if (inheritAttrs) {
    for (const attr of inheritAttrs) {
      if (
        propagateLinkAttrs.has(attr.name) &&
        !linkTag.attrs.find((a) => a.name === attr.name)
      ) {
        linkTag.attrs.push({name: attr.name, value: attr.value})
      }
    }
  }

  // Biome-ignore lint/suspicious/noExplicitAny: parse5-utilities expects its own node union
  parse5utilities.append(parentNode as any, linkTag)

  return linkTag as unknown as HtmlNode
}
