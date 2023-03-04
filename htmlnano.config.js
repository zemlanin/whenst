/* globals module */

module.exports = {
  custom: function (tree) {
    tree.match([{ tag: "a", attrs: { href: /^\/[^/].+\.html$/ } }], (node) => {
      node.attrs.href = node.attrs.href.replace(/\.html$/, "");
      return node;
    });

    return tree;
  },
};
