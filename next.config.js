/** @type {import('next').NextConfig} */
const nextConfig = {
  // puppeteer 등 서버사이드 전용 패키지를 클라이언트 번들에서 제외
  experimental: {
    serverComponentsExternalPackages: ['puppeteer', 'pdf-parse', 'mammoth', 'sharp'],
  },

  webpack: (config, { isServer }) => {
    if (!isServer) {
      // 클라이언트 번들에서 node-only 모듈 제거
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
        os: false,
        crypto: false,
        stream: false,
        buffer: false,
      }
    }
    return config
  },
}

module.exports = nextConfig
