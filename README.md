# parse5-asset-patcher

> Parse, extract, and patch asset references in HTML documents.

Bundlers and build tools constantly need to answer the same questions about an HTML file: which scripts, stylesheets, images, and other static files does it reference? Where do those references resolve on disk? And how should they be rewritten once the build relocates them?

`parse5-asset-patcher` packages those answers as a small, dependency-light library built on [parse5-utilities](https://www.npmjs.com/package/parse5-utilities). It understands `<script src>`, `<link rel="stylesheet">`, icons/manifests/preloads, `img src` and `srcset`, `<link imagesrcset>`, `<video poster>`, media sources, iframes, `<base href>` resolution, and preserves `?query`/`#hash` parts when rewriting.

Extracted from the HTML pipeline of [Extension.js](https://extension.js.org).

## Install

```sh
npm install parse5-asset-patcher
```

## Usage

### Extract assets from an HTML file

```js
import { extractAssets } from 'parse5-asset-patcher';

const assets = extractAssets('/path/to/page.html');
// {
//   js: ['/path/to/js/app.js'],
//   css: ['/path/to/css/app.css'],
//   static: [
//     '/path/to/img/photo.png',      // <img src>
//     '/path/to/img/photo-2x.png',   // srcset candidate
//     '/path/to/img/poster.jpg',     // <video poster>
//     '/public/favicon.png'          // root-relative refs preserved as-is
//   ]
// }
```

Relative paths are resolved against the HTML file's directory (honoring `<base href>`), root-relative (`/...`) and remote (`https://...`) references are preserved as-is, and on-disk results are cached by mtime/size. You can also pass HTML content directly:

```js
const assets = extractAssets('/virtual/page.html', '<img src="logo.png">');
```

### Walk asset references yourself

```js
import { parseHtml, visitHtmlAssets, serializeHtml } from 'parse5-asset-patcher';

const document = parseHtml('<body><img src="a.png" srcset="a-2x.png 2x"></body>');

visitHtmlAssets(document, ({ filePath, assetType, childNode }) => {
  console.log(assetType, filePath);
  // staticSrc a.png
  // staticSrc a-2x.png
});
```

### Patch an HTML entry for bundling

`patchHtml` removes relative `<script>`/`<link rel="stylesheet">` tags (they are assumed to be compiled into a single bundle), injects the bundle references, rewrites static assets into an `assets/` folder, and preserves root-relative references and query/hash parts:

```js
import { patchHtml } from 'parse5-asset-patcher';

const html = patchHtml('/project/pages/index.html', 'pages/index', {
  // entries known to the build; matched assets resolve to /<entryname><ext>
  includeList: { 'pages/index': '/project/pages/index.html' },
  // inject the bundle script even if the HTML declares no scripts (dev mode)
  alwaysInjectScript: false,
  // override injected hrefs when the emitted filenames differ
  cssHref: '/chunks/split.css',
  scriptSrc: '/runtime/main.js',
});
// <link rel="stylesheet" href="a.css">  -> removed, /pages/index.css injected
// <script src="a.js">                   -> removed, /pages/index.js injected
// <img src="img/a.png?v=1">             -> src="/assets/img/a.png?v=1"
// <script src="/public/x.js#h">         -> preserved as-is
```

Attributes from the first user-authored tag carry over to the injected ones (`type`/`defer`/`async` for scripts; `media`/`crossorigin`/`integrity`/`referrerpolicy`/`type`/`disabled` for stylesheets).

For nested (non-entry) HTML files, `patchHtmlNested` keeps scripts and stylesheets untouched and only rewrites static assets, reporting missing public-root references:

```js
import { patchHtmlNested } from 'parse5-asset-patcher';

const html = patchHtmlNested('/project/pages/nested.html', {
  onWarning: ({ message, file, assetPath }) => console.warn(message),
});
```

### Rewrite a single reference

```js
import { setAssetReference } from 'parse5-asset-patcher';

// sets `src` for 'script'/'staticSrc', `href` for 'css'/'staticHref'
setAssetReference(imgNode, 'staticSrc', '/assets/logo.png?v=2');
```

### Inject nodes

```js
import { injectScript, injectStylesheet } from 'parse5-asset-patcher';

injectScript(bodyNode, '/main.js', [{ name: 'type', value: 'module' }]);
injectStylesheet(headNode, '/main.css', [{ name: 'media', value: 'print' }]);
```

## API

| Export | Description |
| --- | --- |
| `parseHtml(html)` | Parse an HTML string into a parse5 tree. |
| `serializeHtml(node)` | Serialize a parse5 node back to HTML. |
| `visitHtmlAssets(node, onAssetFound)` | Walk a tree, reporting every local asset reference with its `AssetType`. |
| `extractAssets(htmlFilePath, htmlContent?)` | Extract `{ js, css, static }` asset lists from a file or string. |
| `getDeclaredAssetPath(filepathList, filePath, ext)` | Resolve an asset's output path from an entry map. |
| `patchHtml(htmlEntry, feature, options?)` | Patch an entry HTML file for bundling. |
| `patchHtmlNested(htmlEntry, options?)` | Patch a nested HTML file (static assets only). |
| `patchStaticAsset(params)` | Rewrite a single static asset node (entry/public/assets-folder rules). |
| `setAssetReference(node, assetType, url)` | Set the `src`/`href` of a node. |
| `injectScript(parentNode, src, inheritAttrs?)` | Append a `<script>` to a node. |
| `injectStylesheet(parentNode, href, inheritAttrs?)` | Append a `<link rel="stylesheet">` to a node. |
| `cleanAssetUrl(url)` | Split a URL into `{ cleanPath, search, hash }`. |
| `getBaseHref(document)` | Read the document's `<base href>`, if any. |
| `isUrl(s)` / `isHttpLike(s)` / `isSpecialScheme(s)` | URL classification helpers. |
| `getExtname` / `getFilePath` / `computePosixRelative` / `isFromFilepathList` | Path helpers. |

Types: `AssetType`, `AssetReference`, `ExtractedAssets`, `FilepathList`, `HtmlNode`, `HtmlAttribute`, `PatchHtmlOptions`, `PatchWarning`.

## License

MIT (c) Cezar Augusto.
