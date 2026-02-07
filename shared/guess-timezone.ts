import { STRICT_RELATIVE_UTC_ID_REGEX } from "../shared/from-timezone.js";

const timezones = globalThis.Intl.supportedValuesOf("timeZone");
const timezonesSet = new Set(timezones);

// https://github.com/eggert/tz/blob/main/etcetera
const TZ_ETC = "Etc/GMT";

export function guessTimezone(
  input: string,
  { strict }: { strict?: boolean } = {},
): string | null {
  const inputLowerCase = input.toLowerCase();

  if (inputLowerCase === "factory") {
    // https://github.com/eggert/tz/blob/main/factory
    return null;
  }

  const directMatch = timezonesSet.has(input) ? input : null;

  if (directMatch === TZ_ETC) {
    return "UTC";
  }

  if (directMatch?.startsWith(TZ_ETC)) {
    const reverseOffset = directMatch.slice(TZ_ETC.length);
    const offset = reverseOffset.startsWith("-")
      ? `+${reverseOffset.length === 2 ? "0" : ""}${reverseOffset.slice(1)}`
      : `-${reverseOffset.length === 2 ? "0" : ""}${reverseOffset.slice(1)}`;

    return offset;
  }

  if (directMatch) {
    return directMatch;
  }

  if (inputLowerCase === "europe/kyiv" || inputLowerCase === "kyiv") {
    return "Europe/Kiev";
  }

  if (inputLowerCase === "utc" || inputLowerCase === "gmt") {
    return "UTC";
  }

  if (inputLowerCase.match(/^(utc|gmt)?[+-][0-1]?[0-9](:[0-5][0-9])?$/)) {
    // ^- RELATIVE_UTC_ID_REGEX
    const offset =
      inputLowerCase.startsWith("utc") || inputLowerCase.startsWith("gmt")
        ? inputLowerCase.slice("utc".length)
        : inputLowerCase;

    const strictOffset = offset.match(STRICT_RELATIVE_UTC_ID_REGEX)
      ? offset
      : `${offset[0]}0${offset.slice(1)}`;

    if (
      strictOffset === "+00" ||
      strictOffset === "+00:00" ||
      strictOffset === "-00" ||
      strictOffset === "-00:00"
    ) {
      return "UTC";
    }

    try {
      return strictOffset;
    } catch (_e) {
      //
    }
  }

  const guessTimezones = strict
    ? timezones.filter((v) => {
        const tzLowerCase = v.toLowerCase();
        if (tzLowerCase === inputLowerCase) {
          return true;
        }

        const parts = tzLowerCase.split("/");
        const last = parts[parts.length - 1];

        return inputLowerCase === last;
      })
    : timezones.filter((v) => v.toLowerCase().includes(inputLowerCase));

  if (guessTimezones.length === 1) {
    return guessTimezones[0];
  }

  return null;
}
