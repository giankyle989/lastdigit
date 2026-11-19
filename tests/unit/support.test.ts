import { describe, expect, it } from 'vitest'

import {
  cashReply,
  nextMessage,
  parseTicketAmount,
  subjectTopic,
  ticketAmount,
  topicSubject,
  topicTemplate,
} from '@/lib/support'

const phone = '+639170000201'

describe('support topics', () => {
  it('names the subject for cash in and cash out; Other has none', () => {
    expect(topicSubject('CASH_IN')).toBe('Cash in')
    expect(topicSubject('CASH_OUT')).toBe('Cash out')
    expect(topicSubject('OTHER')).toBeNull()
  })

  it('fills the templates with the player phone number', () => {
    expect(topicTemplate('CASH_IN', phone)).toBe(
      "I'd like to cash in.\nAmount: \nPaid from: 0917 000 0201\nReference no.: ",
    )
    expect(topicTemplate('CASH_OUT', phone)).toBe(
      "I'd like to cash out from my wallet.\nAmount: \nSend to: 0917 000 0201",
    )
    expect(topicTemplate('OTHER', phone)).toBe('')
  })

  it('leaves the number blank when the player has none', () => {
    expect(topicTemplate('CASH_IN', null)).toContain('Paid from: \n')
    expect(topicTemplate('CASH_OUT', null)).toMatch(/Send to: $/)
  })
})

describe('nextMessage', () => {
  it('fills an empty message with the new template', () => {
    expect(nextMessage('', 'OTHER', 'CASH_IN', phone)).toBe(topicTemplate('CASH_IN', phone))
    expect(nextMessage('  \n', 'OTHER', 'CASH_OUT', phone)).toBe(topicTemplate('CASH_OUT', phone))
  })

  it('swaps an untouched template for the new one', () => {
    const cashIn = topicTemplate('CASH_IN', phone)
    expect(nextMessage(cashIn, 'CASH_IN', 'CASH_OUT', phone)).toBe(topicTemplate('CASH_OUT', phone))
    expect(nextMessage(cashIn, 'CASH_IN', 'OTHER', phone)).toBe('')
  })

  it('keeps anything the player typed', () => {
    const edited = topicTemplate('CASH_IN', phone).replace('Amount: ', 'Amount: 500')
    expect(nextMessage(edited, 'CASH_IN', 'CASH_OUT', phone)).toBe(edited)
    expect(nextMessage('My bet is missing', 'OTHER', 'CASH_IN', phone)).toBe('My bet is missing')
  })
})

describe('cash tickets', () => {
  it('maps a saved subject back to its topic', () => {
    expect(subjectTopic('Cash in')).toBe('CASH_IN')
    expect(subjectTopic('Cash out')).toBe('CASH_OUT')
    expect(subjectTopic('cash in')).toBe('OTHER')
    expect(subjectTopic('Missing points')).toBe('OTHER')
  })

  it('reads the amount line of a cash message', () => {
    expect(parseTicketAmount(topicTemplate('CASH_IN', phone).replace('Amount: ', 'Amount: 1,500'))).toBe(1500)
    expect(parseTicketAmount('Hello\namount:  250 pts\nthanks')).toBe(250)
    expect(parseTicketAmount(topicTemplate('CASH_IN', phone))).toBeNull()
    expect(parseTicketAmount('Amount: 0')).toBeNull()
    expect(parseTicketAmount('Amount: five hundred')).toBeNull()
    expect(parseTicketAmount('no amount here')).toBeNull()
  })

  it("takes the ticket amount from the player's newest message that states one", () => {
    const player = 'u1'
    const staff = 'a1'
    const msg = (authorId: string, body: string) => ({ authorId, body })
    // the player changes the amount in a later reply
    expect(
      ticketAmount(
        [msg(player, 'Amount: 500'), msg(staff, 'Please confirm'), msg(player, 'Amount: 300')],
        player,
      ),
    ).toBe(300)
    // a later reply without an amount keeps the earlier one
    expect(ticketAmount([msg(player, 'Amount: 500'), msg(player, 'sent it, thanks')], player)).toBe(500)
    // staff messages never count
    expect(ticketAmount([msg(player, 'Amount: 500'), msg(staff, 'Amount: 900')], player)).toBe(500)
    expect(ticketAmount([msg(player, 'hello')], player)).toBeNull()
    expect(ticketAmount([], player)).toBeNull()
  })

  it('writes the staff reply', () => {
    expect(cashReply('CASH_IN', 1500)).toBe('Cash in of 1,500 recorded.')
    expect(cashReply('CASH_OUT', 200)).toBe('Cash out of 200 recorded.')
  })
})
