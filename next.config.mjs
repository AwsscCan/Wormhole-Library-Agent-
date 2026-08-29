import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  outputFileTracingRoot: projectRoot,
  // The bottom-left "N" belongs to the development server, not the product.
  // Disable it so local demos match the shipped application surface.
  devIndicators: false,
};

export default nextConfig;
