'use server'

import { revalidatePath } from 'next/cache'

import { type ActionState, runAction } from '@/lib/action-state'
import { parseSuspendUntil } from '@/lib/suspend-until'
import { adjustToast } from '@/lib/wallet'
import {
  adjustBalance,
  confirmPhone,
  resetPassword,
  setPhone,
  setStakeLimit,
  suspendPlayer,
  unsuspendPlayer,
} from '@/server/admin/players'
import { recordTicketCash } from '@/server/admin/ticket-cash'
import { closeInquiry, replyToInquiry } from '@/server/inquiries'
import { requireAdmin } from '@/server/session'
import { setBonuses } from '@/server/settings'
import { voidGame } from '@/server/settlement'
import { createManager, resetStaffPassword, setStaffDisabled } from '@/server/staff'
import { defaultFetcher, syncGames } from '@/server/sync/sync'

export async function adjustBalanceAction(
  userId: string,
  _prev: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const admin = await requireAdmin('points.adjust')
  const r = await runAction(
    () =>
      adjustBalance(admin.id, userId, {
        kind: fd.get('kind'),
        amount: fd.get('amount'),
        note: fd.get('note'),
      }),
    adjustToast,
  )
  revalidatePath('/admin', 'layout')
  return r
}

export async function suspendAction(userId: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requireAdmin('players.manage')
  const v = String(fd.get('until') ?? '').trim()
  const until = parseSuspendUntil(v)
  if (until === 'invalid') return { error: 'Invalid date' }
  const r = await runAction(() => suspendPlayer(admin.id, userId, until), 'Player suspended')
  revalidatePath('/admin', 'layout')
  return r
}

export async function unsuspendAction(userId: string): Promise<ActionState> {
  const admin = await requireAdmin('players.manage')
  const r = await runAction(() => unsuspendPlayer(admin.id, userId), 'Suspension lifted')
  revalidatePath('/admin', 'layout')
  return r
}

export async function stakeLimitAction(
  userId: string,
  _prev: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const admin = await requireAdmin('players.manage')
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
  const admin = await requireAdmin('players.manage')
  const r = await runAction(() => resetPassword(admin.id, userId, fd.get('newPassword')), 'Password reset')
  revalidatePath('/admin', 'layout')
  return r
}

export async function voidGameAction(gameId: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requireAdmin('games.manage')
  const r = await runAction(() => voidGame(admin.id, gameId, fd.get('reason')), 'Game voided')
  revalidatePath('/admin', 'layout')
  return r
}

export async function forceSyncAction(): Promise<ActionState> {
  await requireAdmin('games.manage')
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
  const admin = await requireAdmin('support.answer')
  const r = await runAction(() => replyToInquiry(admin.id, inquiryId, { body: fd.get('body') }), 'Reply sent')
  revalidatePath('/admin', 'layout')
  return r
}

/** Records the cash in / cash out a Cash in or Cash out ticket asks for, then closes the ticket. */
export async function ticketCashAction(
  inquiryId: string,
  _prev: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const admin = await requireAdmin('points.adjust')
  const r = await runAction(
    () =>
      recordTicketCash(admin.id, inquiryId, {
        kind: fd.get('kind'),
        amount: fd.get('amount'),
        note: fd.get('note'),
      }),
    adjustToast,
  )
  revalidatePath('/admin', 'layout')
  return r
}

export async function adminCloseAction(inquiryId: string): Promise<ActionState> {
  const admin = await requireAdmin('support.answer')
  const r = await runAction(() => closeInquiry(admin.id, inquiryId), 'Inquiry closed')
  revalidatePath('/admin', 'layout')
  return r
}

export async function bonusesAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requireAdmin('settings.manage')
  const r = await runAction(
    () =>
      setBonuses(admin.id, {
        welcomeBonusCap: fd.get('welcomeBonusCap'),
        referralPercent: fd.get('referralPercent'),
        referralBonusCap: fd.get('referralBonusCap'),
        dailyBonus: fd.get('dailyBonus'),
      }),
    'Bonuses saved',
  )
  revalidatePath('/admin', 'layout')
  return r
}

export async function setPhoneAction(userId: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requireAdmin('players.manage')
  const r = await runAction(() => setPhone(admin.id, userId, String(fd.get('phone') ?? '')), 'Number saved')
  revalidatePath('/admin', 'layout')
  return r
}

export async function confirmPhoneAction(userId: string): Promise<ActionState> {
  const admin = await requireAdmin('players.manage')
  const r = await runAction(() => confirmPhone(admin.id, userId), 'Phone confirmed')
  revalidatePath('/admin', 'layout')
  return r
}

export async function createManagerAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requireAdmin('staff.manage')
  const r = await runAction(
    () => createManager(admin.id, { username: fd.get('username'), password: fd.get('password') }),
    'Manager added',
  )
  revalidatePath('/admin', 'layout')
  return r
}

export async function disableStaffAction(userId: string): Promise<ActionState> {
  const admin = await requireAdmin('staff.manage')
  const r = await runAction(() => setStaffDisabled(admin.id, userId, true), 'Manager disabled')
  revalidatePath('/admin', 'layout')
  return r
}

export async function enableStaffAction(userId: string): Promise<ActionState> {
  const admin = await requireAdmin('staff.manage')
  const r = await runAction(() => setStaffDisabled(admin.id, userId, false), 'Manager enabled')
  revalidatePath('/admin', 'layout')
  return r
}

export async function resetStaffPasswordAction(
  userId: string,
  _prev: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const admin = await requireAdmin('staff.manage')
  const r = await runAction(
    () => resetStaffPassword(admin.id, userId, fd.get('newPassword')),
    'Password reset',
  )
  revalidatePath('/admin', 'layout')
  return r
}
