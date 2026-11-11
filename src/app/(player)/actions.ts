'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { type ActionState, runAction } from '@/lib/action-state'
import { placeBets } from '@/server/bets'
import { closeInquiry, createInquiry, replyToInquiry } from '@/server/inquiries'
import { getSlipStatus } from '@/server/queries/player'
import { requireUser } from '@/server/session'

/** Places every pick in the slip or none (spec §4.3); `pickIndex` marks the failing pick. */
export async function placeBetsAction(picks: unknown): Promise<ActionState> {
  const user = await requireUser()
  const result = await runAction(
    () => placeBets(user.id, picks),
    (bets) => `${bets.length} ${bets.length === 1 ? 'bet' : 'bets'} placed`,
  )
  revalidatePath('/', 'layout')
  return result
}

/** Fresh open/pool/ending-stake data for the slip's picks, plus the balance. */
export async function getSlipStatusAction(picks: unknown) {
  const user = await requireUser()
  return getSlipStatus(user.id, picks)
}

export async function createInquiryAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser()
  let id: string | undefined
  const result = await runAction(async () => {
    id = (await createInquiry(user.id, { subject: fd.get('subject'), body: fd.get('body') })).id
  })
  if (id) redirect(`/inquiries/${id}`)
  return result
}

export async function replyInquiryAction(
  inquiryId: string,
  _prev: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const user = await requireUser()
  const result = await runAction(
    () => replyToInquiry(user.id, inquiryId, { body: fd.get('body') }),
    'Reply sent',
  )
  revalidatePath(`/inquiries/${inquiryId}`)
  return result
}

export async function closeInquiryAction(inquiryId: string): Promise<ActionState> {
  const user = await requireUser()
  const result = await runAction(() => closeInquiry(user.id, inquiryId), 'Inquiry closed')
  revalidatePath(`/inquiries/${inquiryId}`)
  return result
}
