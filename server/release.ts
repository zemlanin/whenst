import fs from "node:fs";
import path from "node:path";

import { S3 } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import mime from "mime";

const client = new S3({
  region: "auto",
  endpoint: "https://fly.storage.tigris.dev",
});

// parcel doesn't support top-level await in entrypoint files
// https://github.com/parcel-bundler/parcel/issues/4028
release().then(
  () => {
    process.exit();
  },
  (error) => {
    console.error(error);
    process.exit(1);
  },
);

async function release() {
  const distPath = path.resolve(process.cwd(), "dist");

  await iterateAndUpload(path.resolve(distPath, "client/static"));

  async function iterateAndUpload(parentPath: string) {
    for (const dirent of await fs.promises.readdir(parentPath, {
      withFileTypes: true,
      recursive: true,
    })) {
      const filepath = path.resolve(dirent.parentPath, dirent.name);

      if (dirent.isFile()) {
        const fileStream = fs.createReadStream(filepath);
        const key = path.relative(distPath, filepath);

        console.log(key);

        const upload = new Upload({
          params: {
            Bucket: "whenst", // TODO: move to `process.env`
            Key: key,
            Body: fileStream,
            ContentType: mime.getType(filepath) ?? undefined,
            CacheControl: `public, max-age=${365 * 24 * 60 * 60}, immutable`,
          },
          client,
          queueSize: 3,
        });

        upload.on("httpUploadProgress", (progress) => {
          console.log(progress);
        });

        await upload.done();
      }
    }
  }
}
