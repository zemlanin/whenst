window.addEventListener("keyup", function handleArrowNavigation(event) {
  const target = event.target;
  if (!target || !(target instanceof HTMLElement)) {
    return;
  }

  if (
    event.key === "ArrowDown" &&
    target.getAttribute("role") === "combobox" &&
    target.hasAttribute("aria-controls")
  ) {
    const controlsId = target.getAttribute("aria-controls");
    const controlsElement = controlsId
      ? document.getElementById(controlsId)
      : null;
    const firstFocusableOption =
      controlsElement?.querySelector<HTMLElement>(
        '[role="option"]:not([tabindex="-1"])',
      ) ??
      controlsElement?.querySelector<HTMLElement>('[role="option"]') ??
      null;

    if (firstFocusableOption) {
      event.preventDefault();
      firstFocusableOption.tabIndex = 0;
      firstFocusableOption.focus();
      return;
    }
  }

  const parentRadiogroup = target.closest('[role="radiogroup"]');
  const parentTablist = target.closest('[role="tablist"]');
  const parentMenubar = target.closest('[role="menubar"]');
  const parentTable = target.closest('[role="table"]');
  const parentListbox = target.closest('[role="listbox"]');

  const parentWhatever =
    parentRadiogroup ??
    parentTablist ??
    parentMenubar ??
    parentTable ??
    parentListbox;

  const children =
    parentRadiogroup?.querySelectorAll<HTMLElement>('[role="radio"]') ??
    parentTablist?.querySelectorAll<HTMLElement>('[role="tab"]') ??
    parentMenubar?.querySelectorAll<HTMLElement>('[role="menuitem"]') ??
    parentTable?.querySelectorAll<HTMLElement>('[role="row"]') ??
    parentListbox?.querySelectorAll<HTMLElement>('[role="option"]') ??
    null;

  if (!children || !children.length) {
    return;
  }

  const currentIndex = [...children].findIndex((c) => c === target);

  const orientation = getOrientation(parentWhatever);
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

  const focusTarget = (() => {
    if (event.key === prevKey && currentIndex === 0) {
      if (parentWhatever && parentWhatever.id) {
        const controlledBy = document.querySelector<HTMLElement>(
          `[aria-controls="${parentWhatever.id}"]`,
        );

        if (controlledBy) {
          return controlledBy;
        }
      }
    }

    if (event.key === prevKey) {
      return children[Math.max(0, currentIndex - 1)];
    }

    if (event.key === nextKey) {
      return children[Math.min(currentIndex + 1, children.length - 1)];
    }

    return null;
  })();

  if (focusTarget && focusTarget !== target) {
    event.preventDefault();
    focusTarget.tabIndex = 0;
    focusTarget.focus();

    for (const c of children) {
      if (c === focusTarget) {
        continue;
      }

      c.tabIndex = -1;
    }
  }
});

window.addEventListener("keyup", function handleTableRowEnter(event) {
  if (event.key !== "Enter" && event.key !== "Escape") {
    return;
  }

  const target = event.target;
  if (!target || !(target instanceof HTMLElement)) {
    return;
  }

  const role = target.getAttribute("role");
  if (role !== "row" && role !== "option") {
    return;
  }

  if (event.key === "Enter") {
    const childAnchor = target.querySelector<HTMLAnchorElement>("a[href]");
    if (childAnchor) {
      if (!event.altKey && !event.ctrlKey && !event.metaKey) {
        window.location.href = childAnchor.href;
      }
    }

    return;
  }

  if (event.key === "Escape") {
    // focus on controller element
    if (role === "option") {
      const parentListbox = target.closest('[role="listbox"]');

      if (parentListbox && parentListbox.id) {
        const controlledBy = document.querySelector<HTMLElement>(
          `[aria-controls="${parentListbox.id}"]`,
        );

        if (controlledBy) {
          controlledBy.focus();
        }
      }
    }

    return;
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
    case "listbox":
      return "vertical";
  }

  return null;
}
