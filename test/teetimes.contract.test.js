import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

import { app } from '../server.js';

let baseUrl;
let server;
let token;

before(async () => {
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });

  const address = server.address();
  baseUrl = `http://127.0.0.1:${address.port}`;

  const response = await fetch(`${baseUrl}/tokens`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'contract@example.com', password: 'test' }),
  });
  const body = await response.json();
  token = body.data.id;
});

after(async () => {
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
});

test('tee-time HTTP response follows the published ForeUp API Blueprint shape', async () => {
  const response = await fetch(
    `${baseUrl}/courses/9039/teesheets/2192/teetimes?date=2026-08-10&startTime=0700&endTime=0700`,
    { headers: { 'x-authorization': `Bearer ${token}` } },
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.data.length, 1);

  const slot = body.data[0];
  assert.equal(slot.type, 'tee_time_slot');
  assert.match(slot.id, /^slot_9039_2026-08-10_0700$/);
  assert.deepEqual(slot.attributes, {
    time: '2026-08-10T07:00:00-0700',
    holes: 18,
    scheduleName: 'ForeUp Demo Golf Course',
    scheduleId: '2192',
    bookingClassId: 1,
    availableSpots: 4,
    greenFee: 68,
    cartFee: 20,
    rateType: 'both',
    greeFeeTax: 0,
    cartFeeTax: 0,
    hasSpecial: false,
    specialDiscountPercentage: 0,
    scheduleSideId: 4979,
    scheduleSideName: 'Front',
    reroundScheduleSideId: 4980,
    reroundScheduleSideName: 'Back',
    allowedGroupSizes: [1, 2, 3, 4],
  });
  assert.equal('pricing' in slot.attributes, false);
  assert.equal(body.meta.teeSheetVersion, '2.0.0');
});
