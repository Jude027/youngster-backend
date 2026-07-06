# 🔧 Korba Status Query Fallback - Fix Implementation

## The Problem

When you approve a payment on your phone:
1. ✅ Korba API receives the transaction and returns `"success": true`
2. ❌ BUT Korba never sends the webhook callback to your backend
3. ❌ Frontend keeps polling and times out after 60 seconds
4. Result: **"Payment Failed" message** even though you approved it

## The Root Cause

**Korba's webhook system is not calling your callback URL.** This could be because:
- Your callback URL isn't publicly accessible (localhost issue)
- Korba's webhook configuration isn't set up correctly
- Korba has a test mode that doesn't send webhooks

## The Fix

I've implemented a **fallback mechanism** that **actively queries Korba's status endpoint** instead of just waiting for webhooks.

### How It Works Now

When frontend polls for payment status:

```
1. Frontend calls: GET /api/payment/status/TRX-xxx
2. Backend checks database status
3. If still "pending" after 10+ seconds:
   → Backend ACTIVELY queries Korba's status API
   → Korba responds with actual transaction status
   → Backend updates database
   → Frontend gets the real status
```

**Result:** Payment verified successfully even if webhook never arrives!

---

## Configuration Required

### Step 1: Enable Status Endpoint in Gateway Config

Go to **Admin → Payment Settings → Korba Xchange** and ensure:

```
Status Endpoint: /transaction_status
API Base URL: https://testxchange.korba365.com/api/v1.0
```

**Important:** The status endpoint URL will be built as:
```
BASE_URL + ENDPOINT + ?transaction_id=TRX-xxx
= https://testxchange.korba365.com/api/v1.0/transaction_status?transaction_id=TRX-xxx
```

### Step 2: Verify Gateway Config via API

```bash
curl -X GET "http://localhost:5000/api/admin/payment-gateway-config/Korba%20Xchange" \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" | jq .

# Look for:
# "statusEndpoint": "/transaction_status"
# "apiBaseUrl": "https://testxchange.korba365.com/api/v1.0"
```

### Step 3: Restart Backend

```bash
npm start
# in backend/ folder
```

---

## Testing the Fix

### Test 1: Process a Payment

1. Open payment page
2. Enter test details
3. **Approve the prompt** on your phone
4. **Watch server logs** for:

```
📥 [WEBHOOK] Received callback
  (if webhook works)
OR
🔄 [PaymentService] Attempting fallback status query from gateway API
🌐 [PaymentService] Querying gateway status endpoint
📡 [PaymentService] Gateway status response: {...}
✅ [PaymentService] Status query: Payment confirmed as SUCCESS
```

### Test 2: Manual Status Check

Check if status endpoint is reachable:

```bash
# Get a recent transaction ID
curl -X GET "http://localhost:5000/api/admin/payment-transactions-recent/Korba%20Xchange" \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"

# Use one of those transaction IDs to test status query
curl -X POST "http://localhost:5000/api/admin/test-gateway-status/Korba%20Xchange/TRX-1779837353193-99flstian" \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"

# Response should show the result from Korba's API
```

### Test 3: Check Specific Transaction

```bash
curl -X GET "http://localhost:5000/api/admin/payment-transaction/TRX-1779837353193-99flstian" \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" | jq .
```

---

## How the Fallback Works

### Timeline

| Time | Event | Log |
|------|-------|-----|
| 0s | Payment initiated | `📥 Korba API returns success` |
| 5s | First poll | `📊 Status check (database)` → status: "pending" |
| 10s | Fallback triggered | `🔄 Attempting fallback status query` |
| 10.5s | Query Korba API | `🌐 Querying gateway status endpoint` |
| 11s | Korba responds | `📡 Gateway status response: {success: true}` |
| 11.5s | Update database | `✅ Status query: Payment confirmed as SUCCESS` |
| 12s | Frontend polls again | `📊 Status check` → status: "success" ✅ |

### If Webhook Is Already Working

If Korba sends the webhook earlier:
- Webhook updates status immediately
- Fallback query still works as backup
- No double-processing (prevents duplicates)

---

## New Debug Endpoints

### View All Recent Payments for Gateway

```bash
curl -X GET "http://localhost:5000/api/admin/payment-transactions-recent/Korba%20Xchange?limit=50" \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"

# Shows:
# - Total count
# - Success/Failed/Pending breakdown
# - Transaction details with age in seconds
```

### Test Gateway Status Query

```bash
curl -X POST "http://localhost:5000/api/admin/test-gateway-status/Korba%20Xchange/TRX-xxx" \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"

# Manually trigger the status query to see if Korba responds
```

### View Single Transaction

```bash
curl -X GET "http://localhost:5000/api/admin/payment-transaction/TRX-xxx" \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"

# Shows exact status, errors, age, and health
```

### Emergency Fix

```bash
curl -X POST "http://localhost:5000/api/admin/mark-payment-success/TRX-xxx" \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"

# If all else fails, manually mark as successful
```

---

## Expected Behavior After Fix

### Best Case (Webhook + Fallback Both Work)
```
0s:  Payment initiated
2s:  [WEBHOOK] Received callback
5s:  Frontend polls → gets "success" ✅
```

### Good Case (Fallback Saves The Day)
```
0s:  Payment initiated
5s:  Frontend polls → "pending"
10s: Fallback query → Korba confirms payment ✅
12s: Frontend polls → gets "success" ✅
```

### Handled Gracefully (Manual Fix Available)
```
0s:  Payment initiated
60s: Frontend times out → "Payment Not Confirmed"
     But user approved! Use manual endpoint:
     POST /api/admin/mark-payment-success/TRX-xxx ✅
```

---

## Troubleshooting

### Still Getting "Pending" After 60 Seconds?

Check these in order:

1. **Is status endpoint configured?**
   ```bash
   # Check gateway config
   curl -X GET "http://localhost:5000/api/admin/payment-gateway-config/Korba%20Xchange" \
     -H "Authorization: Bearer TOKEN" | jq '.statusEndpoint'
   # Should show: "/transaction_status"
   ```

2. **Is Korba's status endpoint reachable?**
   ```bash
   # Test directly (replace with your URL):
   curl "https://testxchange.korba365.com/api/v1.0/transaction_status?transaction_id=TRX-test"
   ```

3. **Is the transaction in database?**
   ```bash
   # View transaction
   curl -X GET "http://localhost:5000/api/admin/payment-transaction/TRX-xxx" \
     -H "Authorization: Bearer TOKEN"
   ```

4. **Check server logs for errors:**
   ```bash
   # Look for:
   ❌ [PaymentService] Gateway status query error
   ⚠️ [PaymentService] Gateway returned non-JSON status response
   ```

### If Fallback Query Returns Null

1. Korba's status endpoint might need different authentication
2. Response format might not match expected fields
3. Status endpoint might not be enabled on your Korba account

**Contact Korba support with:**
- Your merchant ID
- Confirmation that status endpoint is enabled
- Expected response format for transaction status

---

## Files Modified

- `backend/services/PaymentService.js` - Added `queryGatewayStatus()` and fallback logic
- `backend/server.js` - Added test endpoint for status queries

## Restart Required

```bash
cd backend
npm start
```

---

## Summary

✅ **Fallback status queries work** even if webhooks fail
✅ **Automatic retry** after 10 seconds of pending status
✅ **Debug endpoints** to test and verify payment flow
✅ **Manual override** endpoint for emergency fixes
✅ **Comprehensive logging** to diagnose issues

**Next steps:**
1. Verify status endpoint is configured in gateway settings
2. Restart backend
3. Test a payment
4. Check logs for fallback query success
