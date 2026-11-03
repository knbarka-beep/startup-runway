import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
export default {
  output: "export",          // plain static HTML/JS in out/, no server needed
  trailingSlash: true,       // /method/ works on any static file server
  images: { unoptimized: true },
  // The repo root, so the app can import ../data/export/dashboard.json directly.
  turbopack: { root: path.join(here, "..") },
  outputFileTracingRoot: path.join(here, ".."),
};
