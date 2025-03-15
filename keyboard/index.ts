window.addEventListener("keyup", function handleArrowNavigation(event) {
  const target = event.target;
  if (!target || !(target instanceof HTMLElement)) {
    return;
  }

  const parentRadiogroup = target.closest('[role="radiogroup"]');
  const parentTablist = target.closest('[role="tablist"]');
  const parentMenubar = target.closest('[role="menubar"]');
  const parentTable = target.closest('[role="table"]');

  const children =
    parentRadiogroup?.querySelectorAll<HTMLElement>('[role="radio"]') ??
    parentTablist?.querySelectorAll<HTMLElement>('[role="tab"]') ??
    parentMenubar?.querySelectorAll<HTMLElement>('[role="menuitem"]') ??
    parentTable?.querySelectorAll<HTMLElement>('[role="row"]') ??
    null;

  if (!children || !children.length) {
    return;
  }

  const currentIndex = [...children].findIndex((c) => c === target);

  const orientation = getOrientation(
    parentRadiogroup ?? parentTablist ?? parentMenubar ?? parentTable,
  );
  const prevKey =
    orientation === "horizontal"
      ? "ArrowLeft"
      : orientation === "vertical"
        ? "ArrowUp"
        : null;

  const nextKey =
    orientation === "horizontal"
      ? "ArrowRight"
      : orientation === "vertical"
        ? "ArrowDown"
        : null;

  const focusTarget =
    event.key === prevKey
      ? children[Math.max(0, currentIndex - 1)]
      : event.key === nextKey
        ? children[Math.min(currentIndex + 1, children.length - 1)]
        : null;

  if (focusTarget && focusTarget !== target) {
    event.preventDefault();
    focusTarget.tabIndex = 0;
    focusTarget.focus();
    if (target !== focusTarget) {
      target.tabIndex = -1;
    }
  }
});

window.addEventListener("keyup", function handleTableRowEnter(event) {
  if (event.key !== "Enter") {
    return;
  }

  const target = event.target;
  if (!target || !(target instanceof HTMLElement)) {
    return;
  }

  const role = target.getAttribute("role");
  if (role !== "row") {
    return;
  }

  const childAnchor = target.querySelector<HTMLAnchorElement>("a[href]");
  if (!childAnchor) {
    return;
  }

  if (!event.altKey && !event.ctrlKey && !event.metaKey) {
    window.location.href = childAnchor.href;
  }
});

function getOrientation(el: Element | null) {
  if (!el) {
    return null;
  }

  const ariaOrientation = el.getAttribute("aria-orientation");
  if (ariaOrientation === "horizontal" || ariaOrientation === "vertical") {
    return ariaOrientation;
  }

  const role = el.getAttribute("role");
  switch (role) {
    case "tablist":
    case "menubar":
      return "horizontal";
    case "table":
      return "vertical";
  }

  return null;
}
