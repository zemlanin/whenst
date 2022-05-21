import {
  Temporal,
  Intl,
  toTemporalInstant,
} from "https://unpkg.com/@js-temporal/polyfill?module";

import "https://unpkg.com/urlpattern-polyfill?module";

const timeURLPattern = new URLPattern({ pathname: "/:continent/:city/:time" });

if (timeURLPattern.test(location.href)) {
  console.log("remote");
} else {
  console.log("local");
}
