export const POSITION_ALPHABET =
  "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
export const POSITION_ALPHABET_START = "0";
export const POSITION_ALPHABET_MIDDLE = "U";
export const POSITION_ALPHABET_END = "z";

export function getMidpointPosition(pointA: string, pointB: string) {
  if (!pointA || !pointB) {
    throw new Error("both points can't be empty");
  }

  if (+pointA === 0 && +pointB === 0) {
    throw new Error("both points can't contain only zeroes");
  }

  let midpoint = "";
  for (let i = 0; i < Math.max(pointA.length, pointB.length); i++) {
    const digitA = pointA[i] ?? POSITION_ALPHABET_START;
    const digitB = pointB[i] ?? POSITION_ALPHABET_END;

    if (digitA === digitB) {
      midpoint += digitA;
      continue;
    }

    const indexA = POSITION_ALPHABET.indexOf(digitA);
    const indexB = POSITION_ALPHABET.indexOf(digitB);

    const indexM = Math.floor((indexA + indexB) / 2);
    if (indexM === indexA || indexM === indexB) {
      midpoint += digitA;
      continue;
    }

    midpoint += POSITION_ALPHABET[indexM];
    if (midpoint.length === Math.min(pointA.length, pointB.length)) {
      break;
    }
  }

  if (
    midpoint === pointA ||
    midpoint === pointB ||
    // avoiding creating zeroes-only position
    // because it's impossible(?) to get a midpoint between two zeroes-only positions
    +midpoint === 0
  ) {
    midpoint += POSITION_ALPHABET_MIDDLE;
  }

  return midpoint;
}
