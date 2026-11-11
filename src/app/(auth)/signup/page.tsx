import Link from 'next/link'
import { ActionForm } from '@/components/action-form'
import { signupAction } from '../actions'

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ ref?: string }> }) {
  const { ref } = await searchParams
  return (
    <main className="mx-auto mt-16 max-w-sm px-4">
      <h1 className="mb-6 text-2xl font-bold text-orange-600">LastDigit</h1>
      <div className="card">
        <h2 className="mb-4 text-lg font-semibold">Sign up</h2>
        <ActionForm action={signupAction} submitLabel="Sign up">
          <div>
            <label htmlFor="username" className="label">Username</label>
            <input id="username" name="username" className="input" autoComplete="username" required />
            <p className="mt-1 text-xs text-gray-500">3–20 letters, numbers or underscores</p>
          </div>
          <div>
            <label htmlFor="password" className="label">Password</label>
            <input id="password" name="password" type="password" className="input" autoComplete="new-password" required minLength={8} />
          </div>
          <div>
            <label htmlFor="referralCode" className="label">Referral code (optional)</label>
            <input id="referralCode" name="referralCode" className="input" defaultValue={ref ?? ''} />
          </div>
        </ActionForm>
      </div>
      <p className="mt-4 text-sm">
        Already have an account? <Link href="/login" className="text-orange-600 underline">Log in</Link>
      </p>
    </main>
  )
}
