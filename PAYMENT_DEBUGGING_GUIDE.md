# Payment Debugging Guide - Status Pending Issue

## Current Status
✅ Server running on port 5000  
✅ MongoDB connected  
✅ Korba gateway configured with callback URL  
⚠️ **Issue**: Payment stays "pending" - webhook callback never received

## Root Cause Analysis

### Callback URL Configuration
```
Callback URL: https://chairs-signatures-portions-indie.trycloudflare.com/api/webhook/payment/Korba%20Xchange
```

This is a **Cloudflare tunnel** that should route external requests to your local backend on `localhost:5000`.

### Payment Flow
1. User initiates payment → `/api/payment/initiate` (✅ Working)
2. Backend creates PaymentTransaction (✅ Working)
3. Backend calls Korba API with callback URL (✅ Working)
4. User completes payment on phone (✅ Depends on Korba)
5. **Korba sends webhook callback** ← ⚠️ **THIS IS FAILING**
6. Webhook handler updates PaymentTransaction to 'success' ← ❌ Never happens
7. Frontend polls status and gets 'success' ← Never reached

## Debugging Steps

### Step 1: Verify Cloudflare Tunnel is Running
The callback URL uses `chairs-signatures-portions-indie.trycloudflare.com`, which is a Cloudflare tunnel.

**Check if tunnel is active:**
```bash
# Look for cloudflare running
netstat -ano | findstr "5000"  # Check if port 5000 is being proxied
```

**If tunnel is NOT running**, Korba's webhook will fail to reach your backend.

### Step 2: Monitor Webhook Reception
When you make a test payment, watch the server logs for:

```
=== WEBHOOK RECEIVED [GET/POST] ===
Gateway: Korba Xchange
Full URL: ...
Extracted callback data: ...
```

**If you don't see this message**, Korba never sent the webhook.

### Step 3: Test Payment and Capture Logs

1. **Open two terminals:**
   - Terminal 1: Backend running (already running)
   - Terminal 2: Watch logs

2. **In Terminal 2:**
   ```bash
   cd backend
   tail -f server.log  # Watch logs as they come in
   ```

3. **Make test payment:**
   - Go to dashboard/checkout
   - Network: MTN
   - Phone: 0537905668 (or any whitelisted number)
   - Amount: 1 GHS
   - Click "Confirm Payment"

4. **Watch logs for:**
   ```
   ✅ PAYMENT INITIATION START
   💳 Created transaction ID: TRX-xxxxx
   === KORBA DEBUG ===
   URL: https://testxchange.korba365.com/api/v1.0/collect/
   ```

   Then after 3-5 seconds, you should see either:
   ```
   🔔 WEBHOOK RECEIVED [GET/POST]  ← YES = working
   ```
   OR no webhook log = problem

### Step 4: Check What Korba Received

Log in to Korba sandbox admin with KORBA_EMAIL and KORBA_PASSWORD to verify:
- Transaction was created on Korba's side
- Callback URL is correctly configured in Korba dashboard
- Webhook was attempted

### Step 5: If Webhook Never Arrives

The most likely causes:

**A) Cloudflare Tunnel Not Running**
- The callback URL won't be reachable
- Solution: Restart cloudflare tunnel

**B) Callback URL Wrong Format**
- Korba might be sending the webhook differently
- Check if it's a query parameter vs POST body issue
- The GET/POST endpoints should handle both

**C) Network Firewall Issue**
- Your network might be blocking inbound connections
- Check firewall rules

**D) Korba's Webhook Configuration**
- Korba might have webhook disabled in its admin panel
- Check Korba dashboard settings

## New Debug Endpoints Added

### Check Korba Gateway Config
```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:5000/api/admin/korba-config
```

Returns:
- Callback URL
- Gateway status
- Client keys status

### Update Callback URL (if needed)
```bash
curl -X POST \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"callbackUrl":"https://your-new-url/api/webhook/payment/Korba Xchange"}' \
  http://localhost:5000/api/admin/set-korba-callback
```

## Enhanced Logging Added

The following improvements have been made:

1. **Payment Initiation** - Detailed logs showing:
   - Gateway lookup
   - Amount validation
   - TransactionID generation
   - Gateway response

2. **Webhook Handler** - Comprehensive logging:
   - HTTP method (GET/POST)
   - Full URL received
   - Extracted data
   - Transaction lookup
   - Order/Transaction creation

3. **Payment Callback Processing** - Detailed status tracking:
   - Status normalization (handles various formats)
   - Transaction updates
   - Database saves

## Expected Log Output (Successful Payment)

```
💳 PAYMENT INITIATION START
✅ Gateway found: Korba Xchange (test mode)
📋 Created transaction ID: TRX-1716959400000-abc123def
✅ PaymentTransaction saved to DB
🔄 Processing as collections API
🌐 Korba response: {"success":true,"korba_transaction_id":"KRB-xxx"}
✅ PaymentTransaction updated to pending status

[3-5 seconds later]

🔔 WEBHOOK RECEIVED [GET]
Gateway: Korba Xchange
Extracted callback data: {"transaction_id":"TRX-xxx","status":"SUCCESS"}
📝 Attempting to find transaction: TRX-xxx
✅ Found transaction
📊 Status normalization: SUCCESS → SUCCESS
✅ Order created: ObjectId
✅ Transaction created: ObjectId
✅ Webhook handler completed successfully
```

## Action Items

1. **Immediately check:** Is the Cloudflare tunnel running?
2. **Test payment:** Watch backend logs for webhook reception
3. **If webhook arrives:** Check that OrderID is being set on PaymentTransaction
4. **If webhook doesn't arrive:** 
   - Check Korba admin dashboard for webhook configuration
   - Verify callback URL in PaymentGateway matches Korba's settings
   - Test by manually POSTing to the webhook endpoint from Postman

---

**Last Updated:** 2026-05-30 - Enhanced webhook logging and status handling
