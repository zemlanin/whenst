// @ts-check
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import esbuild from "esbuild";
import * as cheerio from "cheerio";
import Handlebars from "handlebars";

const PAGES_BASE = "src/pages/";
const HANDLEBARS_ENTRYPOINTS = [
  path.join(PAGES_BASE, "about/index.html.hbs"),
  path.join(PAGES_BASE, "home/index.html.hbs"),
  path.join(PAGES_BASE, "link/index.html.hbs"),
  path.join(PAGES_BASE, "settings/index.html.hbs"),
];

await build();

async function build() {
  /** @type {Set<string>} */
  const codeEntrypoints = new Set();
  /** @type {Record<string, string>} */
  const outAssets = {};

  Handlebars.registerPartial(
    "head",
    (
      await fs.readFile(path.join(PAGES_BASE, "_partials/head.html.hbs"))
    ).toString(),
  );

  Handlebars.registerPartial(
    "nav",
    (
      await fs.readFile(path.join(PAGES_BASE, "_partials/nav.html.hbs"))
    ).toString(),
  );

  const htmlInputs = await Promise.all([
    ...HANDLEBARS_ENTRYPOINTS.map(async (handebarsFilepath) => {
      const htmlDirname = path.dirname(handebarsFilepath);
      const hbsContents = (await fs.readFile(handebarsFilepath)).toString();
      const htmlContents = Handlebars.compile(hbsContents, {
        explicitPartialContext: true,
      })({});
      const $ = cheerio.load(htmlContents);
      const outfile = path.join(
        "dist/client",
        handebarsFilepath.replace(PAGES_BASE, "").replace(/\.hbs$/, ""),
      );

      return { dir: htmlDirname, $, outfile };
    }),
  ]);

  // collect JS/CSS entrypoints
  for (const { dir: htmlDirname, $ } of htmlInputs) {
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
    const outdir = "dist/client";
    const isPage = entrypoint.startsWith(path.join(process.cwd(), PAGES_BASE));

    const result = await buildClient({
      entrypoint,
      entryNames: isPage
        ? "static/[dir]/[name]-[hash]"
        : "static/[name]-[hash]",
      outbase: isPage ? PAGES_BASE : undefined,
      outdir,
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

  // collect assets
  for (const { dir: htmlDirname, $ } of htmlInputs) {
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

  await buildServiceWorker({
    outdir: "dist/client",
    outEntrypoints,
    outAssets,
  });

  // replace entrypoints and assets with built paths
  for (const { dir: htmlDirname, $, outfile } of htmlInputs) {
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
            $(
              `<link rel="stylesheet" type="text/css" href=${JSON.stringify(outEntrypoints[src].css)}>`,
            ).insertBefore(`head link[rel="stylesheet"][href]`);
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

    await fs.mkdir(path.dirname(outfile), { recursive: true });
    await fs.writeFile(outfile, $.html());
  }

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
 * @param {string | undefined} options.outbase
 * @param {string} options.outdir
 * @param {string} options.publicPath
 * */
async function buildClient({
  entrypoint,
  entryNames,
  outbase,
  outdir,
  publicPath,
}) {
  const { errors, metafile } = await esbuild.build({
    entryPoints: [entrypoint],
    bundle: true,
    platform: "browser",
    format: "esm",
    outdir,
    outbase,
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

/**
 * @param {object} options
 * @param {string} options.outdir
 * @param {Record<string, {main?: string, cssBundle?: string}>} options.outEntrypoints
 * @param {Record<string, string>} options.outAssets
 * */
async function buildServiceWorker({ outdir, outEntrypoints, outAssets }) {
  const pages = [
    ...new Set(
      HANDLEBARS_ENTRYPOINTS.map((p) =>
        path.dirname(path.relative(PAGES_BASE, p)),
      ).map((p) => (p === "home" ? "/" : `/${p}`)),
    ),
  ];

  const manifest = [
    ...new Set([
      ...pages,
      ...Object.values(outEntrypoints)
        .flatMap(({ main, cssBundle }) => [main ?? "", cssBundle ?? ""])
        .filter(Boolean),
      ...Object.values(outAssets),
    ]),
  ];

  /*
    `version` is used as Cache Storage API's key

    previously, `version` was a hash of service-worker, but when migrating
    from parcel to esbuild it seemed wasteful to discard the whole cache
    on every client-code change
  */
  let version = "2025-11-01";

  await esbuild.build({
    entryPoints: ["src/service-worker/index.ts"],
    outdir,
    entryNames: "service-worker",
    bundle: true,
    minify: true,
    platform: "neutral",
    plugins: [
      {
        name: "service-worker-manifest",
        setup(build) {
          build.onResolve(
            { filter: /^service-worker-manifest$/ },
            async (args) => {
              return {
                path: args.path,
                namespace: "service-worker-manifest-stub",
              };
            },
          );

          build.onLoad(
            { filter: /.*/, namespace: "service-worker-manifest-stub" },
            async () => {
              return {
                contents: JSON.stringify({ manifest, version, pages }),
                loader: "json",
              };
            },
          );
        },
      },
    ],
  });
}
