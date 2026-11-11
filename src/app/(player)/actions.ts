'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { runAction, type ActionState } from '@/lib/action-state'
import { placeBet } from '@/server/bets'
import { closeInquiry, createInquiry, replyToInquiry } from '@/server/inquiries'
import { requireUser } from '@/server/session'

export async function placeBetAction(gameId: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser()
  const result = await runAction(
    () =>
      placeBet(user.id, {
        gameId,
        awayDigit: fd.get('awayDigit'),
        homeDigit: fd.get('homeDigit'),
        stake: fd.get('stake'),
      }),
    'Bet placed',
  )
  revalidatePath(`/games/${gameId}`)
  return result
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
