import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'LastDigit',
  description: 'Bet points on the last digit of NBA final scores',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
