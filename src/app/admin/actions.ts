'use server'

import { revalidatePath } from 'next/cache'
import { runAction, type ActionState } from '@/lib/action-state'
import { adjustPoints, resetPassword, setStakeLimit, suspendPlayer, unsuspendPlayer } from '@/server/admin/players'
import { closeInquiry, replyToInquiry } from '@/server/inquiries'
import { requireAdmin } from '@/server/session'
import { setReferralBonus } from '@/server/settings'
import { voidGame } from '@/server/settlement'
import { defaultFetcher, syncGames } from '@/server/sync/sync'

export async function adjustPointsAction(userId: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requireAdmin()
  const r = await runAction(
    () => adjustPoints(admin.id, userId, { direction: fd.get('direction'), amount: fd.get('amount'), note: fd.get('note') }),
    'Points updated',
  )
  revalidatePath(`/admin/players/${userId}`)
  return r
}

export async function suspendAction(userId: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requireAdmin()
  const v = String(fd.get('until') ?? '').trim()
  const until = v ? new Date(`${v}T00:00:00Z`) : null
  if (until && Number.isNaN(until.getTime())) return { error: 'Invalid date' }
  const r = await runAction(() => suspendPlayer(admin.id, userId, until), 'Player suspended')
  revalidatePath(`/admin/players/${userId}`)
  return r
}

export async function unsuspendAction(userId: string): Promise<ActionState> {
  const admin = await requireAdmin()
  const r = await runAction(() => unsuspendPlayer(admin.id, userId), 'Suspension lifted')
  revalidatePath(`/admin/players/${userId}`)
  return r
}

export async function stakeLimitAction(userId: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requireAdmin()
  const v = String(fd.get('limit') ?? '').trim()
  const r = await runAction(() => setStakeLimit(admin.id, userId, v === '' ? null : v), 'Stake limit saved')
  revalidatePath(`/admin/players/${userId}`)
  return r
}

export async function resetPasswordAction(userId: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requireAdmin()
  return runAction(() => resetPassword(admin.id, userId, fd.get('newPassword')), 'Password reset')
}

export async function voidGameAction(gameId: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requireAdmin()
  const r = await runAction(() => voidGame(admin.id, gameId, fd.get('reason')), 'Game voided')
  revalidatePath('/admin/games')
  return r
}

export async function forceSyncAction(): Promise<ActionState> {
  await requireAdmin()
  try {
    const r = await syncGames({ fetchGames: defaultFetcher() })
    revalidatePath('/admin/games')
    return {
      ok: `Sync complete: ${r.created} new, ${r.updated} updated, ${r.skipped} skipped, ${r.settled} settled, ${r.errors} errors`,
    }
  } catch (e) {
    return { error: `Sync failed: ${e instanceof Error ? e.message : String(e)}` }
  }
}

export async function adminReplyAction(inquiryId: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requireAdmin()
  const r = await runAction(() => replyToInquiry(admin.id, inquiryId, { body: fd.get('body') }), 'Reply sent')
  revalidatePath(`/admin/inquiries/${inquiryId}`)
  return r
}

export async function adminCloseAction(inquiryId: string): Promise<ActionState> {
  const admin = await requireAdmin()
  const r = await runAction(() => closeInquiry(admin.id, inquiryId), 'Inquiry closed')
  revalidatePath(`/admin/inquiries/${inquiryId}`)
  return r
}

export async function referralBonusAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requireAdmin()
  const r = await runAction(() => setReferralBonus(admin.id, fd.get('referralBonus')), 'Referral bonus saved')
  revalidatePath('/admin/settings')
  return r
}
