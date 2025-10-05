import { render } from "preact";
import { useSignal, batch } from "@preact/signals";

import { sqrapCode, syncEverything, accountSignal } from "../api.js";

const main = document.querySelector("main");
if (main) {
  render(<LinkPage />, main);
}

function LinkPage() {
  const checkingCode = useSignal(false);
  const codeError = useSignal(null);
  const codeSuccess = useSignal(false);

  return (
    <>
      <h1>Link</h1>

      <p style="margin-top: 0">
        Enter the code shown on a device you want to sign in
      </p>

      <form
        id="send-code"
        onSubmit={(event) => {
          event.preventDefault();
          const form = event.target;

          if (!(form instanceof HTMLFormElement)) {
            return;
          }

          if (checkingCode.peek()) {
            return;
          }

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

              if (!accountSignal.peek()) {
                void syncEverything();
              }
            },
            (error) => {
              batch(() => {
                codeError.value = error;
                checkingCode.value = false;
              });
            },
          );
        }}
      >
        <input
          name="code"
          required
          maxLength={6}
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
        <p>Done. You can now press “Complete” button on another device</p>
      ) : null}
    </>
  );
}
