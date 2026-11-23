import type { NextConfig } from 'next'

function normalizeBasePath(raw: string | undefined): string {
  if (!raw) return ''
  const trimmed = raw.trim().replace(/^\/+|\/+$/g, '')
  return trimmed ? `/${trimmed}` : ''
}

const basePath = normalizeBasePath(process.env.DEJAVU_BASE_PATH)

const nextConfig: NextConfig = {
  output: 'export',
  trailingSlash: false,
  basePath,
  images: {
    unoptimized: true,
  },
}

export default nextConfig
