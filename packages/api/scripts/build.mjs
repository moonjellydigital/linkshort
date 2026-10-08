// Bundles each entrypoint into a single self-contained ESM file so the runtime
// image needs no node_modules (and no workspace resolution). `pg-native` is an
// optional peer of `pg` that is only loaded on demand; keep it external.
import { build } from "esbuild";

await build({
  entryPoints: { server: "src/server.ts", migrate: "src/migrate.ts" },
  outdir: "dist",
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  outExtension: { ".js": ".mjs" },
  sourcemap: "linked",
  external: ["pg-native"],
  legalComments: "linked",
  // CJS dependencies bundled into ESM still call require(); provide one.
  banner: {
    js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);",
  },
  logLevel: "info",
});
