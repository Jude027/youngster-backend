# Dynamic Payment Gateway Integration Guide

## Overview

This system allows you to configure payment gateways dynamically without modifying code. You can add, update, and switch payment gateways through the admin panel.

## Payment Gateway Configuration

### Step 1: Access Admin Panel

1. Log in to your admin account
2. Navigate to the **"Payment Gateways"** tab in the admin panel

### Step 2: Configure Korba Xchange

1. Click on **"Payment Gateways"** dropdown (if available)
2. Select **"Korba Xchange"** or create a new gateway
3. Fill in the following configuration:

**Gateway Details:**
- **Gateway Name**: `Korba Xchange`
- **Gateway Type**: `Collections` (for mobile money) or `Hosted Checkout` (for cards)
- **API Base URL**: `https://testxchange.korba365.com/api/v1.0`
- **Client Key**: Your Korba Xchange merchant/client ID
- **Secret Key**: Your API secret key
- **Callback URL**: `http://yoursite.com/api/webhook/payment/Korba Xchange`
- **Min Amount**: `0.50` (GHS)
- **Max Amount**: `10000` (GHS)
- **Transaction Fee**: `0` (or your fixed fee)
- **Transaction Fee %**: `0` (or your percentage fee)
- **Test Mode**: Toggle ON/OFF

### Step 3: Network Mapping

The system automatically maps provider names to network codes:
- **MTN** → MTN
- **Telecel** → VOD (Vodafone)
- **AirtelTigo** → AIR
- Add more mappings as needed

### Step 4: Save Configuration

Click **"Save Configuration"** to store the settings in the database.

## How It Works

### User Payment Flow

1. **Customer selects a package**: Clicks "Purchase" on MTN, Telecel, or other provider page
2. **Redirected to checkout**: Payment details are populated automatically
3. **Payment initiation**: Customer confirms and sends payment request to Korba Xchange
4. **Payment processing**: Korba Xchange processes the mobile money request
5. **Status monitoring**: System checks payment status every 2 seconds
6. **Completion**: Customer sees success/failure and returns to dashboard

### Backend Flow

1. **Order submitted** → Data sent to `/api/payment/initiate`
2. **HMAC signature generated** using request body + secret key
3. **API request sent** to payment gateway with authorization header
4. **Response processed** and stored in PaymentTransaction collection
5. **Webhook callback** received at `/api/webhook/payment/{gatewayName}`
6. **Order status updated** based on gateway response

## Switching Payment Gateways

Since all configurations are stored in the database:

1. Create/Configure a new payment gateway in the admin panel
2. Enable it and disable the old one
3. Customers will automatically use the new gateway on next purchase
4. No code changes needed

## Supported Payment Gateways

### Korba Xchange (Configured)
- **Type**: Collections API for mobile money
- **Networks**: MTN, Telecel (Vodafone), AirtelTigo
- **Features**: HMAC-SHA256 authentication, async callbacks
- **Status**: Production-ready

### Future Gateways (Can be added)
- Stripe
- PayPal
- Flutterwave
- Other local payment providers

## API Endpoints

### For Customers

```
POST /api/payment/initiate
Body: {
    gatewayName: "Korba Xchange",
    phoneNumber: "0204000000",
    amount: 15.00,
    provider: "MTN",
    description: "Payment for 1GB MTN bundle"
}
Response: {
    success: true,
    transactionId: "TRX-1234567890-abc123",
    redirectUrl: null (for mobile money) or URL (for cards),
    message: "Payment initiated successfully"
}
```

```
GET /api/payment/status/{transactionId}
Response: {
    success: true,
    status: "pending|processing|success|failed|cancelled",
    transaction: { full transaction object }
}
```

### For Webhooks (No Auth Required)

```
POST /api/webhook/payment/{gatewayName}
Query/Body: {
    transaction_id: "TRX-1234567890-abc123",
    status: "SUCCESS|FAILED",
    message: "Transaction status message",
    korba_trans_id: "KORBA-REF-12345"
}
Response: {
    success: true,
    message: "Callback received"
}
```

### For Admin

```
GET /api/admin/payment-gateways
GET /api/admin/payment-gateway-config/{gatewayName}
PUT /api/admin/payment-gateway-config/{gatewayName}
GET /api/admin/payment-logs/{gatewayName}
GET /api/user/payment-history
```

## Configuration Details

### Korba Xchange Collections API

**Authentication**: HMAC-SHA256 Signature
- Calculate: `HMAC(secretKey, "key1=value1&key2=value2&...", SHA256)`
- Send: `Authorization: HMAC {clientKey}:{signature}`

**Request Parameters**:
- `client_id`: Your merchant ID
- `customer_number`: Phone number to charge
- `amount`: Transaction amount
- `transaction_id`: Unique reference from your system
- `network_code`: MTN, VOD, AIR, etc.
- `callback_url`: Where to send status updates
- `description`: Transaction description

**Response Format**:
```json
{
    "success": true,
    "redirect_url": null,
    "results": "Transaction initiated successfully",
    "korba_transaction_id": "KORBA-REF-12345",
    "error_code": null
}
```

## Testing

### Test Mode

When **Test Mode** is enabled:
- Uses test credentials from `testClientKey` and `testSecretKey`
- Sends requests to test API endpoints
- Doesn't charge actual money

### Without Test Mode

- Uses production credentials from `clientKey` and `secretKey`
- Sends requests to production API
- Actually charges customers

## Troubleshooting

### Payment not processing

1. Check payment gateway is **enabled** in admin panel
2. Verify **API credentials** (client key, secret key)
3. Confirm **Callback URL** is correct and accessible
4. Check **Min/Max amount** constraints
5. Review payment logs in admin panel

### Transaction failed

1. Open **Payment Logs** in admin panel
2. Find the transaction and view details
3. Check the error message
4. Verify phone number format
5. Confirm customer has sufficient balance with provider

### Incorrect fees charged

1. Review **Transaction Fee** settings
2. Check **Transaction Fee %** settings
3. Verify **Min/Max Amount** aren't limiting the transaction
4. Update amounts in admin panel if needed

## Database Models

### PaymentGateway Schema
```
- name: String (unique)
- type: String (collections, hosted-checkout, direct-card)
- enabled: Boolean
- clientKey: String
- secretKey: String (encrypted)
- apiBaseUrl: String
- callbackUrl: String
- paymentMethods: { mobileMoney, card, bankTransfer }
- transactionFee: Number
- transactionFeePercent: Number
- minAmount: Number
- maxAmount: Number
- isTestMode: Boolean
- createdAt: Date
- updatedAt: Date
```

### PaymentTransaction Schema
```
- userId: ObjectId
- orderId: ObjectId
- paymentGateway: String
- provider: String (MTN, Telecel, etc)
- phoneNumber: String
- amount: Number
- transactionId: String (unique)
- gatewayTransactionId: String
- status: String (pending, processing, success, failed, cancelled)
- totalAmount: Number (amount + fees)
- redirectUrl: String
- errorMessage: String
- initiatedAt: Date
- completedAt: Date
```

## Security Considerations

1. **Secret Keys**: Never expose in frontend code or logs
2. **Signature Verification**: Always verify webhook signatures
3. **HTTPS**: Use HTTPS for all API calls
4. **Callback Authentication**: Verify callback origin/signature
5. **Rate Limiting**: Implement rate limits on payment endpoints
6. **PCI Compliance**: Don't store credit card data directly

## Future Enhancements

1. Support for multiple currencies
2. Recurring/subscription payments
3. Payment method selection UI
4. Balance checking before payment
5. Retry logic for failed transactions
6. Payment reconciliation reports
7. Advanced analytics and reporting

## Support

For issues or questions about the payment gateway integration:
1. Check this guide thoroughly
2. Review payment logs in admin panel
3. Check console for JavaScript errors
4. Verify backend logs for server-side errors
5. Test with known good credentials
