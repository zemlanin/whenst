import { mountCommandPalette } from "../command-palette/index.js";
import "../keyboard";

const cmdRoot = document.getElementById("cmd-root");
if (cmdRoot) {
  mountCommandPalette(cmdRoot);
}

const cmdTitle = document.getElementById("cmd-title");
if (cmdTitle) {
  mountCommandPalette(cmdTitle);
}
