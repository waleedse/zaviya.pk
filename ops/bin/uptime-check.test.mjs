import assert from 'node:assert/strict'
import { test } from 'node:test'
import { decide, minutesBetween } from './uptime-check.mjs'

const incident = (...bodies) => ({ id: 'i1', createdAt: '2026-10-19T10:00:00.000Z', comments: bodies.map((body, n) => ({ body, createdAt: `2026-10-19T10:0${n}:00.000Z` })) })

test('a first outage opens an incident, and no incident means nothing when the site is fine', () => {
  assert.deepEqual(decide({ down: true, incident: null }), { action: 'create' })
  assert.deepEqual(decide({ down: false, incident: null }), { action: 'none' })
})

test('a second run during the same outage comments instead of opening a duplicate', () => {
  assert.deepEqual(decide({ down: true, incident: incident() }), { action: 'none' })
  assert.deepEqual(decide({ down: true, incident: incident('[uptime:down] 2026-10-19T10:00:00.000Z') }), { action: 'none' })
})

test('recovery comments once, with the time the outage began', () => {
  const open = incident('[uptime:down] 2026-10-19T10:00:00.000Z')
  assert.deepEqual(decide({ down: false, incident: open }), { action: 'comment-up', since: '2026-10-19T10:00:00.000Z' })
  const recovered = incident('[uptime:down] 2026-10-19T10:00:00.000Z', '[uptime:up] 2026-10-19T10:40:00.000Z')
  assert.deepEqual(decide({ down: false, incident: recovered }), { action: 'none' })
})

test('a new outage on a recovered but still open incident is logged on it', () => {
  const recovered = incident('[uptime:down] 2026-10-19T10:00:00.000Z', '[uptime:up] 2026-10-19T10:40:00.000Z')
  assert.deepEqual(decide({ down: true, incident: recovered }), { action: 'comment-down' })
})

test('downtime in minutes', () => {
  assert.equal(minutesBetween('2026-10-19T10:00:00.000Z', '2026-10-19T10:36:20.000Z'), 36)
})
