import { VNode } from "preact";
import { createPortal } from "preact/compat";

export function TitleBarPortal({ children }: { children: VNode }) {
  const container = document.querySelector("#title-bar .heading");

  if (!container) {
    return;
  }

  return createPortal(children, container);
}
