export { extractAssets, getDeclaredAssetPath } from './extract-assets';
export { injectScript, injectStylesheet } from './inject';
export { parseHtml, serializeHtml, visitHtmlAssets } from './parse-html';
export {
  type PatchHtmlOptions,
  type PatchWarning,
  patchHtml,
  patchHtmlNested,
  patchStaticAsset,
  setAssetReference,
} from './patch-html';
export type {
  AssetReference,
  AssetType,
  ExtractedAssets,
  FilepathList,
  HtmlAttribute,
  HtmlNode,
} from './types';
export {
  cleanAssetUrl,
  computePosixRelative,
  getBaseHref,
  getExtname,
  getFilePath,
  isFromFilepathList,
  isHttpLike,
  isSpecialScheme,
  isUrl,
} from './utils';
