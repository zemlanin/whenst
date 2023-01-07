import { Temporal } from "@js-temporal/polyfill";

import { STRICT_RELATIVE_UTC_ID_REGEX } from "./saved-timezones";

const timezones = Intl.supportedValuesOf("timeZone");

// https://github.com/eggert/tz/blob/main/etcetera
const TZ_ETC = "Etc/GMT";

export function guessTimezone(input, { strict } = {}) {
  const inputLowerCase = input.toLowerCase();

  if (inputLowerCase === "factory") {
    // https://github.com/eggert/tz/blob/main/factory
    return null;
  }

  try {
    const directMatch = Temporal.TimeZone.from(input);

    if (directMatch.id === TZ_ETC) {
      return Temporal.TimeZone.from("UTC");
    }

    if (directMatch.id.startsWith(TZ_ETC)) {
      const reverseOffset = directMatch.id.slice(TZ_ETC.length);
      const offset = reverseOffset.startsWith("-")
        ? `+${reverseOffset.length === 2 ? "0" : ""}${reverseOffset.slice(1)}`
        : `-${reverseOffset.length === 2 ? "0" : ""}${reverseOffset.slice(1)}`;

      return Temporal.TimeZone.from(offset);
    }

    return directMatch;
  } catch (e) {
    //
  }

  if (inputLowerCase === "europe/kyiv" || inputLowerCase === "kyiv") {
    return Temporal.TimeZone.from("Europe/Kiev");
  }

  if (inputLowerCase === "utc" || inputLowerCase === "gmt") {
    return Temporal.TimeZone.from("UTC");
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
      return Temporal.TimeZone.from("UTC");
    }

    try {
      return Temporal.TimeZone.from(strictOffset);
    } catch (e) {
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
    return Temporal.TimeZone.from(guessTimezones[0]);
  }

  return null;
}
