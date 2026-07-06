# Client Type Management Architecture

## Overview

This system manages how users can access and set prices for different client types (Super-agents, Agents, Customers, etc.). Here's how it all works together and what happens when you make changes.

---

## Current Setup

### Database Schema
```javascript
User.permittedClientTypes: [String] (default: [] - empty array)
```
- Stores which client types a user is allowed to set prices for
- Empty array = permissions not yet explicitly set (will use all available types)

---

## What Happens When...

### 1️⃣ **You Add a New Client Type** (Admin)
Example: Admin adds "Premium Agents"

**Backend Actions:**
- New entry created in `ClientType` collection
- New entry created in `BasePrice` collection (for the base price)

**User Impact:**
- **Existing users with empty `permittedClientTypes`:** ✅ Will see it automatically (they get all available types)
- **Existing users with explicit permissions set:** ❌ WON'T see it until admin adds it to their permissions
- **New users:** ✅ Will get all available types by default

**Example:**
```
Admin adds "Premium Agents" to ClientType
↓
User with no explicit permissions loads Referral Prices
↓
Frontend detects empty permittedClientTypes
↓
Fetches all client types from API
↓
Gets: [Super-agents, Agents, Customers, Premium Agents]
↓
User sees all 4 columns in their referral pricing page
```

---

### 2️⃣ **You Rename a Client Type** (Admin)
Example: Rename "Super-agents" → "VIP Agents"

**Backend Actions (Automatic Cascading):**
1. ✅ Update `ClientType` collection: "Super-agents" → "VIP Agents"
2. ✅ Update all `BasePrice` records: clientType "Super-agents" → "VIP Agents"
3. ✅ Update all `User` records: Remove "Super-agents" from permittedClientTypes, add "VIP Agents"

**User Impact:**
- All users who had permission for "Super-agents" now have "VIP Agents" ✅
- Base prices are correctly updated ✅
- Referral prices (user-specific) reference the new name ✅
- **Zero data loss** - everything is automatically synced

**Flow:**
```
Admin renames "Super-agents" → "VIP Agents"
↓
Server updates: ClientType, BasePrice, User.permittedClientTypes
↓
User logs in
↓
Sees "VIP Agents" column (automatically renamed from "Super-agents")
↓
Can set prices for "VIP Agents" as before
```

---

### 3️⃣ **You Delete a Client Type** (Admin)
Example: Delete "Sub-agents" because it's no longer used

**Backend Actions (Automatic Cascading):**
1. ✅ Delete all `BasePrice` records for "Sub-agents"
2. ✅ Remove "Sub-agents" from ALL users' permittedClientTypes
3. ✅ Delete `ClientType` entry for "Sub-agents"

**User Impact:**
- Users who had "Sub-agents" permission no longer have it ✅
- Their referral prices for "Sub-agents" are discarded (not restored elsewhere) ⚠️
- Column is completely hidden for all users ✅

**Flow:**
```
Admin deletes "Sub-agents"
↓
Server:
  • Deletes base prices for "Sub-agents"
  • Removes "Sub-agents" from User.permittedClientTypes (e.g., [Agents, Sub-agents, Customers] → [Agents, Customers])
  • Deletes ClientType entry
↓
User loads Referral Prices
↓
No "Sub-agents" column shown
↓
Previous prices they set for "Sub-agents" are gone
```

---

### 4️⃣ **Admin Explicitly Sets User Permissions** (Admin)
Example: Admin edits "John" user and checks only "Agents" and "Customers"

**Backend Actions:**
- Update `John.permittedClientTypes = ["Agents", "Customers"]`

**User Impact (John):**
- John logs in to Referral Prices
- Only sees: Package | Original Price | Agents | Customers columns
- Super-agents column is hidden
- Can only set prices for Agents and Customers

**Frontend:**
```
John loads Referral Prices
↓
loadUserData() fetches /api/me
↓
Gets: { role: "customer", permittedClientTypes: ["Agents", "Customers"] }
↓
applyColumnVisibility() hides all columns except those in permittedClientTypes
↓
John sees 4 columns (Package, Original Price, Agents, Customers)
```

---

### 5️⃣ **New User Joins** (Signup)

**What Happens:**
1. New user created with `permittedClientTypes = []` (empty, from schema default)
2. User logs in to Referral Prices
3. Frontend detects empty array
4. Fetches all available client types from server
5. Shows all columns

**Code Flow:**
```javascript
loadUserData() {
  const user = await /api/me  // { permittedClientTypes: [] }
  
  if (user.permittedClientTypes.length === 0) {
    const types = await /api/client-types  // Get all available
    permittedClientTypes = types  // e.g., [Super-agents, Agents, Customers]
  }
}
```

---

## Design Principles

### Why Empty Array Default?
- ✅ **Scalability**: New client types automatically available to new users
- ✅ **Safety**: Admin has explicit control over who gets new types
- ✅ **Flexibility**: Can grant access to all or specific types per user

### Why Cascade Updates?
When you rename/delete a type, updating users' arrays prevents:
- ❌ Orphaned permissions (still referencing deleted types)
- ❌ Broken base price links
- ❌ Inconsistent column visibility across users

### What About Saved Prices?
When you delete a client type:
- Base prices are deleted ✅ (can't reference deleted type)
- User's referral prices are deleted ❌ (they lose their custom prices)
- This is intentional - admin should warn users before deleting

**If you need to preserve prices:**
- Don't delete, just hide the type by removing it from all users
- Or create a new type with a different name

---

## API Endpoints

### User's Own Permissions
```
GET /api/me
→ Returns full user with permittedClientTypes

GET /api/my-permitted-types
→ Returns just { permittedClientTypes: [...] }
```

### Admin: Client Type Management
```
GET /api/client-types
→ Returns all available client types

POST /api/admin/client-types
→ Add new client type

PUT /api/admin/client-types/:oldName
→ Rename client type (cascades to BasePrice and Users)

DELETE /api/admin/client-types/:name
→ Delete client type (cascades to BasePrice and Users)
```

### Admin: User Permission Management
```
GET /api/admin/users/:id/permitted-types
→ Get user's permissions

PUT /api/admin/users/:id/permitted-types
→ Set user's permissions

PUT /api/admin/users/:id
→ Update user (can include permittedClientTypes)
```

---

## Testing Scenarios

### Test 1: Add New Type to Existing System
1. Go to Admin → Base Prices
2. Click "Add New Client Type"
3. Create "VIP Premium"
4. Add some base prices
5. **Test as new user:** Should see it automatically
6. **Test as existing user with explicit permissions:** Should NOT see it (as expected)

### Test 2: Rename Type
1. Go to Admin → Base Prices
2. Click edit icon on "Super-agents"
3. Rename to "Premium Agents"
4. Check console for: `Updated X base price records and Y user permissions`
5. Test as user: Should see "Premium Agents" column instead of "Super-agents"

### Test 3: Delete Type
1. Go to Admin → Base Prices
2. Click delete icon on a client type
3. Confirm deletion
4. Check console for: `Deleted X base price records and removed from Y user permissions`
5. Test as user: Column should be completely hidden

### Test 4: User with No Explicit Permissions
1. Create new user (or clear permittedClientTypes)
2. Log in as that user
3. Go to Referral Prices
4. Should see ALL available client types automatically
5. Check console: Should see logs like "Using all available client types"

---

## Summary Table

| Scenario | New Users | Existing Users (Empty Perms) | Existing Users (Set Perms) |
|----------|-----------|------------------------------|---------------------------|
| Add new type | See it ✅ | See it ✅ | Don't see it ❌ (until admin adds) |
| Rename type | Auto-updated ✅ | Auto-updated ✅ | Auto-updated ✅ |
| Delete type | N/A | Removed from list ✅ | Removed from list ✅ |
| Change user perms | N/A | N/A | See/hide columns immediately ✅ |

