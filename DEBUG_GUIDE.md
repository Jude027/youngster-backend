# Debugging Guide - Columns & Base Prices

## What Was Fixed

1. **Client Type Mismatch** - Updated defaults from `[Top-dealers, Dealers, Super-agents, Agents, Sub-agents, Customers]` to match HTML: `[Super-agents, Agents, Customers]`

2. **Table Structure** - Changed from looking for `#ordersTable` ID to finding all `table.pricing-table` elements

3. **User Permissions** - Added `permittedClientTypes` to User schema and ensured `/api/me` returns it

4. **Initialization Order** - Ensured columns are hidden BEFORE loading and applying base prices

## How to Test

### Step 1: Check Browser Console
1. Go to Referral Prices page
2. Open Developer Tools (F12)
3. Go to Console tab
4. Look for logs like:
   ```
   === Starting page initialization ===
   1. Loading user data...
   User data from API: { ... permittedClientTypes: [...] }
   Final permittedClientTypes: [...]
   
   2. Loading base prices...
   Base prices loaded: 15
   
   5. Applying column visibility...
   Found 4 pricing tables
   Table 0 has 5 headers
   Column 2: "Super-agents"
     → Showing column 2 (Super-agents)
   ...
   
   8. Applying base prices...
   Applying base prices for visible client types: [...]
   ```

### Step 2: Verify Column Hiding
- Check if columns NOT in your permissions are hidden
- If a user has `permittedClientTypes: ['Agents', 'Customers']`, they should only see:
  - Package column
  - Original Price column
  - Agents price column
  - Customers price column
- The Super-agents column should be completely hidden

### Step 3: Verify Base Prices
- Check if "Original Price" shows GHS values
- If a client type (e.g., Agents) has a base price of 7.00 GHS in admin panel:
  - The input field should have `data-original="7.00"`
  - User can only set prices HIGHER than 7.00

### Step 4: Set Up Test Data
1. **As Admin:**
   - Go to Base Prices tab
   - Add a package: MTN 1GB with prices:
     - Super-agents: 7.00
     - Agents: 8.00
     - Customers: 9.00
   - Go to Users tab
   - Edit a user
   - Check "Agents" and "Customers" (uncheck "Super-agents")
   - Save

2. **As That User:**
   - Go to Referral Prices
   - Should see 4 columns: Package, Original Price, Agents, Customers
   - Super-agents column should be hidden
   - MTN 1GB should show:
     - Original Price: GHS 0.00 (if role is not matching any base price)
     - Agents input: data-original="8.00"
     - Customers input: data-original="9.00"

## Expected Console Output for Each Function

### loadUserData()
```
User data from API: {
  _id: "...",
  username: "testuser",
  role: "customer",
  permittedClientTypes: ["Agents", "Customers"],
  ...
}
User role: customer
User permittedClientTypes: ["Agents", "Customers"]
Set currentClientType to: customer
Using user permittedClientTypes: ["Agents", "Customers"]
Final permittedClientTypes: ["Agents", "Customers"]
```

### applyColumnVisibility()
```
Applying column visibility. Permitted types: ["Agents", "Customers"]
Found 4 pricing tables
Table 0 has 5 headers
Column 0: "Package"
  → Showing column 0 (Package)
Column 1: "Original Price"
  → Showing column 1 (Original Price)
Column 2: "Super-agents"
  → Hiding column 2 (Super-agents)
Column 3: "Agents"
  → Showing column 3 (Agents)
Column 4: "Customers"
  → Showing column 4 (Customers)
```

### applyBasePrices()
```
Applying base prices for visible client types: ["Agents", "Customers"]
Applying base prices to table 0: MTN Packages
Found base price for 1GB (Agents): 8
Found base price for 1GB (Customers): 9
...
Base prices applied to all tables
```

## Common Issues

### Issue: No columns hidden
- Check: Are `permittedClientTypes` being loaded?
- Fix: Make sure admin set user permissions in Users tab
- Fix: Verify API returns permittedClientTypes in `/api/me`

### Issue: All columns visible but base prices not showing
- Check: Are base prices configured in admin panel?
- Check: Is the current user's role matching any base price entry?
- Fix: Set base prices for all client types that users have permissions for

### Issue: Original Price shows 0.00
- This is correct if the user's role doesn't match any base price
- User's role only affects the "Original Price" display
- Actual field constraints use the visible columns' base prices

### Issue: Columns hidden but price inputs show GHS 0.00
- Check console: Is `applyBasePrices()` finding the prices?
- Fix: Verify base prices are in database for ALL visible client types
- Fix: Check the provider and package names match EXACTLY

## Testing Checklist

- [ ] Console shows initialization logs
- [ ] User role is loaded correctly  
- [ ] permittedClientTypes is loaded correctly
- [ ] Correct columns are visible
- [ ] Unwanted columns are hidden (CSS display: none)
- [ ] Original Price shows correct values
- [ ] Price inputs have correct data-original attributes
- [ ] Can't set prices lower than original
- [ ] Prices save correctly
- [ ] Prices load correctly on page reload
