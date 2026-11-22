# ZoRun Firestore Security Specification (Phase 0 TDD)

## 1. Data Invariants
1. **Default-Deny Safety Net**: Every unmatched path is denied (`allow read, write: if false;`).
2. **PII Split Collection Isolation**: Sensitive fields (`email`, `phone`, `defaultVeng`) live strictly in `/users/{userId}/private/{docId}`, readable/writable ONLY by `isOwner(userId)` or `isAdmin()`. Public profile docs in `/users/{userId}/public/{docId}` never expose PII.
3. **Prevent Self-Assigned Privilege Escalation**: On creating `/users/{userId}/public/profile`, non-admin users MUST have `role == 'CUSTOMER'`. Non-admins cannot mutate `role` on update or write to `/admins/{adminUid}`.
4. **Bootstrapped Super Admin Verification**: Bootstrapped admin access for `srodingliani@gmail.com` explicitly requires `request.auth.token.email == 'srodingliani@gmail.com' && request.auth.token.email_verified == true`.
5. **District-Scoped Real-Time Integrity**:
   - Runner GPS telemetry (`/districts/{district}/runners/{partnerId}`) requires `ownerUid == request.auth.uid || isAdmin()`, strict Mizoram coordinate bounds (`lat >= 21 && lat <= 25`, `lng >= 91 && lng <= 94`), and `district` path matching `data.district`.
   - Live Orders (`/districts/{district}/orders/{orderId}`) enforce `customerUid == request.auth.uid` on creation, initial `status == 'bidding'`, server timestamp checks (`createdAt == request.time`, `updatedAt == request.time`), and **Terminal State Locking** once `status` becomes `'completed'` or `'cancelled'`.
   - 24x7 SOS Alerts (`/districts/{district}/sos/{ticketId}`) enforce `customerUid == request.auth.uid` on creation, initial `status == 'flashing_dispatch'`, and **Terminal State Locking** once `status == 'resolved'`.
6. **Zero Shadow Keys & Path Variable Hardening**: Every single-doc operation validates `isValidId()` (`^[a-zA-Z0-9_\\-]+$`, length `<= 128`), enforces `.keys().hasAll(...)` + `.keys().hasOnly(...)` on `create`, and enforces `diff().affectedKeys().hasOnly(...)` on action-based `update`.

## 2. "Dirty Dozen" Adversarial Payloads (Must All Return PERMISSION_DENIED)
1. **Self-Role Escalation on Registration**: User `uid-1` creates `/users/uid-1/public/profile` with `{ role: 'SUPER_ADMIN', ... }`.
2. **Role Escalation on Profile Update**: Existing `uid-1` updates `/users/uid-1/public/profile` changing `role` from `'CUSTOMER'` to `'RUNNER'` or `'SUPER_ADMIN'`.
3. **Shadow Field Injection ("Ghost Field")**: User `uid-1` creates `/districts/Aizawl/orders/err-99` adding `{ isVerifiedByAdmin: true }`.
4. **Unverified Admin Email Spoof**: Token with `email: 'srodingliani@gmail.com'` and `email_verified: false` tries to read `/admins/any` or write `/districts/Aizawl/sos/sos-1`.
5. **Cross-Owner PII Read**: Authenticated `uid-2` attempts `get` or `list` on `/users/uid-1/private/info`.
6. **Admin Registry Poisoning**: Non-admin `uid-2` attempts to create `/admins/uid-2` with `{ uid: 'uid-2', role: 'SUPER_ADMIN' }`.
7. **Terminal Order Mutation**: Customer `uid-1` attempts to update `/districts/Aizawl/orders/err-1` when `existing().status == 'completed'`.
8. **Terminal SOS Mutation**: Non-admin user attempts to reopen `/districts/Aizawl/sos/sos-1` after `existing().status == 'resolved'`.
9. **Identity Spoofing on Order Create**: User `uid-1` creates `/districts/Aizawl/orders/err-2` with `customerUid: 'uid-victim'`.
10. **District Path Mismatch**: User `uid-1` writes `/districts/Aizawl/runners/ptr-1` with `data.district: 'Lunglei'`.
11. **ID Poisoning / DoW String Attack**: Attacker sends a 1,500-character document ID or 50KB `title` string on order creation.
12. **Client Timestamp Forgery / Blanket Query Scraping**: Client submits `createdAt: '2020-01-01'` instead of `request.time`, or queries `/districts/Aizawl/orders` where `customerUid` belongs to another customer while `status != 'bidding'`.
