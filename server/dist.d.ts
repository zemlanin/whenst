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

declare module "#dist/server/index.js" {
  export const server: import("fastify").FastifyInstance;
}
