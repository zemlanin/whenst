import { render } from "preact";
import { useSignal, useComputed, batch } from "@preact/signals";

import { sqrapInit, sqrapStatus, sqrapCode, loadSettings } from "./api";

render(<LinkPage />, document.querySelector("main"));

function LinkPage() {
  const code = useSignal("");

  const receiverStarting = useSignal(false);
  const startError = useSignal(null);
  const disableStart = useComputed(
    () => receiverStarting.value || !!code.value
  );
  const startButtonText = useComputed(() => (code.value ? "✔" : "Start"));

  const checkingStatus = useSignal(false);
  const statusError = useSignal(null);
  const disableStatusCheck = useComputed(
    () => !!checkingStatus.value || !!statusError.value || !code.value
  );
  const checkButtonText = useComputed(() =>
    statusError.value ? "⚠" : "Receive"
  );

  const checkingCode = useSignal(false);
  const codeError = useSignal(null);
  const codeSuccess = useSignal(false);

  return (
    <>
      <h1>Link a device</h1>

      <h2>Receive settings here</h2>

      <ol style="margin-top: 0">
        <li>
          Press this button:{" "}
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
                }
              );
            }}
            className="primary"
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
              On a device you want to receive settings from:
              <ol>
                <li>
                  Open this page (
                  <b>{location.origin.replace(/^https?:\/\//, "")}/link</b>)
                </li>
                <li>
                  Enter code <b>{code}</b> in the field under “Send settings
                  from here”
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
                        await loadSettings();
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
                    }
                  );
                }}
                disabled={disableStatusCheck}
              >
                {checkButtonText}
              </button>
              <br />
              <i>Your current settings here will be replaced</i>
            </li>

            {statusError.value ? (
              <li style="color: red">
                Failed to check. Update the page and start linking again
              </li>
            ) : null}
          </>
        ) : null}
      </ol>

      <h2>Send settings from here</h2>

      <p style="margin-top: 0">
        Enter the code shown on a device you want to send settings to:
      </p>

      <form
        id="send-code"
        onSubmit={(event) => {
          event.preventDefault();
          const form = event.target;

          batch(() => {
            checkingCode.value = true;
            codeError.value = null;
            codeSuccess.value = false;
          });

          sqrapCode({ code: form.code.value }).then(
            () => {
              form.code.value = "";

              batch(() => {
                codeSuccess.value = true;
                checkingCode.value = false;
              });
            },
            (error) => {
              batch(() => {
                codeError.value = error;
                checkingCode.value = false;
              });
            }
          );
        }}
        disabled={checkingCode}
      >
        <input
          name="code"
          required
          maxLength="6"
          placeholder="code"
          autoComplete="off"
        />{" "}
        <button className="primary" type="submit" disabled={checkingCode}>
          Send
        </button>
      </form>

      {codeError.value ? (
        <p style="color: red">Failed to send. Check the code and try again</p>
      ) : null}

      {codeSuccess.value ? (
        <p>Done. You can now press “Receive” button on another device</p>
      ) : null}
    </>
  );
}
