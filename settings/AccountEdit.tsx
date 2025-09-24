import { Signal, useSignal, useComputed, batch } from "@preact/signals";

import {
  signOut,
  sqrapInit,
  sqrapStatus,
  loadSession,
  wipeDatabase,
} from "../api.js";

const sessionSignal = new Signal<{ signedIn: boolean } | null>(null);

loadSession().then((session) => {
  sessionSignal.value = session;
});

export function AccountEdit() {
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

  if (sessionSignal.value?.signedIn) {
    return (
      <button
        onClick={() => {
          signOut().then(async () => {
            // request new session to invalidate SW cache
            await loadSession();
            await wipeDatabase();

            location.href = "/";
          });
        }}
      >
        Sign out
      </button>
    );
  }

  return (
    <>
      <div>Sign in to enable sync</div>
      <ul>
        <li>
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
            <li>
              On another device:
              <ol>
                <li>
                  Open <b>{location.origin.replace(/^https?:\/\//, "")}/link</b>
                </li>
                <li>
                  Enter <b>{code}</b> in the “Code” field
                </li>
                <li>Press “Send” button</li>
              </ol>
            </li>

            <li>
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
                        // request new settings to invalidate SW cache
                        await loadSession();
                        await wipeDatabase();
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
              <i>This will replace settings</i>
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
