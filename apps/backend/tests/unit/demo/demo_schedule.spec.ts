import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import {
  findOfferedSlotById,
  formatSlotLabel,
  isValidCivilDate,
  listOfferedSlotsForDate,
  type DemoScheduleConfig,
} from '#lib/demo_schedule'

const config: DemoScheduleConfig = {
  timeZone: 'Asia/Kolkata',
  durationMinutes: 30,
  slotTimes: [
    { hour: 10, minute: 0 },
    { hour: 11, minute: 0 },
    { hour: 14, minute: 0 },
    { hour: 15, minute: 30 },
    { hour: 17, minute: 0 },
  ],
  weekdays: [1, 2, 3, 4, 5],
  horizonDays: 60,
}

function nextWeekday(from = DateTime.fromISO('2026-09-07T06:00:00.000Z')) {
  let day = from.setZone(config.timeZone).startOf('day').plus({ days: 1 })
  while (!config.weekdays.includes(day.weekday)) {
    day = day.plus({ days: 1 })
  }
  return day
}

test.group('Demo schedule', () => {
  test('weekday returns offered slots in the demo timezone', ({ assert }) => {
    const now = DateTime.fromISO('2026-09-07T06:00:00.000Z')
    const date = nextWeekday(now).toISODate()!
    const slots = listOfferedSlotsForDate(date, config, now)

    assert.isAtLeast(slots.length, 1)
    assert.equal(slots[0].label, formatSlotLabel(slots[0].start))
    assert.equal(slots[0].start.zoneName, 'Asia/Kolkata')
    assert.equal(slots[0].end.diff(slots[0].start, 'minutes').minutes, 30)
    assert.include(slots[0].id, 'T')
    assert.isTrue(slots[0].id.endsWith('Z'))
  })

  test('weekend date returns no offered slots', ({ assert }) => {
    const now = DateTime.fromISO('2026-09-07T06:00:00.000Z')
    const saturday = DateTime.fromISO('2026-09-12', { zone: 'Asia/Kolkata' }).toISODate()!
    assert.deepEqual(listOfferedSlotsForDate(saturday, config, now), [])
  })

  test('past civil date returns no offered slots', ({ assert }) => {
    const now = DateTime.fromISO('2026-09-07T06:00:00.000Z')
    assert.deepEqual(listOfferedSlotsForDate('2026-09-01', config, now), [])
  })

  test('today omits slots that have already started', ({ assert }) => {
    const now = DateTime.fromISO('2026-09-07T06:00:00.000Z') // 11:30 IST Monday
    const slots = listOfferedSlotsForDate('2026-09-07', config, now)
    assert.isTrue(slots.every((slot) => slot.start.toUTC() > now))
    assert.isFalse(slots.some((slot) => slot.label === '10:00 AM'))
    assert.isFalse(slots.some((slot) => slot.label === '11:00 AM'))
  })

  test('invalid civil date is rejected', ({ assert }) => {
    assert.isFalse(isValidCivilDate('09-15-2026'))
    assert.isFalse(isValidCivilDate('2026-13-40'))
    assert.isTrue(isValidCivilDate('2026-09-15'))
  })

  test('findOfferedSlotById accepts normalized UTC instants', ({ assert }) => {
    const now = DateTime.fromISO('2026-09-07T06:00:00.000Z')
    const date = nextWeekday(now).toISODate()!
    const slots = listOfferedSlotsForDate(date, config, now)
    const found = findOfferedSlotById(slots[0].id.replace('.000Z', 'Z'), config, now)
    assert.exists(found)
    assert.equal(found?.id, slots[0].id)
  })
})
