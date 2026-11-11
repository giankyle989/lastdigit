import Link from 'next/link'

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      <Link href="/" className="text-3xl font-black tracking-tight">
        Last<span className="text-primary">Digit</span>
      </Link>
      <p className="text-muted-foreground mt-2 mb-6 text-center text-sm">
        Pick the last digit of each team&apos;s final score
      </p>
      <div className="w-full max-w-sm">{children}</div>
    </main>
  )
}
