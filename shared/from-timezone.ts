export const RELATIVE_UTC_ID_REGEX = /^[+-][0-1]?[0-9](:[0-5][0-9])?$/;
export const STRICT_RELATIVE_UTC_ID_REGEX = /^[+-][0-1][0-9](:[0-5][0-9])?$/;

export function getLocationFromTimezone(tz: string) {
  if (tz === "UTC") {
    return "UTC";
  }

  if (tz.match(STRICT_RELATIVE_UTC_ID_REGEX)) {
    return "UTC" + tz.replace(/^([+-])0?(1?[0-9]):00$/, "$1$2");
  }

  const parts = tz.split("/");

  const tzLocation = parts[parts.length - 1];

  if (!tzLocation) {
    // fallback for invalidly saved timezones
    return tz;
  }

  if (tzLocation === "Kiev") {
    return "Kyiv";
  }

  if (tzLocation === "Sao_Paulo") {
    return "São Paulo";
  }

  if (tzLocation.startsWith("St.") || tzLocation.startsWith("St_")) {
    return tzLocation
      .replace(/^St\.?/, "Saint")
      .replace(/_/g, " ")
      .trim();
  }

  return tzLocation.replace(/_/g, " ").trim();
}

export function getPathnameFromTimezone(tz: string) {
  if (tz === "unix") {
    return "/unix";
  }

  if (tz === "UTC") {
    return "/UTC";
  }

  if (tz.match(STRICT_RELATIVE_UTC_ID_REGEX)) {
    return "/UTC" + tz.replace(/^([+-])0?(1?[0-9]):00$/, "$1$2");
  }

  if (tz === "Europe/Kiev") {
    return "/Europe/Kyiv";
  }

  return `/${tz}`;
}
