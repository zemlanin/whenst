// @ts-check
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import esbuild from "esbuild";
import * as cheerio from "cheerio";

await build();

async function build() {
  await esbuild.build({
    entryPoints: [
      "src/pages/about/index.html",
      "src/pages/home/index.html",
      "src/pages/link/index.html",
      "src/pages/settings/index.html",
    ],
    outbase: "src/pages",
    outdir: "dist/client",
    assetNames: "static/[name]-[hash]",
    chunkNames: "static/[name]-[hash]",
    entryNames: ".pages/[dir]/[name]",
    publicPath: "/",
    minify: true,
    bundle: true,
    metafile: true,
    format: "esm",
    platform: "browser",
    plugins: [
      // htmlPlugin()
      {
        name: "html-plugin",
        setup(build) {
          const { initialOptions } = build;
          const { assetNames, outdir } = initialOptions;

          if (!assetNames) {
            throw new Error(`assetNames is not defined`);
          }

          if (!outdir) {
            throw new Error(`outdir is not defined`);
          }

          /**
           * @param {import('domhandler').Element} el
           * */
          const getBlobAssetSrcAttr = (el) => {
            if (el.name === "link") {
              return "href";
            }

            if (el.name === "img") {
              return "src";
            }

            if (el.name === "source") {
              return "srcset";
            }
          };

          /**
           * @param {import('cheerio').CheerioAPI} $
           * */
          const getBlobAssets = ($) => {
            return $("link, source, img").filter((i, el) => {
              const srcAttr = getBlobAssetSrcAttr(el);
              if (!srcAttr) {
                throw new Error(`${el.name} doesn't have src attribute`);
              }

              const $el = $(el);

              if (el.name === "link") {
                const rel = $el.attr("rel");

                return (
                  (rel === "apple-touch-icon" ||
                    (rel == "preload" && $el.attr("as") === "font") ||
                    !!rel?.split(" ").includes("icon")) &&
                  !!$el.attr(srcAttr)
                );
              }

              if (el.name === "img") {
                return !!$el.attr(srcAttr);
              }

              if (el.name === "source") {
                return !!$el.attr(srcAttr);
              }

              return false;
            });
          };

          /**
           * @param {string} dirToMatch
           * @param {string} pathToMatch
           * */
          const getResolvedAssetPathMatcher = (dirToMatch, pathToMatch) => {
            const absolutePathToMatch = path.resolve(dirToMatch, pathToMatch);

            /** @type {(asset: {importPath: string; resolveDir: string}) => boolean} */
            return ({ importPath, resolveDir }) => {
              return (
                absolutePathToMatch === path.resolve(resolveDir, importPath)
              );
            };
          };

          /**
           * @param {import('cheerio').CheerioAPI} $
           * */
          const getProcessedAssets = ($) => {
            return $('link[rel="manifest"][href]').filter((i, el) => {
              const srcAttr = getBlobAssetSrcAttr(el);
              if (!srcAttr) {
                throw new Error(`${el.name} doesn't have src attribute`);
              }

              const $el = $(el);

              if (el.name === "link") {
                const rel = $el.attr("rel");

                return !!$el.attr("href") && rel === "manifest";
              }

              return false;
            });
          };

          // original `import from ".html"` loads `html-plugin-stub`
          // the stub is a generated JS with assets imports
          build.onResolve({ filter: /\.html$/ }, async (args) => {
            if (args.namespace === "html-plugin-stub") {
              return {
                path: args.path,
                namespace: "html-plugin-blob",
                pluginData: args.pluginData,
              };
            }

            return {
              path: path.isAbsolute(args.path)
                ? args.path
                : path.join(args.resolveDir, args.path),
              namespace: "html-plugin-stub",
            };
          });

          build.onLoad(
            { filter: /.*/, namespace: "html-plugin-blob" },
            async (args) => {
              /** @type {{assets: {importPath: string; resolvePath: string; resolveDir: string}[]}} */
              const { assets } = args.pluginData;
              const file = await fs.readFile(args.path);
              const dirname = path.dirname(args.path);
              const $ = cheerio.load(file);

              getBlobAssets($).each((i, el) => {
                const srcAttr = getBlobAssetSrcAttr(el);
                if (!srcAttr) {
                  throw new Error(`${el.name} doesn't have src attribute`);
                }

                const $el = $(el);

                const originalHref = $el.attr(srcAttr);
                if (!originalHref) {
                  return;
                }

                const matchingAsset = assets.find(
                  getResolvedAssetPathMatcher(dirname, originalHref),
                );

                if (matchingAsset) {
                  $el.attr(srcAttr, matchingAsset.resolvePath);
                }
              });

              getProcessedAssets($).each((i, el) => {
                const srcAttr = "href";
                const $el = $(el);

                const originalHref = $el.attr(srcAttr);
                if (!originalHref) {
                  return;
                }

                const matchingAsset = assets.find(
                  getResolvedAssetPathMatcher(dirname, originalHref),
                );

                if (matchingAsset) {
                  $el.attr(srcAttr, matchingAsset.resolvePath);
                }
              });

              return {
                contents: $.html(),
                loader: "file",
                watchFiles: assets.map(({ resolvePath }) => resolvePath),
              };
            },
          );

          build.onLoad(
            { filter: /.*/, namespace: "html-plugin-stub" },
            async (args) => {
              const file = await fs.readFile(args.path);
              const $ = cheerio.load(file);

              const manifests = $('link[rel="manifest"][href]')
                .map((i, el) => $(el).attr("href"))
                .toArray();

              const images = getBlobAssets($)
                .map((i, el) => {
                  const srcAttr = getBlobAssetSrcAttr(el);
                  if (!srcAttr) {
                    throw new Error(`${el.name} doesn't have src attribute`);
                  }

                  return $(el).attr(srcAttr);
                })
                .toArray();

              /** @type {{ importPath: string; resolveDir: string; resolvePath: string }[]} */
              const assets = [];
              const warnings = [];
              /** @type {(importPath: string, options: { resolveDir: string }) => Promise<void | { errors: import('esbuild').Message[] }>} */
              const collectBlob = async (importPath, { resolveDir }) => {
                if (
                  assets.some(
                    getResolvedAssetPathMatcher(resolveDir, importPath),
                  )
                ) {
                  return;
                }

                const result = await build.resolve(importPath, {
                  kind: "import-statement",
                  importer: args.path,
                  resolveDir: resolveDir,
                });
                if (result.errors.length > 0) {
                  return { errors: result.errors };
                }

                if (result.warnings.length > 0) {
                  warnings.push(...result.warnings);
                }

                const assetContents = await fs.readFile(result.path);

                const extname = path.extname(result.path);
                const name = path.basename(result.path, extname);
                const hash = crypto.createHash("sha256");
                hash.setEncoding("base64url");
                hash.write(assetContents);
                hash.end();
                const resolvePath =
                  assetNames
                    .replace("[name]", name)
                    .replace("[hash]", hash.read().slice(0, 8)) + extname;

                await fs.mkdir(path.dirname(path.join(outdir, resolvePath)), {
                  recursive: true,
                });

                await fs.writeFile(
                  path.join(outdir, resolvePath),
                  assetContents,
                );

                assets.push({
                  importPath,
                  resolveDir,
                  resolvePath: path.join(
                    initialOptions.publicPath ?? "/",
                    resolvePath,
                  ),
                });
              };

              const dirname = path.dirname(args.path);

              for (const image of images) {
                const result = await collectBlob(image, {
                  resolveDir: dirname,
                });

                if (result && "errors" in result && result.errors.length > 0) {
                  return { errors: result.errors };
                }
              }

              for (const manifest of manifests) {
                if (
                  assets.some(getResolvedAssetPathMatcher(dirname, manifest))
                ) {
                  continue;
                }

                const result = await build.resolve(manifest, {
                  kind: "import-statement",
                  importer: args.path,
                  resolveDir: dirname,
                });
                if (result.errors.length > 0) {
                  return { errors: result.errors };
                }

                const resolveDir = path.dirname(result.path);

                if (result.warnings.length > 0) {
                  warnings.push(...result.warnings);
                }

                const assetContents = JSON.parse(
                  (await fs.readFile(result.path)).toString(),
                );
                /** @type {{ icons: { src: string }[] }} */
                const { icons } = assetContents;

                for (const icon of icons) {
                  const iconResult = await collectBlob(icon.src, {
                    resolveDir,
                  });

                  if (
                    iconResult &&
                    "errors" in iconResult &&
                    iconResult.errors.length > 0
                  ) {
                    return { errors: iconResult.errors };
                  }
                }

                const updatedManifest = JSON.stringify({
                  ...assetContents,
                  icons: icons.map((icon) => ({
                    ...icon,
                    src:
                      assets.find(
                        getResolvedAssetPathMatcher(resolveDir, icon.src),
                      )?.resolvePath ?? icon.src,
                  })),
                });

                // single webmanifest per site
                const resolvePath = "app.webmanifest";

                await fs.mkdir(path.dirname(path.join(outdir, resolvePath)), {
                  recursive: true,
                });

                await fs.writeFile(
                  path.join(outdir, resolvePath),
                  updatedManifest,
                );

                assets.push({
                  importPath: manifest,
                  resolveDir: dirname,
                  resolvePath: path.join(
                    initialOptions.publicPath ?? "/",
                    resolvePath,
                  ),
                });
              }

              return {
                contents: `
                import file from ${JSON.stringify(args.path)};
                export default file;
              `,
                watchFiles: assets.map(({ importPath }) => importPath),
                resolveDir: ".", // TODO
                warnings,
                pluginData: {
                  assets,
                },
              };
            },
          );
        },
      },
    ],
    loader: {
      ".png": "file",
      ".woff": "file",
      ".woff2": "file",
      // service-worker .js — compiled separately, referenced by a hardcoded path
    },
  });

  // TODO service-worker

  await esbuild.build({
    entryPoints: [
      "server/index.ts",
      "server/release.ts",
      "server/migrations.ts",
    ],
    bundle: true,
    platform: "node",
    format: "esm",
    outdir: "dist/server",
    packages: "external",
    external: ["#dist/*"],
  });
}
