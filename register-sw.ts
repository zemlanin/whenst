if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register(
    new URL("service-worker/index.ts", import.meta.url),
    { type: "module" },
  );
}
