/** @type {import('next').NextConfig} */
const nextConfig = {
  // Do not force static export here — API routes require a server runtime.
  // If you intentionally want a static export for a specific build, set
  // `output: 'export'` only for that workflow or use an environment flag.
  images: {
    unoptimized: true,
  },
}

module.exports = nextConfig;
