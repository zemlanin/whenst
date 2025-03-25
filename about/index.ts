import { mountCommandPalette } from "../command-palette/index.js";
import "../keyboard";

const cmdRoot = document.getElementById("cmd-root");
if (cmdRoot) {
  mountCommandPalette(cmdRoot);
}
