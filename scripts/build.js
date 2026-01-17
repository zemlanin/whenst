// @ts-check
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import esbuild from "esbuild";
import Handlebars from "handlebars";

const handlebars = Handlebars.noConflict();

const PAGES_BASE = "src/pages/";
const HANDLEBARS_ENTRYPOINTS = [
  path.join(PAGES_BASE, "about/index.html.hbs"),
  path.join(PAGES_BASE, "home/index.html.hbs"),
  path.join(PAGES_BASE, "link/index.html.hbs"),
  path.join(PAGES_BASE, "settings/index.html.hbs"),
  path.join(PAGES_BASE, "slack/install/success.html.hbs"),
];

await build();

async function build() {
  /** @type {Set<string>} */
  const codeAssets = new Set();
  /** @type {Set<string>} */
  const codeEntrypoints = new Set();
  /** @type {Set<string>} */
  const codeManifests = new Set();

  /**
   * Resolve a relative-from-repo-root path into an absolute one and store it
   * */
  handlebars.registerHelper(
    "static",
    /**
     * @param {string} relative
     * */
    (relative, options) => {
      if (options.hash.type === "entrypoint") {
        codeEntrypoints.add(relative);
      } else if (options.hash.type === "asset") {
        codeAssets.add(relative);
      } else if (options.hash.type === "manifest") {
        codeManifests.add(relative);
      } else if (options.hash.type === "css-modules") {
        //
      } else {
        throw new Error(`unknown 'static' type: ${options.hash.type}`);
      }

      return relative;
    },
  );

  handlebars.registerPartial(
    "head",
    (
      await fs.readFile(path.join(PAGES_BASE, "_partials/head.html.hbs"))
    ).toString(),
  );

  handlebars.registerPartial(
    "nav",
    (
      await fs.readFile(path.join(PAGES_BASE, "_partials/nav.html.hbs"))
    ).toString(),
  );

  for (const handebarsFilepath of HANDLEBARS_ENTRYPOINTS) {
    const hbsContents = (await fs.readFile(handebarsFilepath)).toString();
    handlebars.compile(hbsContents, {
      explicitPartialContext: true,
    })({});
  }

  /** @type {Record<string, {main: string | undefined; css: string | undefined}>} */
  const outEntrypoints = {};
  /** @type {Record<string, string>} */
  const outAssets = {};
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

    for (const absolutePath of Object.keys(result.assets)) {
      outAssets[path.relative(process.cwd(), absolutePath)] =
        result.assets[absolutePath];
    }
  }

  // collect assets
  for (const entrypoint of codeManifests) {
    if (outAssets[entrypoint]) {
      continue;
    }

    const manifestDirname = path.dirname(entrypoint);

    const manifestContents = JSON.parse(
      (await fs.readFile(entrypoint)).toString(),
    );
    for (const icon of manifestContents.icons) {
      codeAssets.add(
        path.relative(process.cwd(), path.resolve(manifestDirname, icon.src)),
      );
    }
  }

  for (const entrypoint of codeAssets) {
    if (outAssets[entrypoint]) {
      continue;
    }

    outAssets[entrypoint] = await buildAsset({
      entrypoint,
      outdir: "dist/client",
      assetNames: "static/[name]-[hash]",
    });
  }

  for (const entrypoint of codeManifests) {
    if (outAssets[entrypoint]) {
      continue;
    }

    outAssets[entrypoint] = await buildManifest({
      entrypoint,
      outdir: "dist/client",
      outAssets,
    });
  }

  await buildServiceWorker({
    outdir: "dist/client",
    outEntrypoints,
    outAssets,
  });

  await buildServerStaticManifest({
    outdir: "dist/server",
    outEntrypoints,
    outAssets,
  });

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

        const assetSrc =
          outAssets[
            path.relative(
              process.cwd(),
              path.resolve(manifestDirname, icon.src),
            )
          ];
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
async function buildServerStaticManifest({
  outdir,
  outEntrypoints,
  outAssets,
}) {
  await fs.mkdir(outdir, {
    recursive: true,
  });

  await fs.writeFile(
    path.join(outdir, "static.js"),
    `export default ${JSON.stringify(
      {
        entrypoints: outEntrypoints,
        assets: outAssets,
      },
      undefined,
      2,
    )}`,
  );
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
