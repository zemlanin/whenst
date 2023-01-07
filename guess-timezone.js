import { Temporal } from "@js-temporal/polyfill";

import { STRICT_RELATIVE_UTC_ID_REGEX } from "./saved-timezones";

const timezones = Intl.supportedValuesOf("timeZone");

export function guessTimezone(input) {
  const inputLowerCase = input.toLowerCase();

  try {
    return Temporal.TimeZone.from(input);
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

  const guessTimezones = timezones.filter((v) =>
    v.toLowerCase().includes(inputLowerCase)
  );

  if (guessTimezones.length === 1) {
    return Temporal.TimeZone.from(guessTimezones[0]);
  }

  return null;
}
