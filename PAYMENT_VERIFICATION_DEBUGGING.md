# Payment Verification Debugging Guide

## Problem: "Payment Failed" Even After Approving Prompt

If users approve the payment prompt on their phone but still see "Payment Failed", this guide helps diagnose the issue.

---

## Root Causes Identified

### 1. **Webhook Callback Not Received**
   - The payment gateway is not sending the payment status callback to your backend
   - **Symptom**: Payment status stays "pending" and times out after 60 seconds
   - **Check**: Look for `[WEBHOOK]` log messages when payment completes

### 2. **Callback Data Malformed**
   - Payment gateway sends callback but with wrong field names or format
   - **Symptom**: Webhook receives data but fails to process it
   - **Check**: Look for `Missing transaction_id` or `Missing status` errors in logs

### 3. **Callback URL Misconfigured**
   - Your backend callback URL is not set correctly in payment gateway config
   - **Symptom**: No webhook logs appear at all
   - **Check**: Verify `callbackUrl` in `/api/admin/payment-gateway-config/:gatewayName`

### 4. **Transaction ID Mismatch**
   - The transaction ID sent in callback doesn't match what we generated
   - **Symptom**: Webhook processes but returns "Transaction not found"
   - **Check**: Compare transaction IDs in logs

---

## How to Debug

### Step 1: Check Server Logs

Run your backend server and watch for these log patterns:

```bash
# Good flow - you should see these in order:
📥 [WEBHOOK] Received callback { transaction_id: "TRX-...", status: "SUCCESS" }
🔄 [PaymentService] Processing callback { current_status: "pending", new_status: "SUCCESS" }
✅ [PaymentService] Payment marked as SUCCESS
📊 [WEBHOOK] Callback processed { result_status: "success" }
✅ [WEBHOOK] Order and Transaction created

# Bad flow - errors to watch for:
❌ [WEBHOOK] Missing transaction_id
❌ [WEBHOOK] Missing status
❌ [PaymentService] Transaction not found for callback
⚠️ [PaymentService] Unknown payment status received
```

### Step 2: Verify Payment Gateway Configuration

Check if your payment gateway callback URL is correct:

```bash
# Frontend: Check Admin > Payment Settings > [Your Gateway]
# Or API call:
curl -X GET "http://localhost:5000/api/admin/payment-gateway-config/Korba%20Xchange" \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"

# Look for:
- "callbackUrl": "http://YOUR_DOMAIN/api/webhook/payment/Korba%20Xchange"
- "enabled": true
- "clientKey" and "secretKey" are set (not empty)
```

### Step 3: Verify Transaction is Created

When payment is initiated, a transaction should be created:

```bash
# Check all transactions (admin only):
curl -X GET "http://localhost:5000/api/admin/payment-logs/Korba%20Xchange" \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"

# Look for transactions with:
- "status": "pending" (before callback)
- "status": "success" or "failed" (after callback)
- "transactionId": "TRX-..." (must match what's sent in callback)
```

### Step 4: Test Webhook Manually

To simulate what the payment gateway sends:

```bash
# Manual webhook test (replace with your actual transaction ID):
curl -X POST "http://localhost:5000/api/webhook/payment/Korba%20Xchange" \
  -H "Content-Type: application/json" \
  -d '{
    "transaction_id": "TRX-1234567890-abc123",
    "status": "SUCCESS",
    "message": "Payment successful",
    "korba_trans_id": "KRB-98765"
  }'

# Expected response:
# { "success": true, "message": "Callback received and processed" }

# Check server logs for success messages
```

---

## Common Issues & Fixes

### Issue 1: Status Check Always Returns "pending"

**Cause**: Webhook is not being called by the payment gateway

**Fix**:
1. Check if `callbackUrl` is reachable from the internet (not localhost)
2. Verify the gateway has your callback URL saved in their admin panel
3. Test webhook manually (see Step 4 above)

```javascript
// Bad callback URL (localhost won't work from internet):
"callbackUrl": "http://localhost:5000/api/webhook/payment/Korba%20Xchange"

// Good callback URL (must be publicly accessible):
"callbackUrl": "https://yourdomain.com/api/webhook/payment/Korba%20Xchange"
```

### Issue 2: "Transaction not found" Error

**Cause**: Transaction ID in callback doesn't match what we generated

**Fix**:
1. Ensure the callback includes the same `transaction_id` we sent
2. Check if the payment gateway is modifying the transaction ID

```javascript
// When initiating payment:
const transactionId = `TRX-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
// This must be the SAME ID sent in the callback
```

### Issue 3: Status Shows "Unknown Status"

**Cause**: Payment gateway sends unexpected status code

**Fix**: 
1. Check what status the gateway is sending
2. Add it to the success/failed status lists in PaymentService.js

```javascript
// Current recognized statuses:
const successStatuses = ['SUCCESS', 'success', 'SUCCESSFUL', 'completed', 'COMPLETED', '00'];
const failedStatuses  = ['FAILED', 'failed', 'FAILURE', 'error', 'ERROR', 'declined'];

// If gateway sends something else, it won't match
// Add the new status to the appropriate list
```

---

## Enhanced Logging Details

The improved webhook handler now logs:

### Webhook Received
```
📥 [WEBHOOK] Received callback {
  gateway: "Korba Xchange",
  transaction_id: "TRX-...",
  status: "SUCCESS",
  message: "...",
  timestamp: "2024-..."
}
```

### Payment Service Processing
```
🔄 [PaymentService] Processing callback {
  transaction_id: "TRX-...",
  current_status: "pending",
  new_status: "SUCCESS",
  isSuccess: true,
  isFailed: false
}
```

### Order Creation
```
✅ [WEBHOOK] Order and Transaction created {
  transaction_id: "TRX-...",
  orderId: "507f...",
  userId: "507f...",
  processingTime: "234ms"
}
```

### Error Scenarios
```
❌ [WEBHOOK] Missing transaction_id { ... }
❌ [WEBHOOK] PaymentTransaction not found { ... }
❌ [WEBHOOK] Error creating order/transaction { ... }
```

---

## Step-by-Step Troubleshooting

### For Users Seeing "Payment Not Confirmed"

1. **Screenshot the error message** - send it to support
2. **Don't close the browser** - tap "I Approved — Check Again"
3. **Wait up to 60 seconds** - network delays happen
4. If still fails, try "Try Again (New Payment)"

### For Admins/Developers

1. **Watch server logs** while processing a payment
2. **Check for webhook logs** - should appear 5-10 seconds after approval
3. **Verify callback URL** is publicly accessible and correct
4. **Test manually** with curl/Postman (see Step 4 above)
5. **Check payment gateway settings** - callback might need to be enabled/saved

---

## Configuration Checklist

Use this checklist to ensure payment gateway is set up correctly:

- [ ] Gateway is **enabled**: `"enabled": true`
- [ ] Gateway has a **name**: e.g., "Korba Xchange"
- [ ] **API credentials** are configured:
  - [ ] `clientKey` or `clientId` (merchant ID)
  - [ ] `secretKey` (for HMAC signing)
  - [ ] `apiBaseUrl` points to gateway API
- [ ] **Endpoints** are correct:
  - [ ] `collectEndpoint` for collections API
  - [ ] `statusEndpoint` for status checks
- [ ] **Callback URL** is set and publicly accessible:
  - [ ] `callbackUrl`: `https://yourdomain.com/api/webhook/payment/{gatewayName}`
- [ ] **Redirect URL** is set:
  - [ ] `redirectUrl`: Where to send users after payment
- [ ] **Test mode** is appropriate:
  - [ ] Set `isTestMode: true` for testing
  - [ ] Ensure test credentials are provided if using test mode
- [ ] **Amount limits** are reasonable:
  - [ ] `minAmount`: Usually 0.50-1.00 GHS
  - [ ] `maxAmount`: Usually 5000-10000 GHS
- [ ] **Network mapping** covers your providers:
  - [ ] MTN → correct code
  - [ ] Telecel → correct code
  - [ ] AirtelTigo → correct code

---

## Testing Payment Flow Locally

For testing without a real payment gateway:

```javascript
// 1. Create a transaction manually (via API or code)
// 2. Simulate the webhook callback:
POST /api/webhook/payment/TestGateway
{
  "transaction_id": "TRX-1234567890-test",
  "status": "SUCCESS",
  "message": "Test successful",
  "korba_trans_id": "TEST-12345"
}

// 3. Check payment status:
GET /api/payment/status/TRX-1234567890-test

// 4. Should return:
// { "success": true, "status": "success", ... }
```

---

## When to Contact Support

Provide these details:

1. **Payment gateway being used** - Korba Xchange, etc.
2. **Transaction ID** that failed
3. **Last status checked** - pending/success/failed
4. **Server logs** (redact sensitive data)
5. **Screenshot** of the error message

Then we can:
- Check if webhook was received
- Verify transaction was created
- Debug the specific failure
- Implement a fix if needed
