import * as fs from 'node:fs';
import * as path from 'node:path';
import { parseHtml, visitHtmlAssets } from './parse-html';
import type { ExtractedAssets, FilepathList } from './types';
import { cleanAssetUrl, getBaseHref, getExtname, isUrl } from './utils';

const cloneExtractedAssets = (assets: ExtractedAssets): ExtractedAssets => ({
  css: [...assets.css],
  js: [...assets.js],
  static: [...assets.static],
});

const extractAssetsCache = new Map<
  string,
  { key: string; assets: ExtractedAssets }
>();

/**
 * Parses an HTML file (or an in-memory HTML string) and extracts every
 * local asset it references, grouped by type:
 *
 * - `js`     – `<script src>` entries
 * - `css`    – `<link rel="stylesheet">` entries
 * - `static` – images (`src`, `srcset`), `<video poster>`, icons,
 *              manifests, preloads, `imagesrcset`, iframes, media sources…
 *
 * Path resolution rules:
 * - Absolute URLs (`https://...`) are preserved as-is.
 * - Root-relative paths (`/...`) are preserved as-is (public-root refs).
 * - Relative paths are resolved against the HTML file's directory, honoring
 *   a `<base href>` when present (and when the base is not itself a URL).
 *
 * Results for on-disk files are cached by mtime/size, so repeated calls
 * are cheap. Missing or unreadable files return empty asset lists.
 *
 * @param htmlFilePath – Path of the HTML file (used to resolve relative refs).
 * @param htmlContent – Optional HTML source; when omitted the file is read
 *   from disk.
 */
export function extractAssets(
  htmlFilePath: string | undefined,
  htmlContent?: string,
): ExtractedAssets {
  const assets: ExtractedAssets = {
    css: [],
    js: [],
    static: [],
  };

  if (!htmlFilePath) {
    return assets;
  }

  let cacheKey: string | undefined;

  if (htmlContent === undefined) {
    try {
      const stat = fs.statSync(htmlFilePath);
      cacheKey = `${stat.mtimeMs}:${stat.size}`;

      const cached = extractAssetsCache.get(htmlFilePath);
      if (cached && cached.key === cacheKey) {
        return cloneExtractedAssets(cached.assets);
      }
    } catch {
      cacheKey = undefined;
    }
  }

  try {
    const htmlString =
      htmlContent || fs.readFileSync(htmlFilePath, { encoding: 'utf8' });

    if (!htmlString) {
      return assets;
    }

    const htmlDocument = parseHtml(htmlString);

    const baseHref = getBaseHref(htmlDocument);

    const getAbsolutePath = (htmlPath: string, filePathWithParts: string) => {
      const { cleanPath } = cleanAssetUrl(filePathWithParts);

      // Preserve full URL references (http/https) as-is
      if (isUrl(cleanPath)) {
        return cleanPath;
      }

      if (cleanPath.startsWith('/')) {
        // For public paths, preserve them as-is
        return cleanPath;
      }
      // If base href is present and is not a URL, resolve relative to base
      const isBaseUrl = isUrl(baseHref || '');
      const baseJoin =
        baseHref && !isBaseUrl
          ? path.join(path.dirname(htmlPath), baseHref)
          : path.dirname(htmlPath);
      return path.join(baseJoin, cleanPath);
    };

    visitHtmlAssets(htmlDocument, ({ filePath, assetType }) => {
      const fileAbsolutePath = getAbsolutePath(htmlFilePath, filePath);

      switch (assetType) {
        case 'script':
          assets.js.push(fileAbsolutePath);
          break;
        case 'css':
          assets.css.push(fileAbsolutePath);
          break;
        case 'staticSrc':
        case 'staticHref':
          if (filePath.startsWith('#')) {
            break;
          }
          assets.static.push(fileAbsolutePath);
          break;
        default:
          break;
      }
    });
  } catch {
    // If file doesn't exist or can't be read, return empty assets
    return assets;
  }

  if (cacheKey) {
    extractAssetsCache.set(htmlFilePath, {
      key: cacheKey,
      assets: cloneExtractedAssets(assets),
    });
  }

  return assets;
}

/**
 * Resolves the output path an asset should be referenced by, given a map
 * of entry names to source files. When `filePath` is itself an entry — or
 * is referenced by an entry HTML file — the returned path is based on the
 * entry name (`/<entryname><extension>`). Otherwise the original path is
 * kept, with its extension swapped for `extension`.
 *
 * @param filepathList – Map of entry names to source file paths.
 * @param filePath – Absolute path of the asset to resolve.
 * @param extension – Output extension (including the leading dot).
 */
export function getDeclaredAssetPath(
  filepathList: FilepathList,
  filePath: string,
  extension: string,
): string {
  const entryname =
    Object.keys(filepathList).find((key) => {
      const includePath = filepathList[key] as string;
      if (includePath === filePath) return true;

      const assets = extractAssets(includePath);
      return Boolean(
        assets.js.includes(filePath) || assets.css.includes(filePath),
      );
    }) || '';

  const extname = getExtname(filePath);
  if (!entryname) return `${filePath.replace(extname, '')}${extension}`;

  return `/${entryname.replace(extname, '')}${extension}`;
}
