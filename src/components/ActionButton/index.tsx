import { JSX } from "preact";
import { useSignal, batch } from "@preact/signals";

export function ActionButton({
  label,
  labelSuccess,
  labelFailure,
  action,
  primary,
  "aria-label": ariaLabel,
  role,
  tabIndex,
}: {
  label: string;
  labelSuccess: string;
  labelFailure: string;
  action?: null | (() => void) | (() => Promise<void>);
  primary?: boolean;
  "aria-label"?: string;
  role?: JSX.HTMLAttributes["role"];
  tabIndex?: number;
}) {
  const labelSignal = useSignal(label);
  const timeoutIdSignal = useSignal<undefined | ReturnType<typeof setTimeout>>(
    undefined,
  );

  const onClick = action
    ? async () => {
        clearTimeout(timeoutIdSignal.peek());

        try {
          await action();
          batch(() => {
            labelSignal.value = labelSuccess;
            timeoutIdSignal.value = setTimeout(() => {
              labelSignal.value = label;
            }, 1000);
          });
        } catch (_e) {
          batch(() => {
            labelSignal.value = labelFailure;
            timeoutIdSignal.value = setTimeout(() => {
              labelSignal.value = label;
            }, 1000);
          });
        }
      }
    : undefined;

  return (
    <button
      disabled={!action}
      onClick={onClick}
      className={primary ? "primary" : undefined}
      aria-label={ariaLabel}
      role={role}
      tabIndex={tabIndex}
    >
      {labelSignal}
    </button>
  );
}
