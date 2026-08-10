import assert from 'node:assert/strict';
import { test } from 'node:test';

import { generateMockTeeTimes, resolveUtcOffset } from '../server.js';

// A hardcoded offset silently relocates every slot for any course outside that
// zone: consumers parse the instant, then render it in the location's timezone,
// so 06:00-0700 renders as 23:00 in Australia/Sydney.
test('offset is derived from the zone, not frozen', () => {
  assert.equal(resolveUtcOffset('2026-08-20', 'America/Los_Angeles'), '-0700');
  assert.equal(resolveUtcOffset('2026-08-20', 'Australia/Sydney'), '+1000');
  assert.equal(resolveUtcOffset('2026-08-20', 'UTC'), '+0000');
});

test('offset follows DST rather than assuming one season', () => {
  // Northern and southern hemispheres shift in opposite directions.
  assert.equal(resolveUtcOffset('2026-01-15', 'America/Los_Angeles'), '-0800');
  assert.equal(resolveUtcOffset('2026-01-15', 'Australia/Sydney'), '+1100');
});

test('an unknown zone falls back to UTC instead of throwing', () => {
  assert.equal(resolveUtcOffset('2026-08-20', 'Not/AZone'), '+0000');
});

test('generated slots carry the resolved offset', () => {
  const slots = generateMockTeeTimes('2026-08-20', 9039, 2192);
  const expected = resolveUtcOffset('2026-08-20');

  assert.ok(slots.length > 0);
  for (const slot of slots) {
    assert.ok(
      slot.attributes.time.endsWith(expected),
      `expected ${slot.attributes.time} to end with ${expected}`,
    );
  }
});
