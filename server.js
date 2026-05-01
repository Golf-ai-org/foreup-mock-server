/**
 * ForeUp API Mock Server
 * 
 * Deployable mock server for ForeUp API demo/testing
 * Matches ForeUp API v2 structure
 */

import express from 'express';

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3099;

const MOCK_JWT_TOKEN = 'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzUxMiJ9.MOCK_TOKEN_FOR_DEMO';

// Generate mock tee times for a date
function generateMockTeeTimes(date, courseId, teesheetId) {
  const times = [];
  const baseDate = new Date(date);
  
  // Generate slots from 6am to 6pm every 10 minutes
  for (let hour = 6; hour <= 18; hour++) {
    for (let minute = 0; minute < 60; minute += 10) {
      const time = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`;
      const availableSpots = Math.floor(Math.random() * 4) + 1; // 1-4 spots
      // ForeUp API returns prices in DOLLARS (not cents)
      const basePrice = hour < 12 ? 65 : (hour < 15 ? 55 : 45); // Morning/afternoon/twilight in dollars
      
      times.push({
        id: `slot_${courseId}_${date}_${hour}${String(minute).padStart(2, '0')}`,
        type: 'teetime',
        attributes: {
          time: `${date}T${time}`,
          availableSpots,
          minPlayers: 1,
          maxPlayers: 4,
          allowedGroupSizes: [1, 2, 3, 4],
          holes: 18,
          teeSheetSideId: 4979,
          scheduleSideId: 4979,
          pricing: {
            greenFee: basePrice + Math.floor(Math.random() * 10), // $45-75 range
            cartFee: 20, // $20 cart fee
            total: basePrice + 20 + Math.floor(Math.random() * 10),
          },
          bookingClassId: 1,
          bookingClassName: 'Public',
        },
      });
    }
  }
  
  return times;
}

// Middleware to check authorization
function checkAuth(req, res, next) {
  const authHeader = req.headers['x-authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      errors: [{ status: '401', title: 'Unauthorized', detail: 'Missing or invalid x-authorization header' }],
    });
  }
  next();
}

// CORS middleware
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, x-authorization');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// POST /tokens - Get JWT token
app.post('/tokens', (req, res) => {
  const { email, password } = req.body;
  
  if (!email || !password) {
    return res.status(400).json({
      errors: [{ status: '400', title: 'Bad Request', detail: 'Email and password are required' }],
    });
  }
  
  if (password === 'wrong_password' || password === 'invalid') {
    return res.status(401).json({
      errors: [{ status: '401', title: 'Unauthorized', detail: 'Invalid email or password' }],
    });
  }
  
  console.log(`[MOCK] Token requested for: ${email}`);
  
  res.json({
    data: {
      type: 'token',
      id: MOCK_JWT_TOKEN,
    },
  });
});

// GET /courses/:courseId - Get course info
app.get('/courses/:courseId', checkAuth, (req, res) => {
  const { courseId } = req.params;
  
  console.log(`[MOCK] Course info requested: ${courseId}`);
  
  res.json({
    data: {
      type: 'course',
      id: courseId,
      attributes: {
        name: 'ForeUp Demo Golf Course',
        city: 'Phoenix',
        state: 'AZ',
        tee_sheet_version: '2.0.0',
        timezone: 'America/Phoenix',
      },
      relationships: {
        teesheets: {
          data: [{ type: 'teesheet', id: '2192' }],
        },
      },
    },
  });
});

// GET /courses/:courseId/teesheets/:teesheetId/teetimes - Get tee time slots
app.get('/courses/:courseId/teesheets/:teesheetId/teetimes', checkAuth, (req, res) => {
  const { courseId, teesheetId } = req.params;
  const { date, startTime, endTime } = req.query;
  
  console.log(`[MOCK] Tee times requested: course=${courseId}, teesheet=${teesheetId}, date=${date}`);
  
  if (!date) {
    return res.status(400).json({
      errors: [{ status: '400', title: 'Bad Request', detail: 'Date parameter is required' }],
    });
  }
  
  const teeTimes = generateMockTeeTimes(date, courseId, teesheetId);
  
  // Filter by time if specified
  let filtered = teeTimes;
  if (startTime) {
    const start = parseInt(startTime.replace(':', ''));
    filtered = filtered.filter((t) => {
      const timeNum = parseInt(t.attributes.time.split('T')[1].replace(/:/g, '').slice(0, 4));
      return timeNum >= start;
    });
  }
  if (endTime) {
    const end = parseInt(endTime.replace(':', ''));
    filtered = filtered.filter((t) => {
      const timeNum = parseInt(t.attributes.time.split('T')[1].replace(/:/g, '').slice(0, 4));
      return timeNum <= end;
    });
  }
  
  res.json({
    data: filtered,
    meta: {
      total: filtered.length,
      teeSheetVersion: '2.0.0',
    },
  });
});

// In-memory storage
const carts = new Map();
const bookings = new Map();
const customers = new Map();
let cartIdCounter = 1000;
let bookingIdCounter = 1000;
let customerIdCounter = 1000;

// ============================================================================
// Deterministic test customers (seeded on boot)
// ============================================================================
// These exist so that findteetimes /api/customers (foreup provider path) can
// return contacts + bookings for known phone numbers — required for the
// concierge conversation-init webhook to surface booking_sentence /
// booking_count dynamic variables when an inbound caller's phone matches.
//
// We seed phones the agent-tool-calls.test.ts uses so booking-aware greeting
// tests can run against the foreup demo course agent (which we own end-to-end
// via this mock).
function seedTestCustomers() {
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const dayAfter = new Date(Date.now() + 48 * 60 * 60 * 1000);
  const fmt = (d, h) => {
    const iso = new Date(d);
    iso.setHours(h, 0, 0, 0);
    return iso.toISOString();
  };

  const seeds = [
    {
      id: 'cust_seed_1001',
      attributes: {
        firstName: 'Bob',
        lastName: 'Mock',
        email: 'bob.mock@example.com',
        phone: '+15551234567',
      },
      bookings: [
        {
          id: 'TTID_seed_2001',
          confirmationCode: 'CONF-BOB-1',
          courseName: 'ForeUp Demo Course',
          teeTime: fmt(tomorrow, 10),
          players: 2,
          holes: 18,
          startSide: 'F1',
          status: 'BOOKED',
          canCancel: true,
        },
      ],
    },
    {
      id: 'cust_seed_1002',
      attributes: {
        firstName: 'Alice',
        lastName: 'Mock',
        email: 'alice.mock@example.com',
        phone: '+15559999999',
      },
      bookings: [
        {
          id: 'TTID_seed_2002',
          confirmationCode: 'CONF-ALICE-1',
          courseName: 'ForeUp Demo Course',
          teeTime: fmt(tomorrow, 14),
          players: 4,
          holes: 18,
          startSide: 'F1',
          status: 'BOOKED',
          canCancel: true,
        },
        {
          id: 'TTID_seed_2003',
          confirmationCode: 'CONF-ALICE-2',
          courseName: 'ForeUp Demo Course',
          teeTime: fmt(dayAfter, 9),
          players: 2,
          holes: 9,
          startSide: 'F10',
          status: 'BOOKED',
          canCancel: true,
        },
      ],
    },
  ];

  for (const s of seeds) {
    customers.set(s.id, { id: s.id, type: 'customer', attributes: s.attributes });
    for (const b of s.bookings) {
      bookings.set(b.id, {
        id: b.id,
        type: 'booking',
        customerId: s.id,
        attributes: b,
      });
    }
  }
  console.log(
    `[MOCK] Seeded ${seeds.length} test customers + ${seeds.reduce((n, s) => n + s.bookings.length, 0)} bookings`,
  );
}
seedTestCustomers();

// Normalize a phone string to digits-only for matching (ignores formatting).
// Strips a leading US country code so "+15551234567" and "5551234567" match.
function phoneDigitsOnly(s) {
  const digits = String(s || '').replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) {
    return digits.slice(1);
  }
  return digits;
}

// POST /courses/:courseId/carts - Create cart
app.post('/courses/:courseId/carts', checkAuth, (req, res) => {
  const { courseId } = req.params;
  const cartId = `cart_${cartIdCounter++}`;
  
  console.log(`[MOCK] Cart created: ${cartId}`);
  
  const cart = {
    id: cartId,
    type: 'cart',
    attributes: {
      status: 'open',
      items: [],
      customers: [],
      payments: [],
      total: 0,
    },
  };
  
  carts.set(cartId, cart);
  res.json({ data: cart });
});

// POST /courses/:courseId/carts/:cartId/items - Add item to cart
app.post('/courses/:courseId/carts/:cartId/items', checkAuth, (req, res) => {
  const { cartId } = req.params;
  const cart = carts.get(cartId);
  
  if (!cart) {
    return res.status(404).json({
      errors: [{ status: '404', title: 'Not Found', detail: 'Cart not found' }],
    });
  }
  
  const item = req.body.data;
  cart.attributes.items.push(item);
  cart.attributes.total += item.attributes?.price || 5000;
  
  res.json({ data: cart });
});

// POST /courses/:courseId/carts/:cartId/customers - Add customer to cart
app.post('/courses/:courseId/carts/:cartId/customers', checkAuth, (req, res) => {
  const { cartId } = req.params;
  const cart = carts.get(cartId);
  
  if (!cart) {
    return res.status(404).json({
      errors: [{ status: '404', title: 'Not Found', detail: 'Cart not found' }],
    });
  }
  
  const customer = req.body.data;
  cart.attributes.customers.push(customer);
  
  res.json({ data: cart });
});

// POST /courses/:courseId/carts/:cartId/payments - Add payment to cart
app.post('/courses/:courseId/carts/:cartId/payments', checkAuth, (req, res) => {
  const { cartId } = req.params;
  const cart = carts.get(cartId);
  
  if (!cart) {
    return res.status(404).json({
      errors: [{ status: '404', title: 'Not Found', detail: 'Cart not found' }],
    });
  }
  
  const payment = req.body.data;
  cart.attributes.payments.push(payment);
  
  res.json({ data: cart });
});

// PUT /courses/:courseId/carts/:cartId - Complete cart
app.put('/courses/:courseId/carts/:cartId', checkAuth, (req, res) => {
  const { courseId, cartId } = req.params;
  const cart = carts.get(cartId);
  
  if (!cart) {
    return res.status(404).json({
      errors: [{ status: '404', title: 'Not Found', detail: 'Cart not found' }],
    });
  }
  
  const bookingId = `TTID_${bookingIdCounter++}`;
  const booking = {
    id: bookingId,
    type: 'booking',
    attributes: {
      confirmationNumber: bookingId,
      status: 'confirmed',
      courseId,
      items: cart.attributes.items,
      customers: cart.attributes.customers,
      total: cart.attributes.total,
    },
  };
  
  bookings.set(bookingId, booking);
  cart.attributes.status = 'completed';
  
  res.json({
    data: {
      type: 'sale',
      id: `sale_${bookingId}`,
      attributes: {
        bookingId,
        confirmationNumber: bookingId,
        status: 'completed',
      },
    },
  });
});

// POST /courses/:courseId/teesheets/:teesheetId/bookings - Create booking directly
app.post('/courses/:courseId/teesheets/:teesheetId/bookings', checkAuth, (req, res) => {
  const { courseId, teesheetId } = req.params;
  const bookingData = req.body.data;
  
  const bookingId = `TTID_${bookingIdCounter++}`;
  
  console.log(`[MOCK] Booking created: ${bookingId}`);
  
  const booking = {
    id: bookingId,
    type: 'booking',
    attributes: {
      confirmationNumber: bookingId,
      status: 'confirmed',
      time: bookingData.attributes?.time,
      holes: bookingData.attributes?.holes || 18,
      players: bookingData.attributes?.bookedPlayers || [],
      courseId,
      teesheetId,
    },
  };
  
  bookings.set(bookingId, booking);
  res.status(201).json({ data: booking });
});

// DELETE /courses/:courseId/teesheets/:teesheetId/bookings/:bookingId - Cancel booking
app.delete('/courses/:courseId/teesheets/:teesheetId/bookings/:bookingId', checkAuth, (req, res) => {
  const { bookingId } = req.params;
  
  console.log(`[MOCK] Booking cancelled: ${bookingId}`);
  
  if (bookings.has(bookingId)) {
    bookings.delete(bookingId);
  }
  
  res.status(204).send();
});

// GET /courses/:courseId/customers - Search customers
//
// ForeUp filter syntax: query params are `email=eq:foo@bar.com`, `phone=eq:+15551234567`,
// `firstName=eq:Bob`, `lastName=eq:Mock`. Multiple filters AND together.
//
// Each customer record optionally includes a `bookings` array (active +
// upcoming) so callers don't need a follow-up round trip — same shape used by
// providers like ProShopTeeTimes ContactSearch in findteetimes' unified layer.
app.get('/courses/:courseId/customers', checkAuth, (req, res) => {
  const stripEq = (v) => (typeof v === 'string' ? v.replace(/^eq:/, '') : v);
  const filters = {
    email: stripEq(req.query.email)?.toLowerCase(),
    phone: req.query.phone ? phoneDigitsOnly(stripEq(req.query.phone)) : undefined,
    firstName: stripEq(req.query.firstName)?.toLowerCase(),
    lastName: stripEq(req.query.lastName)?.toLowerCase(),
  };

  const hasAnyFilter = Object.values(filters).some((v) => v !== undefined && v !== '');
  if (!hasAnyFilter) {
    return res.json({ data: [] });
  }

  // Match against the seeded + runtime customers Map. Phone matching is
  // digits-only so callers can pass +15551234567, 555-123-4567, etc.
  const matches = [];
  for (const c of customers.values()) {
    const a = c.attributes || {};
    if (filters.email && a.email?.toLowerCase() !== filters.email) continue;
    if (filters.phone && phoneDigitsOnly(a.phone) !== filters.phone) continue;
    if (filters.firstName && a.firstName?.toLowerCase() !== filters.firstName) continue;
    if (filters.lastName && a.lastName?.toLowerCase() !== filters.lastName) continue;
    matches.push(c);
  }

  // Attach this customer's bookings inline (active/upcoming, sorted by time).
  const enriched = matches.map((c) => {
    const customerBookings = [];
    for (const b of bookings.values()) {
      if (b.customerId === c.id) {
        customerBookings.push(b.attributes);
      }
    }
    customerBookings.sort((a, b) =>
      String(a.teeTime || '').localeCompare(String(b.teeTime || '')),
    );
    return {
      ...c,
      attributes: {
        ...c.attributes,
        bookings: customerBookings,
      },
    };
  });

  console.log(
    `[MOCK] customer search: filters=${JSON.stringify(filters)} → ${enriched.length} match(es)`,
  );
  res.json({ data: enriched });
});

// POST /courses/:courseId/customers - Create customer
app.post('/courses/:courseId/customers', checkAuth, (req, res) => {
  const customerData = req.body.data;
  const customerId = `cust_${customerIdCounter++}`;
  
  const customer = {
    id: customerId,
    type: 'customer',
    attributes: { ...customerData.attributes },
  };
  
  customers.set(customerId, customer);
  res.status(201).json({ data: customer });
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'foreup-mock-server', timestamp: new Date().toISOString() });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({ 
    service: 'ForeUp API Mock Server',
    version: '1.0.0',
    endpoints: [
      'POST /tokens',
      'GET /courses/:id',
      'GET /courses/:id/teesheets/:id/teetimes',
      'POST /courses/:id/carts',
      'POST /courses/:id/teesheets/:id/bookings',
    ],
  });
});

app.listen(PORT, () => {
  console.log(`ForeUp Mock Server running on port ${PORT}`);
});
