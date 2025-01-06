import { Namer } from "@parcel/plugin";
import path from "node:path";

export default new Namer({
  name({ bundle }) {
    // keep bundles with a stable name (for example, `/index.html`) as-is
    if (bundle.needsStableName) {
      return null;
    }

    const filePath = bundle.getMainEntry()?.filePath ?? "index.js";
    const ext = path.extname(filePath);
    const base = path.basename(filePath, ext);

    // move bundles without a stable name
    // (scripts, styles, and images, referenced in stable-name bundles)
    // to `static` subdirectory to share them between deployments
    // (so that we can serve outdated assets if user tries to load them)
    return `static/${base}.${bundle.hashReference}.${bundle.type}`;
  },
});
