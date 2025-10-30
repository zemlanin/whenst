// @ts-check
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import esbuild from "esbuild";
import * as cheerio from "cheerio";

const HTML_ENTRYPOINTS = [
  "src/pages/about/index.html",
  "src/pages/home/index.html",
  "src/pages/link/index.html",
  "src/pages/settings/index.html",
];

await build();

async function build() {
  /** @type {Set<string>} */
  const codeEntrypoints = new Set();
  /** @type {Record<string, string>} */
  const outAssets = {};

  for (const htmlFilepath of HTML_ENTRYPOINTS) {
    const htmlDirname = path.dirname(htmlFilepath);
    const htmlContents = (await fs.readFile(htmlFilepath)).toString();
    const $ = cheerio.load(htmlContents);

    $(
      'script[type="module"][src], link[rel="stylesheet"][type="text/css"][href]',
    )
      .map((i, el) => {
        if (el.name === "script") {
          const src = el.attribs.src;
          if (src && !src.startsWith("http:") && !src.startsWith("https:")) {
            return path.resolve(htmlDirname, el.attribs.src);
          }

          return null;
        }

        if (el.name === "link") {
          const href = el.attribs.href;
          if (href && !href.startsWith("http:") && !href.startsWith("https:")) {
            return path.resolve(htmlDirname, el.attribs.href);
          }

          return null;
        }
      })
      .filter((i, p) => !!p)
      .each((i, p) => {
        if (!p) {
          return;
        }
        codeEntrypoints.add(p);
      });
  }

  /** @type {Record<string, {main: string | undefined; css: string | undefined}>} */
  const outEntrypoints = {};
  for (const entrypoint of codeEntrypoints) {
    const entryNames = (() => {
      const indexMatch = entrypoint.match(
        /src\/pages\/([^/]+\/index)\.(js|ts|tsx|css)$/,
      );

      if (indexMatch) {
        return `${indexMatch[1]}-[hash]`;
      }

      return "static/[name]-[hash]";
    })();

    const result = await buildClient({
      entrypoint,
      entryNames,
      outdir: "dist/client",
      publicPath: "/",
    });

    if (!result) {
      throw new Error("compilation error");
    }

    outEntrypoints[entrypoint] = {
      main: result.path,
      css: result.cssBundle,
    };

    Object.assign(outAssets, result.assets);
  }

  for (const htmlFilepath of HTML_ENTRYPOINTS) {
    const htmlDirname = path.dirname(htmlFilepath);
    const htmlContents = (await fs.readFile(htmlFilepath)).toString();
    const $ = cheerio.load(htmlContents);

    const assetEntrypoints = new Set();
    $("link[href], img[src], source[srcset]")
      .map((i, el) => {
        if (el.name === "link") {
          const rel = el.attribs.rel;
          const as = el.attribs.as;

          /** @type {string | undefined} */
          let href = undefined;
          if (
            rel === "apple-touch-icon" ||
            rel === "icon" ||
            rel.includes("icon ") ||
            rel.includes(" icon") ||
            (rel === "preload" && as === "font")
          ) {
            href = el.attribs.href;
          }

          if (href && !href.startsWith("http:") && !href.startsWith("https:")) {
            return path.resolve(htmlDirname, href);
          }

          return undefined;
        }

        if (el.name === "img") {
          const src = el.attribs.src;
          if (src && !src.startsWith("http:") && !src.startsWith("https:")) {
            return path.resolve(htmlDirname, src);
          }
        }

        if (el.name === "source") {
          const srcset = el.attribs.srcset;
          if (
            srcset &&
            !srcset.startsWith("http:") &&
            !srcset.startsWith("https:")
          ) {
            return path.resolve(htmlDirname, srcset);
          }
        }

        return undefined;
      })
      .filter((i, p) => !!p)
      .each((i, p) => {
        if (!p) {
          return;
        }
        assetEntrypoints.add(p);
      });

    const manifestEntrypoints = new Set(
      $('link[rel="manifest"][href]')
        .map((i, el) => {
          const href = el.attribs.href;
          if (href && !href.startsWith("http:") && !href.startsWith("https:")) {
            return path.resolve(htmlDirname, href);
          }
        })
        .filter((i, p) => !!p)
        .toArray(),
    );

    for (const entrypoint of manifestEntrypoints) {
      if (outAssets[entrypoint]) {
        continue;
      }

      const manifestDirname = path.dirname(entrypoint);

      const manifestContents = JSON.parse(
        (await fs.readFile(entrypoint)).toString(),
      );
      for (const icon of manifestContents.icons) {
        assetEntrypoints.add(path.resolve(manifestDirname, icon.src));
      }
    }

    for (const entrypoint of assetEntrypoints) {
      if (outAssets[entrypoint]) {
        continue;
      }

      outAssets[entrypoint] = await buildAsset({
        entrypoint,
        outdir: "dist/client",
        assetNames: "static/[name]-[hash]",
      });
    }

    for (const entrypoint of manifestEntrypoints) {
      if (outAssets[entrypoint]) {
        continue;
      }

      outAssets[entrypoint] = await buildManifest({
        entrypoint,
        outdir: "dist/client",
        outAssets,
      });
    }
  }

  for (const htmlFilepath of HTML_ENTRYPOINTS) {
    const htmlDirname = path.dirname(htmlFilepath);
    const htmlContents = (await fs.readFile(htmlFilepath)).toString();
    const $ = cheerio.load(htmlContents);

    $("script[src], link[href], img[src], source[srcset]")
      .filter((i, el) => {
        if (el.name === "script") {
          const src = el.attribs.src;
          return !!(
            src &&
            !src.startsWith("http:") &&
            !src.startsWith("https:")
          );
        }

        if (el.name === "link") {
          const href = el.attribs.href;
          return !!(
            href &&
            !href.startsWith("http:") &&
            !href.startsWith("https:")
          );
        }

        if (el.name === "img") {
          const src = el.attribs.src;
          return !!(
            src &&
            !src.startsWith("http:") &&
            !src.startsWith("https:")
          );
        }

        if (el.name === "source") {
          const srcset = el.attribs.srcset;
          return !!(
            srcset &&
            !srcset.startsWith("http:") &&
            !srcset.startsWith("https:")
          );
        }

        return false;
      })
      .each((i, el) => {
        const $el = $(el);

        if (el.name === "script") {
          const src = path.resolve(htmlDirname, el.attribs.src);
          $el.attr("src", outEntrypoints[src].main);

          if (outEntrypoints[src].css) {
            $("head").append(
              `<link rel="stylesheet" type="text/css" href=${JSON.stringify(outEntrypoints[src].css)}>`,
            );
          }
        }

        if (el.name === "link") {
          const href = path.resolve(htmlDirname, el.attribs.href);
          $el.attr("href", outEntrypoints[href]?.main ?? outAssets[href]);
        }

        if (el.name === "img") {
          const src = path.resolve(htmlDirname, el.attribs.src);
          $el.attr("src", outAssets[src]);
        }

        if (el.name === "source") {
          const srcset = path.resolve(htmlDirname, el.attribs.srcset);
          $el.attr("srcset", outAssets[srcset]);
        }
      });

    await fs.writeFile(
      path.join("dist/client", htmlFilepath.replace("src/pages/", "")),
      $.html(),
    );
  }

  /*
      - extract list of js and css entrypoints from html files
      - esbuild.build js and css entrypoints, enable metafile
      - replace js/css entrypoints in html with built artifacts

      - extract list of blob paths (images, fonts, etc.) from webmanifest
      - for each blob path
        - if blob is already present in metafile, use that
        - if not, copy the file to `path.join(outdir, 'static')` and use that copy
      - save webmanifest with all blob paths replaced to `outdir`

      - extract list of blob paths (images, fonts, etc.) from html files
      - for each blob path
        - if blob is already present in metafile, use that
        - if not, copy the file to `path.join(outdir, 'static')` and use that copy
      - save html files with all js/css/blob paths replaced to `outdir`
    */

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
    minify: true,
  });
}

/**
 * @param {object} options
 * @param {string} options.entrypoint
 * @param {string} options.entryNames
 * @param {string} options.outdir
 * @param {string} options.publicPath
 * */
async function buildClient({ entrypoint, entryNames, outdir, publicPath }) {
  const { errors, metafile } = await esbuild.build({
    entryPoints: [entrypoint],
    bundle: true,
    platform: "browser",
    format: "esm",
    outdir,
    entryNames,
    assetNames: "static/[name]-[hash]",
    metafile: true,
    minify: true,
    publicPath,
    loader: {
      ".png": "file",
      ".woff": "file",
      ".woff2": "file",
    },
  });

  if (errors.length > 0) {
    return null;
  }

  let outputPath;
  let cssBundle;
  /** @type {Record<string, string>} */
  const assets = {};

  /** @param {string | undefined} outputPath */
  const getPublicPath = (outputPath) => {
    if (!outputPath) {
      return undefined;
    }

    return path.join(publicPath, path.relative(outdir, outputPath));
  };

  for (const [out, metadata] of Object.entries(metafile.outputs)) {
    if (metadata.entryPoint) {
      outputPath = out;
      cssBundle = metadata.cssBundle;
      continue;
    }

    const inputs = metadata.inputs;
    const inputsKeys = Object.keys(inputs);
    if (inputsKeys.length === 1) {
      const i = path.resolve(process.cwd(), inputsKeys[0]);
      const o = getPublicPath(out);

      if (i && o) {
        assets[i] = o;
      }
    }
  }

  return {
    path: getPublicPath(outputPath),
    cssBundle: getPublicPath(cssBundle),
    assets,
  };
}

/**
 * @param {object} options
 * @param {string} options.entrypoint
 * @param {string} options.assetNames
 * @param {string} options.outdir
 * */
async function buildAsset({ entrypoint, assetNames, outdir }) {
  const assetContents = await fs.readFile(entrypoint);

  const extname = path.extname(entrypoint);
  const name = path.basename(entrypoint, extname);
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

  await fs.writeFile(path.join(outdir, resolvePath), assetContents);

  return "/" + resolvePath;
}

/**
 * @param {object} options
 * @param {string} options.entrypoint
 * @param {string} options.outdir
 * @param {Record<string, string>} options.outAssets
 * */
async function buildManifest({ entrypoint, outdir, outAssets }) {
  const manifestDirname = path.dirname(entrypoint);
  const resolvePath = path.basename(entrypoint);
  const manifestContents = JSON.parse(
    (await fs.readFile(entrypoint)).toString(),
  );

  await fs.mkdir(path.dirname(path.join(outdir, resolvePath)), {
    recursive: true,
  });

  await fs.writeFile(
    path.join(outdir, resolvePath),
    JSON.stringify({
      ...manifestContents,
      icons: manifestContents.icons.map((icon) => {
        if (
          !icon.src ||
          icon.src.startsWith("http:") ||
          icon.src.startsWith("https:")
        ) {
          return icon;
        }

        const assetSrc = outAssets[path.resolve(manifestDirname, icon.src)];
        if (!assetSrc) {
          return icon;
        }

        return {
          ...icon,
          src: assetSrc,
        };
      }),
    }),
  );

  return "/" + resolvePath;
}
