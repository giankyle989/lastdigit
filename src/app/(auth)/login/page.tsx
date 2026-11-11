import Link from 'next/link'

import { ActionForm } from '@/components/action-form'

import { loginAction } from '../actions'

export default function LoginPage() {
  return (
    <main className="mx-auto mt-16 max-w-sm px-4">
      <h1 className="mb-6 text-2xl font-bold text-orange-600">LastDigit</h1>
      <div className="card">
        <h2 className="mb-4 text-lg font-semibold">Log in</h2>
        <ActionForm action={loginAction} submitLabel="Log in">
          <div>
            <label htmlFor="username" className="label">
              Username
            </label>
            <input id="username" name="username" className="input" autoComplete="username" required />
          </div>
          <div>
            <label htmlFor="password" className="label">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              className="input"
              autoComplete="current-password"
              required
            />
          </div>
        </ActionForm>
      </div>
      <p className="mt-4 text-sm">
        No account?{' '}
        <Link href="/signup" className="text-orange-600 underline">
          Sign up
        </Link>
      </p>
    </main>
  )
}
