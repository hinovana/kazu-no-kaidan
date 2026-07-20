import { defineConfig } from "vite";

export default defineConfig({
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
  },
  build: {
    rollupOptions: {
      input: [
        "index.html",
        "generators/kazu-no-kaidan/index.html",
        "generators/kazu-sagashi/index.html",
        "generators/kazu-sagashi/difficulty-lab.html",
        "generators/kokugo-no-tane/index.html",
      ],
    },
  },
});
