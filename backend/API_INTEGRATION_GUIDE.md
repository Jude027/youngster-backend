# Universal API Integration System

## Overview
This system allows you to dynamically integrate with any third-party API provider without hardcoding API details into your application. All API configurations are stored in the database and can be managed through the admin panel.

## Architecture

### Components
1. **Provider Model** - Stores provider info + API configuration
2. **ProviderAPILog** - Logs all API interactions for debugging
3. **UniversalAPIHandler** - Core service that processes orders through any API
4. **Admin Interface** - Manage API configurations

### Flow Diagram
```
Admin configures API → Stored in DB
       ↓
Customer places order
       ↓
System looks up provider config
       ↓
UniversalAPIHandler maps request
       ↓
Sends to external API
       ↓
Parses response & logs interaction
```

## Configuration Guide

### 1. Base Configuration
| Field | Example | Purpose |
|-------|---------|---------|
| **Base URL** | `https://ghdataconnect.com/api` | Root API endpoint |
| **Auth Header Name** | `Authorization` or `X-API-Key` | Header that carries auth |
| **Auth Header Value** | `Bearer TOKEN123` or `dk_e87pONcP0e0NxTfZg` | Actual token/API key |

### 2. Endpoint Configuration
| Field | Example | Purpose |
|-------|---------|---------|
| **Order Endpoint** | `/v1/purchaseBundle` | Where to send orders |
| **Order Method** | `POST` | HTTP method |
| **Status Endpoint** | `/v1/checkOrderStatus/:reference` | Check order status |
| **Balance Endpoint** | `/v1/getWalletBalance` | Get account balance |

### 3. Request/Response Mapping

#### Request Payload Mapping
Maps your internal field names to the API's expected field names.

**Example for GHDataConnect:**
```json
{
  "network": "network",
  "phoneNumber": "msisdn",
  "capacity": "capacity",
  "reference": "reference"
}
```

This means:
- Your `network` field → API's `network` field
- Your `phoneNumber` field → API's `msisdn` field
- Your `capacity` field → API's `capacity` field
- Your `reference` field → API's `reference` field

#### Response Field Mapping
| Field | Example | Purpose |
|-------|---------|---------|
| **Success Field Path** | `success` or `data.success` | Where API indicates success |
| **Data Field Path** | `data` or `response.data` | Where API puts response data |

**Example for GHDataConnect Response:**
```json
{
  "success": true,
  "data": {
    "reference": "173232332595467876",
    "recipient": "0591178627",
    "capacity": 1,
    "price": 4.1,
    "balance": 199.26,
    "status": "pending"
  }
}
```
- Success Field Path: `success`
- Data Field Path: `data`

## API Integration Examples

### Example 1: GHDataConnect API

**Configuration:**
```
Base URL: https://ghdataconnect.com/api
Auth Type: Bearer Token
Auth Header Name: Authorization
Auth Header Value: Bearer YOUR_TOKEN_HERE
Order Endpoint: /v1/purchaseBundle
Order Method: POST
Status Endpoint: /v1/checkOrderStatus/:reference
Balance Endpoint: /v1/getWalletBalance
Success Field: success
Data Field: data

Request Mapping:
{
  "network": "network",
  "phoneNumber": "msisdn",
  "capacity": "capacity",
  "reference": "reference"
}
```

**Expected Request:**
```json
{
  "network": "mtn",
  "reference": "1732323325954267876",
  "msisdn": "0591234567",
  "capacity": 1
}
```

### Example 2: XpresPortal API

**Configuration:**
```
Base URL: https://www.xpresportal.app/api/v1
Auth Type: API Key
Auth Header Name: x-api-key
Auth Header Value: dk_e87pONcP0e0NxTfZg-gvEwwpVf025Czu
Order Endpoint: /order/place
Order Method: POST
Status Endpoint: /order/status/:reference
Balance Endpoint: /balance
Success Field: success
Data Field: data

Request Mapping:
{
  "network": "isp",
  "phoneNumber": "msisdn",
  "capacity": "volume",
  "reference": "reference"
}
```

## Package Mapping

Map your internal package sizes to the API's capacity values.

**Example:**
```json
[
  {
    "packageName": "1 GB",
    "apiCapacity": 1,
    "price": 4.1
  },
  {
    "packageName": "5 GB",
    "apiCapacity": 5,
    "price": 15.5
  },
  {
    "packageName": "10 GB",
    "apiCapacity": 1000,
    "price": 28.0
  }
]
```

When a customer buys "1 GB", the system sends `capacity: 1` to the API.
When they buy "10 GB", it sends `capacity: 1000` to the API.

## API Endpoints

### Save Provider Configuration
```
PUT /api/admin/provider-api-config/:providerName
Content-Type: application/json

{
  "apiConfig": {
    "enabled": true,
    "type": "bearer-token",
    "baseUrl": "https://api.provider.com",
    "authHeaderName": "Authorization",
    "authHeaderValue": "Bearer TOKEN",
    "orderEndpoint": "/v1/purchaseBundle",
    "orderMethod": "POST",
    "statusEndpoint": "/v1/checkOrderStatus/:reference",
    "balanceEndpoint": "/v1/getWalletBalance",
    "successField": "success",
    "dataField": "data",
    "requestPayloadMapping": {
      "network": "network",
      "phoneNumber": "msisdn",
      "capacity": "capacity",
      "reference": "reference"
    }
  },
  "packageMapping": [
    { "packageName": "1 GB", "apiCapacity": 1, "price": 4.1 }
  ]
}
```

### Process Order
```
POST /api/admin/process-order
Content-Type: application/json

{
  "providerName": "MTN",
  "phoneNumber": "0591234567",
  "packageName": "1 GB",
  "price": 4.1,
  "network": "mtn"
}
```

### Check Order Status
```
GET /api/admin/check-order-status/:providerName/:reference
```

### Get Provider Balance
```
GET /api/admin/provider-balance/:providerName
```

### Get API Logs
```
GET /api/admin/provider-api-logs/:providerName
```

## Security Best Practices

✅ **DO:**
- Store API keys in database (encrypted if possible)
- Use environment variables for admin access tokens
- Validate all input data before sending to API
- Log all API interactions for debugging
- Use HTTPS for all API calls
- Implement rate limiting (60 second delays between requests)
- Rotate API keys periodically

❌ **DON'T:**
- Expose API keys in client-side code
- Log sensitive data like full API responses
- Use hardcoded API keys in source code
- Skip input validation
- Make concurrent duplicate requests
- Store API keys in plain text

## Error Handling

The system automatically handles:
- **Connection Errors** - Retries with exponential backoff
- **Invalid Responses** - Logs and returns error
- **Rate Limiting** - Respects API rate limits
- **Timeout Handling** - Configurable timeouts
- **Status Tracking** - Updates order status in logs

Each API interaction is logged with:
- Request payload
- Response status
- Response data
- Error messages (if any)
- Timestamps
- Retry count

## Testing API Configuration

1. Go to Admin Panel → Provider API Config
2. Select a provider
3. Fill in all configuration details
4. Click "Save API Configuration"
5. Click "Test API Connection"
6. Check the returned balance to confirm it works

## Troubleshooting

### Connection Failed
- Verify Base URL is correct
- Check if API requires specific headers
- Verify Auth Header Name and Value
- Check if API is accessible from your server

### Wrong Data Format
- Review the API documentation
- Update Request Payload Mapping
- Check field names match exactly (case-sensitive)
- Test with different field mapping

### API Returns Error
- Check API Logs tab for detailed response
- Verify the exact error message
- Check if API credentials are valid
- Ensure rate limiting is not triggered

## Future Enhancements

- [ ] Webhook support for real-time order updates
- [ ] Bulk order processing
- [ ] Multi-signature support for complex APIs
- [ ] Custom transformation rules
- [ ] API response caching
- [ ] Automatic retry scheduler
- [ ] API health monitoring dashboard
