/**
 * A single HTML attribute (`name="value"`) as represented by parse5.
 */
export interface HtmlAttribute {
  name: string;
  value: string;
}

/**
 * A loose, structural view of a parse5 AST node. The library treats nodes
 * structurally so callers can pass any node produced by `parse5` or
 * `parse5-utilities` without fighting the upstream union types.
 */
export interface HtmlNode {
  nodeName: string;
  attrs?: HtmlAttribute[];
  childNodes?: HtmlNode[];
  value?: string;
  data?: string;
  // biome-ignore lint/suspicious/noExplicitAny: parse5 nodes carry extra, version-specific fields
  [key: string]: any;
}

/**
 * The kind of asset reference found while walking an HTML tree:
 * - `script`     – `<script src>` (bundleable JavaScript)
 * - `css`        – `<link rel="stylesheet" href>` (bundleable stylesheet)
 * - `staticSrc`  – static reference held in a `src`-like attribute
 *                  (img/iframe/audio/video/source/track/embed/input `src`,
 *                  `srcset` candidates, video `poster`)
 * - `staticHref` – static reference held in an `href`-like attribute
 *                  (icons, manifests, preloads, `imagesrcset` candidates)
 */
export type AssetType = 'script' | 'css' | 'staticSrc' | 'staticHref';

/**
 * An asset reference discovered by {@link visitHtmlAssets}.
 */
export interface AssetReference {
  /** The raw path/URL as written in the HTML (query/hash stripped for srcset/poster candidates). */
  filePath: string;
  /** The parse5 node that holds the reference. */
  childNode: HtmlNode;
  /** What kind of reference this is. */
  assetType: AssetType;
}

/**
 * Assets extracted from an HTML document, grouped by type. Paths are
 * absolute filesystem paths for relative references, and preserved as-is
 * for root-relative (`/...`) and remote (`http(s)://...`) references.
 */
export interface ExtractedAssets {
  /** Stylesheets referenced via `<link rel="stylesheet">`. */
  css: string[];
  /** Scripts referenced via `<script src>`. */
  js: string[];
  /** Everything else: images, srcset/poster candidates, icons, preloads, etc. */
  static: string[];
}

/**
 * Map of entry names to source file paths. Used by {@link patchHtml} to
 * rewrite references that are known compilation entries to their
 * entry-based output path (`/<entryname><ext>`).
 */
export type FilepathList = Record<string, string | string[] | undefined>;
