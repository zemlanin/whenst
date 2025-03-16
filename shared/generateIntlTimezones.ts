export function generateIntlTimezones() {
  const timezones = globalThis.Intl.supportedValuesOf("timeZone").map(
    (timezoneId) => {
      const [region, ...rest] = timezoneId.split(/\//g);

      if (rest.length === 0) {
        return {
          timezoneId,
          region: undefined,
          place: timezoneId,
        };
      }

      const originalPlace = rest[rest.length - 1];
      const place = (() => {
        if (originalPlace === "Kiev") {
          return "Kyiv";
        }

        if (originalPlace.startsWith("St.")) {
          return originalPlace.replace(/^St\./, "Saint");
        }

        if (originalPlace.startsWith("Sao_")) {
          return originalPlace.replace(/^Sao/, "São");
        }

        return originalPlace;
      })()
        .replace(/_/g, " ")
        .trim();

      return {
        timezoneId,
        region,
        place,
      };
    },
  );
  timezones.push({
    timezoneId: "unix",
    region: undefined,
    place: "Unix Epoch",
  });

  return timezones;
}
