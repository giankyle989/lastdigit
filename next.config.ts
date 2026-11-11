import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  async redirects() {
    return [
      { source: '/referral', destination: '/more/referral', permanent: true },
      { source: '/inquiries', destination: '/more/support', permanent: true },
      { source: '/inquiries/:id', destination: '/more/support/:id', permanent: true },
    ]
  },
}

export default nextConfig
