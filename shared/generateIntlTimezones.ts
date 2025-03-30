import { getLocationFromTimezone } from "./from-timezone.js";

export function generateIntlTimezones() {
  const timezones = globalThis.Intl.supportedValuesOf("timeZone").map(
    (timezoneId) => {
      const place = getLocationFromTimezone(timezoneId);

      if (place === timezoneId) {
        return {
          timezoneId,
          region: undefined,
          place,
        };
      }

      const [region] = timezoneId.split(/\//g);
      return {
        timezoneId,
        region,
        place,
      };
    },
  );

  if (!timezones.some(({ timezoneId }) => timezoneId === "UTC")) {
    // node doesn't seem to include `UTC` in `Intl.supportedValuesOf("timeZone")`
    timezones.push({
      timezoneId: "UTC",
      region: undefined,
      place: "UTC",
    });
  }

  timezones.push({
    timezoneId: "unix",
    region: undefined,
    place: "Unix Epoch",
  });

  return timezones;
}
