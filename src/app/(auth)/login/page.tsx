import Link from 'next/link'
import { redirect } from 'next/navigation'

import { ActionForm } from '@/components/action-form'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { getCurrentUser } from '@/server/session'

import { loginAction } from '../actions'

export default async function LoginPage() {
  if (await getCurrentUser()) redirect('/')
  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Log in</CardTitle>
        </CardHeader>
        <CardContent>
          <ActionForm action={loginAction} submitLabel="Log in" className="grid gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="username">Username</Label>
              <Input id="username" name="username" autoComplete="username" required />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="password">Password</Label>
              <Input id="password" name="password" type="password" autoComplete="current-password" required />
            </div>
          </ActionForm>
        </CardContent>
      </Card>
      <p className="text-muted-foreground mt-4 text-center text-sm">
        No account?{' '}
        <Link href="/signup" className="text-primary underline-offset-4 hover:underline">
          Sign up
        </Link>
      </p>
    </>
  )
}
