import { describe, expect, it } from 'vitest'
import { buildRRule, describeRecurrence, parseToConfig } from '@/lib/recurrence/presets'

describe('buildRRule', () => {
  it('builds all simple presets', () => {
    expect(buildRRule({ kind: 'once' })).toBeNull()
    expect(buildRRule({ kind: 'daily' })).toBe('FREQ=DAILY')
    expect(buildRRule({ kind: 'weekdays' })).toBe('FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR')
    expect(buildRRule({ kind: 'monthly' })).toBe('FREQ=MONTHLY')
    expect(buildRRule({ kind: 'yearly' })).toBe('FREQ=YEARLY')
    expect(buildRRule({ kind: 'every_x_days', interval: 4 })).toBe(
      'FREQ=DAILY;INTERVAL=4'
    )
  })

  it('builds weekly with selected days (Sun=0 mapping)', () => {
    const rule = buildRRule({ kind: 'weekly', byWeekday: [1, 3, 5] })!
    expect(rule).toContain('FREQ=WEEKLY')
    expect(rule).toContain('MO')
    expect(rule).toContain('WE')
    expect(rule).toContain('FR')
  })

  it('builds every-x-weeks with interval and days', () => {
    const rule = buildRRule({ kind: 'every_x_weeks', interval: 2, byWeekday: [0] })!
    expect(rule).toContain('INTERVAL=2')
    expect(rule).toContain('SU')
  })

  it('passes custom rules through (validating them)', () => {
    expect(buildRRule({ kind: 'custom', customRule: 'FREQ=MONTHLY;BYMONTHDAY=15' })).toBe(
      'FREQ=MONTHLY;BYMONTHDAY=15'
    )
    expect(() => buildRRule({ kind: 'custom', customRule: 'NONSENSE=1' })).toThrow()
  })
})

describe('parseToConfig (round trips)', () => {
  it('round-trips each preset', () => {
    expect(parseToConfig(null).kind).toBe('once')
    expect(parseToConfig('FREQ=DAILY').kind).toBe('daily')
    expect(parseToConfig('FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR').kind).toBe('weekdays')
    expect(parseToConfig('FREQ=MONTHLY').kind).toBe('monthly')
    expect(parseToConfig('FREQ=YEARLY').kind).toBe('yearly')
    expect(parseToConfig('FREQ=DAILY;INTERVAL=3')).toEqual({
      kind: 'every_x_days',
      interval: 3,
    })
  })

  it('maps rrule weekday numbering back to Sun=0', () => {
    const config = parseToConfig('FREQ=WEEKLY;BYDAY=MO,FR')
    expect(config.kind).toBe('weekly')
    expect(config.byWeekday).toEqual([1, 5])
  })

  it('classifies exotic rules as custom', () => {
    expect(parseToConfig('FREQ=MONTHLY;BYMONTHDAY=15').kind).toBe('custom')
  })
})

describe('describeRecurrence', () => {
  it('humanizes presets', () => {
    expect(describeRecurrence(null)).toBe('Once')
    expect(describeRecurrence('FREQ=DAILY')).toBe('Daily')
    expect(describeRecurrence('FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR')).toBe('Every weekday')
    expect(describeRecurrence('FREQ=DAILY;INTERVAL=3')).toBe('Every 3 days')
    expect(describeRecurrence('FREQ=WEEKLY;BYDAY=MO,WE')).toBe('Weekly on Mon, Wed')
  })
})
