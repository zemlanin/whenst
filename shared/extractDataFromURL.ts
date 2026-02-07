import { guessTimezone } from "./guess-timezone.js";

export function extractDataFromURL(href: string): [] | [string, string] {
  const unixURLPattern = new URLPattern(
    {
      pathname: "/unix{/:seconds(\\d*)}?",
    },
    // https://github.com/kenchris/urlpattern-polyfill/issues/127
    { ignoreCase: true } as unknown as string,
  );
  const matchesUnix = unixURLPattern.test(href);
  if (matchesUnix) {
    const { seconds } = unixURLPattern.exec(href)?.pathname.groups ?? {};

    if (!seconds || !seconds.match(/^[0-9]{1,10}$/)) {
      return ["unix", "now"];
    }

    return ["unix", new Date(+seconds * 1000).toISOString().replace(/Z$/, "")];
  }

  const geoURLPattern = new URLPattern({
    pathname: "/:zeroth{/*}?",
  });

  const matchesGeo = geoURLPattern.test(href);
  if (!matchesGeo) {
    return [];
  }

  const { zeroth, 0: extra } = geoURLPattern.exec(href)?.pathname.groups || {
    zeroth: "",
  };

  if (zeroth === "") {
    return [];
  }

  const [first, second, third] = extra?.split("/") ?? [];

  let remoteTZ = guessTimezone(`${zeroth}/${first}/${second}`, {
    strict: true,
  });
  if (remoteTZ) {
    return [remoteTZ, third || "now"];
  }

  remoteTZ = guessTimezone(`${zeroth}/${first}`, { strict: true });
  if (remoteTZ) {
    return [remoteTZ, second || "now"];
  }

  remoteTZ = guessTimezone(`${zeroth}`, { strict: true });
  if (remoteTZ) {
    return [remoteTZ, first || "now"];
  }

  return [];
}
