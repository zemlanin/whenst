import { useSignal, useComputed, batch } from "@preact/signals";

import {
  signOut,
  sqrapInit,
  sqrapStatus,
  accountSignal,
  sendAuthCheckMessage,
} from "../api.js";
import { Show } from "@preact/signals/utils";

export function AccountEdit() {
  return (
    <Show when={accountSignal} fallback={<SignedOut />}>
      <SignedIn />
    </Show>
  );
}

function SignedIn() {
  return (
    <button
      onClick={() => {
        signOut().then(async () => {
          await sendAuthCheckMessage();

          location.href = "/";
        });
      }}
    >
      Sign out
    </button>
  );
}

function SignedOut() {
  const code = useSignal("");

  const receiverStarting = useSignal(false);
  const startError = useSignal(null);
  const disableStart = useComputed(
    () => receiverStarting.value || !!code.value,
  );
  const startButtonText = useComputed(() => (code.value ? "✔" : "Start"));

  const checkingStatus = useSignal(false);
  const statusError = useSignal(null);
  const disableStatusCheck = useComputed(
    () => !!checkingStatus.value || !!statusError.value || !code.value,
  );
  const checkButtonText = useComputed(() =>
    statusError.value ? "⚠" : "Complete",
  );

  return (
    <>
      <div>Sign in to enable sync</div>
      <ul>
        <li style="margin-block: 0.5rem">
          Using another device:{" "}
          <button
            onClick={() => {
              batch(() => {
                startError.value = null;
                receiverStarting.value = true;
              });

              sqrapInit().then(
                async (resp) => {
                  batch(() => {
                    receiverStarting.value = false;
                    code.value = resp.code;
                  });
                },
                (error) => {
                  batch(() => {
                    startError.value = error;
                    receiverStarting.value = false;
                  });
                },
              );
            }}
            disabled={disableStart}
          >
            {startButtonText}
          </button>
        </li>

        {startError.value ? (
          <li style="color: red">Failed to start. Try again</li>
        ) : null}

        {code.value ? (
          <>
            <li style="margin-block: 0.5rem">
              On another device:
              <ol>
                <li style="margin-block: 0.5rem">
                  Open <b>{location.origin.replace(/^https?:\/\//, "")}/link</b>
                </li>
                <li style="margin-block: 0.5rem">
                  Enter <b>{code}</b> in the “Code” field
                </li>
                <li style="margin-block: 0.5rem">Press “Send” button</li>
              </ol>
            </li>

            <li style="margin-block: 0.5rem">
              Press this button:{" "}
              <button
                className="primary"
                onClick={() => {
                  batch(() => {
                    checkingStatus.value = true;
                    statusError.value = null;
                  });

                  sqrapStatus({ code: code.peek() }).then(
                    async ({ done }) => {
                      if (done) {
                        await sendAuthCheckMessage();
                        location.href = "/";
                        return;
                      }

                      checkingStatus.value = false;
                    },
                    (error) => {
                      batch(() => {
                        statusError.value = error;
                        checkingStatus.value = false;
                      });
                    },
                  );
                }}
                disabled={disableStatusCheck}
              >
                {checkButtonText}
              </button>
              <br />
              <i>
                This will replace when.st data on this device with data from
                another
              </i>
            </li>

            {statusError.value ? (
              <li style="color: red">
                Failed to check. Update the page and start linking again
              </li>
            ) : null}
          </>
        ) : null}
      </ul>
    </>
  );
}
