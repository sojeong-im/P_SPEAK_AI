/** @type {import('next').NextConfig} */
const nextConfig = {
  // Azure Speech SDK는 브라우저 전용 — SSR에서 번들 제외
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals = [
        ...(config.externals || []),
        'microsoft-cognitiveservices-speech-sdk',
      ]
    }
    return config
  },
}

export default nextConfig
