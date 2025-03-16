import { mountCommandPalette } from "../command-palette/index.js";

const cmdRoot = document.getElementById("cmd-root");
if (cmdRoot) {
  mountCommandPalette(cmdRoot);
}
