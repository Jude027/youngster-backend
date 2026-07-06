# ⚡ Quick Fix - Do This Now

## The Issue You Just Had

Payment logs show:
- ✅ Korba API received payment: `"success": true`
- ❌ **No webhook callback received** (no `📥 [WEBHOOK]` logs)
- ❌ Frontend polls forever → "Payment Failed"

## The Fix (Already Implemented)

I've added a **fallback mechanism** that queries Korba's status endpoint directly when the webhook doesn't arrive.

## What You Need To Do

### 1. Verify Gateway Configuration

Go to **Admin → Payment Settings → Korba Xchange**

Check these fields:

```
API Base URL: https://testxchange.korba365.com/api/v1.0
Status Endpoint: /transaction_status
Callback URL: https://your-domain.com/api/webhook/payment/Korba%20Xchange
```

### 2. Restart Backend

```bash
cd backend
npm start
```

### 3. Test a Payment

- Process a test payment
- **Approve the prompt** on your phone
- **Watch server logs** for the fallback query:

```
🔄 [PaymentService] Attempting fallback status query from gateway API
🌐 [PaymentService] Querying gateway status endpoint
✅ [PaymentService] Status query: Payment confirmed as SUCCESS
```

### 4. If Still Not Working

Check the transaction status:

```bash
# From admin panel, get your transaction ID from logs
# Then test directly:
curl -X POST "http://localhost:5000/api/admin/test-gateway-status/Korba%20Xchange/TRX-xxx" \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

---

## What Changed

### Before
```
0s:  Pay → Korba says "OK"
5s:  Poll → "pending"
10s: Poll → "pending"
15s: Poll → "pending"
... (repeats 10 times)
60s: TIMEOUT → "Payment Failed" ❌
```

### After
```
0s:  Pay → Korba says "OK"
5s:  Poll → "pending"
10s: Poll triggers fallback query to Korba
10.5s: Korba confirms "SUCCESS"
12s: Poll → "success" ✅
```

---

## Debug Endpoints Available

### View Recent Payments
```bash
curl "http://localhost:5000/api/admin/payment-transactions-recent/Korba%20Xchange" \
  -H "Authorization: Bearer TOKEN" | jq .
```

### Check Single Transaction
```bash
curl "http://localhost:5000/api/admin/payment-transaction/TRX-xxx" \
  -H "Authorization: Bearer TOKEN" | jq .
```

### Test Status Query
```bash
curl -X POST "http://localhost:5000/api/admin/test-gateway-status/Korba%20Xchange/TRX-xxx" \
  -H "Authorization: Bearer TOKEN" | jq .
```

### Emergency Fix (Mark as Successful)
```bash
curl -X POST "http://localhost:5000/api/admin/mark-payment-success/TRX-xxx" \
  -H "Authorization: Bearer TOKEN"
```

---

## Expected Logs

### ✅ Good - Fallback Working

```
🔄 [PaymentService] Attempting fallback status query from gateway API
🌐 [PaymentService] Querying gateway status endpoint: https://...
📡 [PaymentService] Gateway status response: {"status":"SUCCESS"}
✅ [PaymentService] Status query: Payment confirmed as SUCCESS
```

### ❌ Problem - Endpoint Not Configured

```
⚠️ [PaymentService] Fallback status query failed
   statusEndpoint is empty
```

**Fix:** Check Admin → Payment Settings → Korba Xchange → Status Endpoint

---

## Key Points

✅ Fallback queries work **even if webhook never arrives**
✅ Queries triggered automatically after 10 seconds of pending
✅ Works as backup even if webhook does work
✅ No double-processing (idempotent)

## Done!

Restart your backend and test. Payment should verify successfully now! 🚀
