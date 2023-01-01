/* globals module */
module.exports = {
  plugins: {
    "posthtml-inline-svg": {
      cwd: ".",
    },
    "posthtml-shorten": {
      shortener: {
        process: async function (url) {
          return url.startsWith("http://") || url.startsWith("https://")
            ? url
            : url.replace(".html", "");
        },
      },
      tag: ["a"],
      attribute: ["href"],
    },
  },
};
