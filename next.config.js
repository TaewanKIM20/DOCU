/** @type {import('next').NextConfig} */

const nextConfig = {
  experimental: {
    // Next.js가 아래 패키지들의 코드를 건드리지 않고 순수 Node.js 환경에서 실행하게 합니다.
    serverComponentsExternalPackages: [
      'sharp', 
      'tesseract.js', 
      'puppeteer', 
      'pdf-parse', 
      'mammoth',
      'canvas',
      'pdfjs-dist' // 최신 PDF.js 보호 추가
    ],
  },

  webpack: (config, { isServer }) => {
    if (isServer) {
      const existing = Array.isArray(config.externals) ? config.externals : []
      // 외부 모듈로 취급하도록 명시적 추가
      config.externals = [...existing, 'tesseract.js', 'canvas', 'pdfjs-dist'] 
    } else {
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