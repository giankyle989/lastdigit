'use server'

import { revalidatePath } from 'next/cache'

import { type ActionState, runAction } from '@/lib/action-state'
import { parseSuspendUntil } from '@/lib/suspend-until'
import {
  adjustPoints,
  resetPassword,
  setStakeLimit,
  suspendPlayer,
  unsuspendPlayer,
} from '@/server/admin/players'
import { closeInquiry, replyToInquiry } from '@/server/inquiries'
import { requireAdmin } from '@/server/session'
import { setBonuses } from '@/server/settings'
import { voidGame } from '@/server/settlement'
import { defaultFetcher, syncGames } from '@/server/sync/sync'

export async function adjustPointsAction(
  userId: string,
  _prev: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const admin = await requireAdmin()
  const r = await runAction(
    () =>
      adjustPoints(admin.id, userId, {
        direction: fd.get('direction'),
        amount: fd.get('amount'),
        note: fd.get('note'),
      }),
    ({ welcomeBonus }) =>
      welcomeBonus > 0
        ? `Points updated (+${welcomeBonus.toLocaleString('en-US')} welcome bonus)`
        : 'Points updated',
  )
  revalidatePath('/admin', 'layout')
  return r
}

export async function suspendAction(userId: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requireAdmin()
  const v = String(fd.get('until') ?? '').trim()
  const until = parseSuspendUntil(v)
  if (until === 'invalid') return { error: 'Invalid date' }
  const r = await runAction(() => suspendPlayer(admin.id, userId, until), 'Player suspended')
  revalidatePath('/admin', 'layout')
  return r
}

export async function unsuspendAction(userId: string): Promise<ActionState> {
  const admin = await requireAdmin()
  const r = await runAction(() => unsuspendPlayer(admin.id, userId), 'Suspension lifted')
  revalidatePath('/admin', 'layout')
  return r
}

export async function stakeLimitAction(
  userId: string,
  _prev: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const admin = await requireAdmin()
  const v = String(fd.get('limit') ?? '').trim()
  const r = await runAction(() => setStakeLimit(admin.id, userId, v === '' ? null : v), 'Stake limit saved')
  revalidatePath('/admin', 'layout')
  return r
}

export async function resetPasswordAction(
  userId: string,
  _prev: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const admin = await requireAdmin()
  const r = await runAction(() => resetPassword(admin.id, userId, fd.get('newPassword')), 'Password reset')
  revalidatePath('/admin', 'layout')
  return r
}

export async function voidGameAction(gameId: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requireAdmin()
  const r = await runAction(() => voidGame(admin.id, gameId, fd.get('reason')), 'Game voided')
  revalidatePath('/admin', 'layout')
  return r
}

export async function forceSyncAction(): Promise<ActionState> {
  await requireAdmin()
  try {
    const r = await syncGames({ fetchGames: defaultFetcher() })
    revalidatePath('/admin', 'layout')
    return {
      ok: `Sync complete: ${r.created} new, ${r.updated} updated, ${r.skipped} skipped, ${r.settled} settled, ${r.errors} errors`,
    }
  } catch (e) {
    return { error: `Sync failed: ${e instanceof Error ? e.message : String(e)}` }
  }
}

export async function adminReplyAction(
  inquiryId: string,
  _prev: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const admin = await requireAdmin()
  const r = await runAction(() => replyToInquiry(admin.id, inquiryId, { body: fd.get('body') }), 'Reply sent')
  revalidatePath('/admin', 'layout')
  return r
}

export async function adminCloseAction(inquiryId: string): Promise<ActionState> {
  const admin = await requireAdmin()
  const r = await runAction(() => closeInquiry(admin.id, inquiryId), 'Inquiry closed')
  revalidatePath('/admin', 'layout')
  return r
}

export async function bonusesAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requireAdmin()
  const r = await runAction(
    () =>
      setBonuses(admin.id, {
        welcomeBonusCap: fd.get('welcomeBonusCap'),
        referralBonus: fd.get('referralBonus'),
        dailyBonus: fd.get('dailyBonus'),
      }),
    'Bonuses saved',
  )
  revalidatePath('/admin', 'layout')
  return r
}
