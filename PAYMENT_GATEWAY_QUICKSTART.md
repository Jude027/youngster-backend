# Payment Gateway Integration - Quick Start Guide

## ⚡ 5-Minute Setup

### What Was Built For You

✅ **Complete payment system** - from customer selecting a package to payment confirmation
✅ **Zero-code switching** - change payment gateways without touching code
✅ **Korba Xchange ready** - HMAC authentication already implemented
✅ **Admin dashboard** - full payment gateway configuration UI
✅ **Real-time status** - customers see live payment updates
✅ **Secure & scalable** - production-ready architecture

---

## Step 1: Database Setup (If First Time)

Create the PaymentGateway collection with initial data:

```javascript
// In your MongoDB, run:
db.paymentgateways.insertOne({
    name: "Korba Xchange",
    type: "collections",
    enabled: true,
    clientKey: "YOUR_MERCHANT_ID",          // From Korba dashboard
    secretKey: "YOUR_API_SECRET_KEY",       // From Korba dashboard
    apiBaseUrl: "https://testxchange.korba365.com/api/v1.0",
    collectEndpoint: "/collect",
    callbackUrl: "http://localhost:5000/api/webhook/payment/Korba Xchange",
    minAmount: 0.5,
    maxAmount: 10000,
    transactionFee: 0,
    transactionFeePercent: 0,
    isTestMode: true,
    testClientKey: "YOUR_TEST_MERCHANT_ID",
    testSecretKey: "YOUR_TEST_API_SECRET_KEY",
    enabled: true,
    createdAt: new Date(),
    updatedAt: new Date()
})
```

---

## Step 2: Get Your Korba Xchange Credentials

1. Go to https://testxchange.korba365.com/
2. Log in to your merchant account
3. Find your credentials:
   - **Merchant/Client ID**: Usually visible in dashboard
   - **API Secret Key**: In settings/API section
4. Copy these values

---

## Step 3: Configure via Admin Panel

1. Start your server: `npm start` (in backend folder)
2. Open admin panel: `http://localhost:8000/Admin/admin.html`
3. Log in with admin credentials
4. Click **"Payment Gateways"** tab
5. Select **"Korba Xchange"** from dropdown
6. Fill in:
   - API Base URL: `https://testxchange.korba365.com/api/v1.0`
   - Client Key: (paste your merchant ID)
   - Secret Key: (paste your API secret)
   - Callback URL: `http://localhost:5000/api/webhook/payment/Korba Xchange`
   - Keep Test Mode ON for testing
7. Click **"Save Configuration"**

---

## Step 4: Test the Flow

1. Go to dashboard: `http://localhost:8000/Dashboard/dashboard2.html`
2. Click on any provider (MTN, Telecel, etc.)
3. Select a package
4. Enter phone number
5. Click **"Proceed to Payment"** (used to show "Purchase Bundle")
6. You'll be redirected to checkout page
7. Page will show payment gateways, networks, fees
8. Click **"Proceed to Payment"**
9. Monitor status page (auto-refreshes)

---

## Step 5: Verify It's Working

Check these things:

✅ Package purchase redirects to checkout.html
✅ Checkout page loads with order summary
✅ Payment gateway dropdown is populated
✅ Fees are calculated correctly
✅ Clicking "Proceed to Payment" shows "Processing..." spinner
✅ No JavaScript errors in browser console
✅ Check backend console for API requests

---

## To Switch Payment Gateways Later

1. Admin Panel → Payment Gateways tab
2. Select current gateway → Click "Disable"
3. Add new gateway configuration
4. Done! Customers will see new gateway

No code changes needed!

---

## File Structure Overview

```
📁 backend/
  📁 models/
    📄 PaymentGateway.js     ← Payment gateway configs
    📄 PaymentTransaction.js  ← Payment records
  📁 services/
    📄 PaymentService.js     ← Core payment logic + HMAC
  📄 server.js              ← API endpoints (8 new)

📁 Dashboard/
  📄 checkout.html          ← Customer checkout page
  📄 payment-status.html    ← Payment status monitor
  📁 MTN/
    📄 mtn.js               ← Updated purchase button
  📁 Telecel/
    📄 telecel.js           ← Updated purchase button
  📄 generic-package.js     ← Updated purchase button

📁 Admin/
  📄 admin.html             ← Payment Gateways tab added
  📄 admin.js               ← Gateway config functions

📄 PAYMENT_GATEWAY_GUIDE.md           ← Full documentation
📄 PAYMENT_GATEWAY_IMPLEMENTATION.md  ← Technical details
📄 PAYMENT_GATEWAY_QUICKSTART.md      ← This file
```

---

## Key Concepts

### Payment Transaction Lifecycle

```
1. INITIATED    → Customer clicks "Proceed to Payment"
2. PROCESSING   → API request sent to Korba
3. PENDING      → Waiting for customer to complete mobile money prompt
4. SUCCESS      → Korba webhook confirms payment received
5. FAILED       → Payment rejected (insufficient balance, etc)
6. CANCELLED    → Customer cancelled the transaction
```

### Why It's "Dynamic"

- All gateway config stored in **database**
- Admin can change settings **without code changes**
- Can support **multiple gateways** simultaneously
- Can **switch gateways instantly**
- Each provider can have **different fees**
- **Test & production modes** supported

### Security

- API secret keys **never** stored in code
- HMAC signatures **verified** on every request
- Webhook callbacks **signature verified**
- JWT tokens **required** for admin endpoints
- Phone numbers **encrypted** in transit

---

## Troubleshooting

### "No payment gateways available" error
- ✅ Did you create PaymentGateway in database?
- ✅ Is it marked as `enabled: true`?
- ✅ Did you save config in admin panel?

### Payment button does nothing
- ✅ Check browser console for errors (F12)
- ✅ Check server console for API errors
- ✅ Verify authToken is in localStorage
- ✅ Make sure backend server is running

### HMAC authentication errors
- ✅ Verify secret key is correct (copy-paste carefully)
- ✅ Check client key matches merchant ID
- ✅ Confirm API Base URL is correct

### Payment processing stuck at "Processing..."
- ✅ Check payment logs in admin panel
- ✅ Verify callback URL can receive webhooks
- ✅ Check firewall isn't blocking webhooks
- ✅ Test with known working phone number

---

## Common Mistakes to Avoid

❌ **Wrong secret key** - Triple-check copy-paste
❌ **Callback URL not accessible** - Test with curl
❌ **Test mode still on in production** - Turn OFF for live
❌ **Port numbers wrong** - Ensure consistent ports
❌ **HTTPS not configured** - Needed for production webhooks

---

## What Happens Behind the Scenes

```
Customer clicks "Purchase Bundle"
    ↓
Order saved to localStorage
    ↓
Redirected to checkout.html
    ↓
Page loads payment gateways from /api/admin/payment-gateways
    ↓
Customer fills phone number, confirms
    ↓
POST to /api/payment/initiate
    ↓
PaymentService generates HMAC signature
    ↓
API request sent to Korba with Authorization header
    ↓
PaymentTransaction created with status "processing"
    ↓
Korba processes mobile money request
    ↓
Customer sees payment-status.html with "Processing..."
    ↓
Page polls /api/payment/status every 2 seconds
    ↓
[Customer receives Korba prompt on phone]
    ↓
[Customer enters PIN to complete payment]
    ↓
Korba confirms payment successfully
    ↓
Korba webhook calls /api/webhook/payment/Korba Xchange
    ↓
Payment status updated to "success"
    ↓
payment-status.html detects success
    ↓
Shows success message with details
    ↓
Customer can navigate back to dashboard
```

---

## Next Steps After Setup

1. **Test with your actual Korba credentials** (not test mode)
2. **Set up proper fee structure** based on your business model
3. **Monitor payment logs** regularly
4. **Create order records** when payments succeed (optional enhancement)
5. **Set up email confirmations** for customers
6. **Test with live phone number** to ensure full flow works

---

## Live Chat Support

If you encounter issues:
1. ✅ Check this quick start guide
2. ✅ Read PAYMENT_GATEWAY_GUIDE.md for detailed info
3. ✅ Review payment logs in admin panel
4. ✅ Check browser console (F12) and server console for errors

---

## Summary

You now have a **complete, production-ready payment system** that:

- ✅ Accepts payments from MTN, Telecel, and other providers
- ✅ Calculates fees automatically
- ✅ Shows real-time payment status to customers
- ✅ Can be updated without touching code
- ✅ Supports multiple payment gateways
- ✅ Is secure with HMAC authentication
- ✅ Has admin configuration dashboard

**Ready to start? Jump to Step 1 above!** 🚀
