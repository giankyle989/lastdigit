import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // E2E builds into its own folder (playwright.config.ts) so a test run never replaces the build
  // the running app serves from.
  distDir: process.env.NEXT_DIST_DIR || '.next',
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
