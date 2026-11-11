'use server'

import { AuthError } from 'next-auth'
import { signIn, signOut } from '@/auth'
import { runAction, type ActionState } from '@/lib/action-state'
import { registerPlayer } from '@/server/users'

export async function loginAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  try {
    await signIn('credentials', {
      username: String(fd.get('username') ?? ''),
      password: String(fd.get('password') ?? ''),
      redirectTo: '/',
    })
  } catch (e) {
    if (e instanceof AuthError) return { error: 'Invalid username or password, or the account is suspended.' }
    throw e // NEXT_REDIRECT on success
  }
  return {}
}

export async function signupAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const username = String(fd.get('username') ?? '')
  const password = String(fd.get('password') ?? '')
  const result = await runAction(() =>
    registerPlayer({ username, password, referralCode: String(fd.get('referralCode') ?? '') }),
  )
  if (result.error) return result
  try {
    await signIn('credentials', { username, password, redirectTo: '/' })
  } catch (e) {
    if (e instanceof AuthError) return { error: 'Account created, but automatic login failed. Please log in.' }
    throw e
  }
  return {}
}

export async function logoutAction() {
  await signOut({ redirectTo: '/login' })
}
