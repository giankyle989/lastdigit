import { describe, expect, it } from 'vitest'

import { nextMessage, topicSubject, topicTemplate } from '@/lib/support'

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
