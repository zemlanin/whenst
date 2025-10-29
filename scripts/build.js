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
              /** @type {{assets: {importPath: string; resolvePath: string}[]}} */
              const { assets } = args.pluginData;
              const file = await fs.readFile(args.path);
              const $ = cheerio.load(file);

              getBlobAssets($).each((i, el) => {
                const srcAttr = getBlobAssetSrcAttr(el);
                if (!srcAttr) {
                  throw new Error(`${el.name} doesn't have src attribute`);
                }

                const $el = $(el);

                const originalHref = $el.attr(srcAttr);

                const matchingAsset = assets.find(
                  ({ importPath }) => importPath === originalHref,
                );

                if (matchingAsset) {
                  $el.attr(srcAttr, matchingAsset.resolvePath);
                }
              });

              return {
                contents: $.html(),
                loader: "file",
                watchFiles: assets.map(({ importPath }) => importPath),
              };
            },
          );

          build.onLoad(
            { filter: /.*/, namespace: "html-plugin-stub" },
            async (args) => {
              const file = await fs.readFile(args.path);
              const $ = cheerio.load(file);

              const images = getBlobAssets($)
                .map((i, el) => {
                  const srcAttr = getBlobAssetSrcAttr(el);
                  if (!srcAttr) {
                    throw new Error(`${el.name} doesn't have src attribute`);
                  }

                  return $(el).attr(srcAttr);
                })
                .toArray();

              /** @type {{importPath: string; resolvePath: string}[]} */
              const assets = [];
              const warnings = [];
              for (const image of images) {
                if (assets.some(({ importPath }) => importPath === image)) {
                  continue;
                }

                const result = await build.resolve(image, {
                  kind: "import-statement",
                  importer: args.path,
                  resolveDir: path.dirname(args.path),
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
                  importPath: image,
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
