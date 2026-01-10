import { useSignal, batch } from "@preact/signals";

import { sqrapCode, syncEverything, accountSignal } from "../../api.js";

export function LinkEnterCode() {
  const checkingCode = useSignal(false);
  const codeError = useSignal(null);
  const codeSuccess = useSignal(false);

  return (
    <>
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

          sqrapCode({
            code: form.code.value.toUpperCase().replace(/\s+/, ""),
          }).then(
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
          placeholder="sync code"
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
        <p>Done. You can now press “Finish” button on another device</p>
      ) : null}
    </>
  );
}
