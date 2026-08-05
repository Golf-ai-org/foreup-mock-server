# ForeUp API Mock Server

Mock server for ForeUp API demo/testing. The provider-facing response contract
follows ForeUp's published [API Blueprint](https://foreup.docs.apiary.io/).

Provider prices are returned as dollar-valued numbers in the blueprint's flat
`greenFee` and `cartFee` attributes. Conversion to integer cents belongs to the
FindTeeTimes public API boundary.

## Deploy to Replit

1. Create new Replit (Node.js)
2. Upload `server.js` and `package.json`
3. Click Run

## Deploy to Railway

```bash
railway login
railway init
railway up
```

## Local Testing

```bash
npm install
npm test
npm start
# Server runs on http://localhost:3099
```

## Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /tokens | Get JWT token |
| GET | /courses/:id | Get course info |
| GET | /courses/:id/teesheets/:id/teetimes | Get tee times |
| POST | /courses/:id/carts | Create cart |
| POST | /courses/:id/teesheets/:id/bookings | Create booking |

## Update ForeUp Demo Location

Once deployed, update the ForeUp demo location `loc_Z3s4brTOeYcs` in findteetimes prod database:

```sql
UPDATE location 
SET api_details = jsonb_set(
  api_details, 
  '{base_url}', 
  '"https://your-mock-server-url.replit.app"'
)
WHERE id = 'loc_Z3s4brTOeYcs';
```

## Test Credentials

Any email/password combination works (except `wrong_password`).
