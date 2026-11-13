import Link from 'next/link'
import { redirect } from 'next/navigation'

import { ActionForm } from '@/components/action-form'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { firstParam } from '@/lib/pagination'
import { getCurrentUser } from '@/server/session'
import { getBonus } from '@/server/settings'

import { signupAction } from '../actions'

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ ref?: string | string[] }>
}) {
  if (await getCurrentUser()) redirect('/')
  const ref = firstParam((await searchParams).ref)?.slice(0, 32) ?? ''
  const welcomeCap = await getBonus('welcomeBonusCap')
  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Sign up</CardTitle>
          {welcomeCap > 0 && (
            <p className="text-muted-foreground text-sm">
              Your first top-up is doubled, up to {welcomeCap.toLocaleString('en-US')} bonus points.
            </p>
          )}
        </CardHeader>
        <CardContent>
          <ActionForm action={signupAction} submitLabel="Sign up" className="grid gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="username">Username</Label>
              <Input id="username" name="username" autoComplete="username" required />
              <p className="text-muted-foreground text-xs">3–20 letters, numbers or underscores</p>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="referralCode">Referral code (optional)</Label>
              <Input id="referralCode" name="referralCode" defaultValue={ref} />
            </div>
          </ActionForm>
        </CardContent>
      </Card>
      <p className="text-muted-foreground mt-4 text-center text-sm">
        Already have an account?{' '}
        <Link href="/login" className="text-primary underline-offset-4 hover:underline">
          Log in
        </Link>
      </p>
    </>
  )
}
