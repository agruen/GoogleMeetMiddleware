# Plan: Non-Admin Workspace Support

## Executive Summary

**Good news**: The current implementation already works for non-admin users! It uses:
- Standard OAuth 2.0 (user-delegated, not service account)
- Only `meetings.space.created` scope (available to all Workspace users)
- No Admin SDK or Directory API
- App-level domain restriction (not Google-enforced)

The main barrier is **creating the Google Cloud OAuth credentials**, which currently requires some Cloud Console access. This plan outlines changes to support fully self-service non-admin deployment.

---

## Current State Analysis

### What Works Today for Non-Admins
- ✅ OAuth authentication flow
- ✅ Meeting creation via Google Meet API
- ✅ All app functionality (waiting room, SSE, etc.)

### What Requires Admin/Cloud Access Today
- ❌ Creating Google Cloud Project
- ❌ Setting up OAuth Client ID/Secret
- ❌ Configuring OAuth Consent Screen
- ❌ Enabling Google Meet API

---

## Proposed Changes

### Phase 1: Support Personal Google Accounts (No Workspace Required)

**Goal**: Allow anyone with a personal Gmail to use the app.

#### 1.1 Make ALLOWED_DOMAIN Optional
**File**: `src/middleware/auth.ts` and `src/routes/auth.ts`

**Changes**:
- Make `ALLOWED_DOMAIN` environment variable optional
- When not set (or set to `*`), allow any authenticated Google user
- Add new env var `ALLOW_ANY_DOMAIN=true` as explicit opt-in

**Code changes needed**:
```typescript
// src/utils/env.ts - Add new optional config
ALLOW_ANY_DOMAIN: process.env.ALLOW_ANY_DOMAIN === 'true',

// src/middleware/auth.ts - Update domain check
if (!env.ALLOW_ANY_DOMAIN && env.ALLOWED_DOMAIN) {
  // existing domain validation
} else {
  // skip domain check, allow any authenticated user
}
```

#### 1.2 Update Documentation for Personal Account Setup
**File**: `docs/google-cloud-setup.md`

**Add new section**:
- Instructions for personal Google Cloud Console setup (free tier)
- How to create OAuth consent screen in "External" mode
- Note about "Testing" mode limitations (100 user limit until verified)
- Steps to add yourself as a test user

#### 1.3 Add Single-User Mode
**File**: `src/routes/auth.ts`, new `src/middleware/single-user.ts`

**Changes**:
- Add `SINGLE_USER_MODE=true` environment variable
- When enabled, the first authenticated user becomes the only allowed user
- Simplifies setup for personal use (no domain config needed)
- Store allowed user email in database after first login

---

### Phase 2: Improve Self-Service Documentation

#### 2.1 Create "Personal Use" Quick Start Guide
**New file**: `docs/personal-setup.md`

**Content**:
1. Create Google Cloud Project (free, 5 min)
2. Enable Google Meet API
3. Create OAuth credentials
4. Set consent screen to "External" + "Testing"
5. Add your email as test user
6. Configure app with credentials
7. Deploy locally or to free hosting (Railway, Render, etc.)

#### 2.2 Update README with Non-Admin Paths
**File**: `README.md`

**Add section**: "Deployment Options"
- **Enterprise**: Admin creates shared OAuth credentials
- **Personal/Small Team**: Self-service with personal GCP project
- **Development**: Testing mode with 100 user limit

#### 2.3 Add Environment Variable Documentation
**File**: `.env.example`

**Add**:
```ini
# Domain Restriction (optional)
# Set to your company domain to restrict access, or leave empty/set ALLOW_ANY_DOMAIN=true
ALLOWED_DOMAIN=
ALLOW_ANY_DOMAIN=false

# Single User Mode (optional)
# When true, only the first authenticated user can use the app
SINGLE_USER_MODE=false
```

---

### Phase 3: Reduce Google Cloud Complexity (Optional)

#### 3.1 Pre-configured OAuth for Development
**Consideration**: Could provide a "demo mode" OAuth client for local testing only.

**Decision**: Skip - security risk, users should create their own credentials.

#### 3.2 Alternative: Support Other OAuth Providers
**Consideration**: Allow Microsoft 365 / Teams as alternative to Google.

**Decision**: Out of scope for this plan (major feature, different API entirely).

---

## Implementation Order

### Must Have (Phase 1 Core)
1. [ ] Make `ALLOWED_DOMAIN` optional in auth middleware
2. [ ] Add `ALLOW_ANY_DOMAIN` environment variable
3. [ ] Update domain validation logic
4. [ ] Test with personal Gmail account

### Should Have (Phase 1 Complete + Phase 2)
5. [ ] Add `SINGLE_USER_MODE` for simplest personal setup
6. [ ] Create `docs/personal-setup.md` guide
7. [ ] Update README with deployment options
8. [ ] Update `.env.example` with new variables

### Nice to Have (Polish)
9. [ ] Add setup wizard step for choosing mode (enterprise vs personal)
10. [ ] Improve error messages for OAuth issues
11. [ ] Add health check for OAuth configuration

---

## File Changes Summary

| File | Change Type | Description |
|------|-------------|-------------|
| `src/utils/env.ts` | Modify | Add ALLOW_ANY_DOMAIN, SINGLE_USER_MODE |
| `src/middleware/auth.ts` | Modify | Make domain check conditional |
| `src/routes/auth.ts` | Modify | Support single-user mode |
| `.env.example` | Modify | Document new optional variables |
| `README.md` | Modify | Add deployment options section |
| `docs/personal-setup.md` | Create | New guide for personal account setup |
| `docs/google-cloud-setup.md` | Modify | Add "External" consent screen instructions |

---

## Testing Plan

1. **Personal Gmail Test**
   - Create test GCP project with personal account
   - Set consent screen to External/Testing
   - Deploy app with `ALLOW_ANY_DOMAIN=true`
   - Verify OAuth flow works
   - Verify meeting creation works

2. **Single User Mode Test**
   - Enable `SINGLE_USER_MODE=true`
   - First login succeeds
   - Second different user login rejected
   - Original user can still log in

3. **Backward Compatibility Test**
   - Existing `ALLOWED_DOMAIN` config still works
   - No breaking changes for current deployments

---

## Security Considerations

1. **ALLOW_ANY_DOMAIN=true** should display a warning in logs at startup
2. **SINGLE_USER_MODE** should be clearly documented as "personal use only"
3. OAuth consent screen in "Testing" mode limits to 100 users (Google restriction)
4. All existing security features (CSRF, rate limiting, etc.) remain unchanged

---

## Effort Estimate

- **Phase 1 Core**: ~2-3 hours of code changes
- **Phase 2 Documentation**: ~1-2 hours
- **Testing**: ~1 hour

**Total**: 4-6 hours for a fully working non-admin solution

---

## Questions for Clarification

Before implementation, please confirm:

1. **Single-user mode priority**: Is supporting a single personal user important, or is team/multi-user the main use case?

2. **Documentation scope**: Should the personal setup guide include deployment to free hosts (Railway, Render, Fly.io)?

3. **Backward compatibility**: Any concern about changing the default behavior of ALLOWED_DOMAIN?
