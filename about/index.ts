import { mountCommandPalette } from "../command-palette";

const cmdRoot = document.getElementById("cmd-root");
if (cmdRoot) {
  mountCommandPalette(cmdRoot);
}
