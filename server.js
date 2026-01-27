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
      const basePrice = hour < 12 ? 6500 : (hour < 15 ? 5500 : 4500); // Morning/afternoon/twilight
      
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
            greenFee: basePrice + Math.floor(Math.random() * 1000),
            cartFee: 2000,
            total: basePrice + 2000 + Math.floor(Math.random() * 1000),
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
app.get('/courses/:courseId/customers', checkAuth, (req, res) => {
  const { email } = req.query;
  
  if (email) {
    const emailValue = email.replace('eq:', '');
    res.json({
      data: [
        {
          id: `cust_${customerIdCounter}`,
          type: 'customer',
          attributes: {
            email: emailValue,
            firstName: 'Demo',
            lastName: 'User',
            phone: '555-123-4567',
          },
        },
      ],
    });
  } else {
    res.json({ data: [] });
  }
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
