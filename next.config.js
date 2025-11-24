/** @type {import('next').NextConfig} */
const nextConfig = {
  // Removed 'output: export' to enable API routes for webhook proxy
  // If you need static export, you can use: output: process.env.NODE_ENV === 'production' ? 'export' : undefined
  output: 'export',
  images: {
    unoptimized: true,
  },
}

module.exports = nextConfig;
