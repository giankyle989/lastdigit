import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  async redirects() {
    return [
      { source: '/referral', destination: '/more/referral', permanent: true },
      { source: '/inquiries', destination: '/more/support', permanent: true },
      { source: '/inquiries/:id', destination: '/more/support/:id', permanent: true },
      { source: '/admin/transactions', destination: '/admin/ledger', permanent: true },
      { source: '/admin/inquiries', destination: '/admin/support', permanent: true },
      { source: '/admin/inquiries/:id', destination: '/admin/support?ticket=:id', permanent: true },
      { source: '/admin/players/:id', destination: '/admin/players?player=:id', permanent: true },
    ]
  },
}

export default nextConfig
