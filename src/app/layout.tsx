import './globals.css'

import type { Metadata, Viewport } from 'next'
import { Inter, JetBrains_Mono } from 'next/font/google'

import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' })
const mono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-jetbrains-mono' })

export const metadata: Metadata = {
  title: 'LastDigit',
  description: 'Bet points on the last digit of NBA final scores',
}

export const viewport: Viewport = { themeColor: '#0b0f14', colorScheme: 'dark' }

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`dark ${inter.variable} ${mono.variable}`}>
      <body className="min-h-dvh">
        <TooltipProvider>{children}</TooltipProvider>
        <Toaster />
      </body>
    </html>
  )
}
