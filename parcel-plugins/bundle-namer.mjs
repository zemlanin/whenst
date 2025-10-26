import { Namer } from "@parcel/plugin";
import path from "node:path";

export default new Namer({
  name({ bundle, options }) {
    const filePath = bundle.getMainEntry()?.filePath ?? "index.js";
    const relativePath = path.relative(options.projectRoot, filePath)

    // keep bundles with a stable name (for example, `/index.html`) as-is
    // but remove `src/pages` from their out path
    if (bundle.needsStableName) {
      if (relativePath.startsWith('src/pages/')) {
        return relativePath.slice('src/pages/'.length)
      }

      return null;
    }

    const ext = path.extname(filePath);
    const base = path.basename(filePath, ext);

    // move bundles without a stable name
    // (scripts, styles, and images, referenced in stable-name bundles)
    // to `static` subdirectory to share them between deployments
    // (so that we can serve outdated assets if user tries to load them)
    return `static/${base}.${bundle.hashReference}.${bundle.type}`;
  },
});
