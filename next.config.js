/**
 * Importing the env module here validates the environment at build time.
 * @see https://env.t3.gg/docs/nextjs
 */
import "./src/env.js";

/** @type {import("next").NextConfig} */
const config = {
  images: {
    remotePatterns: [
      // Chain logos, served from Artemis' asset directory.
      { protocol: "https", hostname: "res.cloudinary.com" },
      // DefiLlama protocol and chain icons.
      { protocol: "https", hostname: "icons.llamao.fi" },
    ],
  },
  // Several lockfiles exist above this directory; pin the root so Turbopack
  // does not infer the wrong one.
  turbopack: {
    root: import.meta.dirname,
  },
};

export default config;
