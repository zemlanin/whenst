declare module "#dist/server/static.js" {
  const value: {
    assets: Record<string, string>;
    entrypoints: Record<
      string,
      {
        main: string;
        css?: string;
      }
    >;
  };
  export default value;
}
