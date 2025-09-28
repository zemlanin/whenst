export const POSITION_ALPHABET =
  "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
export const POSITION_ALPHABET_START = "0";
export const POSITION_ALPHABET_MIDDLE = "U";
export const POSITION_ALPHABET_END = "z";

/**
 * Find a midpoint between two numbers represented with `/[0-9A-Za-z]+/` digits
 * */
export function getMidpointPosition(
  pointA: string,
  pointB: string | undefined | null,
) {
  if (!pointA) {
    throw new Error("point A can't be empty");
  }

  if (pointB && pointB.endsWith(POSITION_ALPHABET_START)) {
    throw new Error("point B can't end with zeroes");
  }

  let midpoint = "";
  for (
    let i = 0;
    i < Math.max(pointA.length, pointB?.length ?? -Infinity);
    i++
  ) {
    const digitA = pointA[i] ?? POSITION_ALPHABET_START;
    const digitB = pointB?.[i] ?? null;

    if (digitA === digitB) {
      midpoint += digitA;
      continue;
    }

    if (digitB === null) {
      if (digitA === POSITION_ALPHABET_END) {
        midpoint += digitA;
        continue;
      }
    }

    const indexA = POSITION_ALPHABET.indexOf(digitA);
    const indexB = digitB
      ? POSITION_ALPHABET.indexOf(digitB)
      : POSITION_ALPHABET.length;

    const indexM = Math.floor((indexA + indexB) / 2);
    if (indexM === indexA || indexM === indexB) {
      midpoint += digitA;
      continue;
    }

    midpoint += POSITION_ALPHABET[indexM];
    if (
      midpoint.length === Math.min(pointA.length, pointB?.length ?? Infinity)
    ) {
      break;
    }
  }

  if (
    midpoint === pointA ||
    midpoint === pointB ||
    // avoiding creating zeroes-only position
    // because it's impossible(?) to get a midpoint between two zeroes-only positions
    //
    // (for example, when `pointA === "K" && pointB === "K0"`)
    midpoint.endsWith(POSITION_ALPHABET_START)
  ) {
    midpoint += POSITION_ALPHABET_MIDDLE;
  }

  return midpoint;
}
