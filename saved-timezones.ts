import { Temporal } from "@js-temporal/polyfill";

export const RELATIVE_UTC_ID_REGEX = /^[+-][0-1]?[0-9](:[0-5][0-9])?$/;
export const STRICT_RELATIVE_UTC_ID_REGEX = /^[+-][0-1][0-9](:[0-5][0-9])?$/;

export function getLocationFromTimezone(tz: Temporal.TimeZone | string) {
  if (tz.toString() === "UTC") {
    return "UTC";
  }

  if (tz.toString().match(STRICT_RELATIVE_UTC_ID_REGEX)) {
    return "UTC" + tz.toString().replace(/^([+-])0?(1?[0-9]):00$/, "$1$2");
  }

  const parts = tz.toString().split("/");

  const location = parts.length === 3 ? `${parts[1]}/${parts[2]}` : parts[1];

  if (!location) {
    // fallback for invalidly saved timezones
    return tz.toString();
  }

  if (location === "Kiev") {
    return "Kyiv";
  } else if (location === "Sao_Paulo") {
    return "São Paulo";
  }

  return location.replace(/^St_/, "St. ").replace(/_/g, " ");
}

export function getPathnameFromTimezone(tz: Temporal.TimeZone | string) {
  if (tz.toString() === "unix") {
    return "/unix";
  }

  if (tz.toString() === "UTC") {
    return "/UTC";
  }

  if (tz.toString().match(STRICT_RELATIVE_UTC_ID_REGEX)) {
    return "/UTC" + tz.toString().replace(/^([+-])0?(1?[0-9]):00$/, "$1$2");
  }

  if (tz.toString() === "Europe/Kiev") {
    return "/Europe/Kyiv";
  }

  return `/${tz}`;
}
