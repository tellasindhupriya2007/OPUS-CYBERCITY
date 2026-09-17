# Production Deployment Checklist

This checklist ensures all security protections are properly configured before deploying to production.

---

## Pre-Deployment Steps

### 1. Verify All Environment Variables

**Zoho CRM Variables (already set):**
- ✅ `ZOHO_CLIENT_ID` - Your Zoho OAuth client ID
- ✅ `ZOHO_CLIENT_SECRET` - Your Zoho OAuth client secret
- ✅ `ZOHO_REFRESH_TOKEN` - Your Zoho refresh token
- ✅ `ZOHO_API_DOMAIN` - Zoho API domain (https://www.zohoapis.in for India)

**reCAPTCHA Variables (NEW - need to add):**

#### Step 1: Get reCAPTCHA Keys from Google

1. Go to https://www.google.com/recaptcha/admin/
2. Sign in with your Google account
3. Click "Create" or "+" button to create a new site
4. Fill in:
   - **Label:** `Cybercity Opus`
   - **reCAPTCHA type:** Select **reCAPTCHA v3**
   - **Domains:** Add both:
     - `opuscybercity-beige.vercel.app`
     - `localhost` (for local testing)
5. Accept terms and click "Create"
6. You'll see:
   - **Site Key** (public - safe in frontend)
   - **Secret Key** (private - keep secret!)

#### Step 2: Add to Vercel Environment Variables

1. Go to https://vercel.com/dashboard
2. Select **opuscybercity** project
3. Go to **Settings** → **Environment Variables**
4. Add two new variables:

   | Name | Value | Type |
   |------|-------|------|
   | `RECAPTCHA_SITE_KEY` | (Your Site Key from Google) | Production |
   | `RECAPTCHA_SECRET_KEY` | (Your Secret Key from Google) | Production |

5. **Important:** Mark `RECAPTCHA_SECRET_KEY` as **Sensitive** (Vercel will encrypt it)

---

### 2. Verify reCAPTCHA Domain Configuration

**In Google reCAPTCHA Console:**
1. Select your site (Cybercity Opus)
2. Go to **Settings** tab
3. Under "Domains," verify:
   - ✅ `opuscybercity-beige.vercel.app` is listed
   - ✅ `localhost` is listed (for local testing)

**Important:** reCAPTCHA will NOT work if the domain requesting tokens is not registered. The script will silently fail on unregistered domains.

---

### 3. Verify Code Changes

**Check all files are committed:**
- ✅ `/api/enquiry.js` - Backend with retry, rate limiting, reCAPTCHA verification
- ✅ `/brochure.js` - Frontend reCAPTCHA token generation
- ✅ `/index.html` - reCAPTCHA script tag
- ✅ `/thank-you.html` - reCAPTCHA script tag
- ✅ `/.env.example` - Updated documentation
- ✅ `/SECURITY_TESTING_GUIDE.md` - Testing documentation
- ✅ `/DEPLOYMENT_CHECKLIST.md` - This checklist

---

### 4. Test Locally (Optional but Recommended)

**If you have local `.env` file with all credentials:**

```bash
# Install dependencies (if not already done)
npm install

# Build CSS
npm run build

# Start local server (for static HTML preview)
npx http-server .
```

**Then test the form:**
1. Open `http://localhost:8080/`
2. Fill and submit the enquiry form
3. Should see redirect to `/thank-you`
4. Check Zoho CRM for new lead

---

## Deployment Steps

### Step 1: Commit Changes

```bash
cd /Users/tellasindhu6307/CYBER-CITY/OPUS-CYBERCITY

# Add all modified files
git add .

# Commit with descriptive message
git commit -m "feat: Add production security protections - retry logic, rate limiting, reCAPTCHA v3"
```

**Commit will include:**
- Retry logic with exponential backoff
- IP-based rate limiting (5 submissions/hour)
- Server-side reCAPTCHA v3 verification
- Frontend reCAPTCHA token generation
- Updated documentation

### Step 2: Push to GitHub

```bash
git push origin main
```

**Expected output:**
```
Enumerating objects: X, done.
Counting objects: 100% (X/X), done.
...
To https://github.com/tellasindhupriya2007/OPUS-CYBERCITY
   [old_hash]..[new_hash]  main -> main
```

### Step 3: Monitor Vercel Deployment

**Vercel automatically deploys on push:**

1. Go to https://vercel.com/dashboard
2. Select **opuscybercity** project
3. Watch **Deployments** tab
4. Wait for status to show ✅ **Ready**

**Deployment typically takes 1-2 minutes:**
- Build phase: Runs `npm run build`
- Output phase: Verifies build artifacts
- Ready: Site is live

**If build fails:**
- Click on the failed deployment
- Go to **Logs** tab
- Check error message
- Common issues:
  - Missing environment variables
  - Syntax error in code
  - Missing dependencies

---

## Post-Deployment Verification

### ✅ Step 1: Verify Site is Live

```bash
curl -I https://opuscybercity-beige.vercel.app/
```

**Expected response:**
```
HTTP/2 200
Content-Type: text/html
Cache-Control: public, max-age=0, must-revalidate
```

### ✅ Step 2: Test Form Submission

**In browser:**
1. Navigate to https://opuscybercity-beige.vercel.app/
2. Fill the enquiry form with:
   - Full Name: `Test User`
   - Phone: `9876543210`
   - Email: `test@example.com`
   - Source: `Manual Testing`
3. Click "Request Purchase Details"
4. Should see "SUBMITTING..." then redirect to `/thank-you`

**Expected result:**
- ✅ Lead appears in Zoho CRM within 10 seconds
- ✅ User redirected to thank you page
- ✅ No error messages

### ✅ Step 3: Verify reCAPTCHA Loaded

**In browser DevTools:**
1. Open https://opuscybercity-beige.vercel.app/
2. Go to Console tab
3. Run: `window.grecaptcha`
4. Should return an object (not `undefined`)

**If undefined:**
- Check that `RECAPTCHA_SITE_KEY` is set in Vercel
- Verify domain is registered in Google reCAPTCHA console
- Check for JavaScript errors in console

### ✅ Step 4: Check Vercel Function Logs

**In Vercel Dashboard:**
1. Go to **Deployments** → Latest deployment
2. Click on **Functions** tab
3. Select `/api/enquiry`
4. Check **Logs** for recent submissions

**Expected logs on successful submission:**
```
[CAPTCHA_VERIFIED] Score: 0.92, Action: enquiry_submission
[ENQUIRY] New lead created - Name: Test User, Email: test@example.com, Phone: 9876543210, IP: xxx.xxx.xxx.xxx
```

**If logs show errors:**
- `Missing required Zoho CRM credentials` → Check env vars in Vercel
- `Failed to get Zoho access token` → Check Zoho credentials are correct
- `reCAPTCHA verification failed` → Check RECAPTCHA_SECRET_KEY is set
- `Too many submissions` → Rate limit working as intended

### ✅ Step 5: Test Rate Limiting

**Using curl (5 submissions):**
```bash
for i in {1..5}; do
  echo "Submission $i..."
  curl -X POST https://opuscybercity-beige.vercel.app/api/enquiry \
    -H "Content-Type: application/json" \
    -d "{
      \"fullName\": \"Rate Limit Test\",
      \"phone\": \"9876543210\",
      \"email\": \"ratelimit.test$i@example.com\",
      \"source\": \"Testing\",
      \"recaptchaToken\": \"\"
    }" -s | grep -o '"success":[^,]*'
  sleep 1
done
```

**Expected output:**
```
"success":true
"success":true
"success":true
"success":true
"success":true
```

**Then 6th submission (off-limit):**
```bash
curl -X POST https://opuscybercity-beige.vercel.app/api/enquiry \
  -H "Content-Type: application/json" \
  -d '{
    "fullName":"Test","phone":"9876543210","email":"ratelimit.test6@example.com","source":"","recaptchaToken":""
  }' -s | grep -o '"success":[^,]*'
```

**Expected:** `"success":false` with HTTP 429

### ✅ Step 6: Test Duplicate Detection

**Submit same email+phone twice within 30 seconds:**
```bash
# First submission
curl -X POST https://opuscybercity-beige.vercel.app/api/enquiry \
  -H "Content-Type: application/json" \
  -d '{"fullName":"Duplicate Test","phone":"9999999999","email":"dup@test.com","source":"","recaptchaToken":""}' -s

# Second submission immediately after
sleep 1
curl -X POST https://opuscybercity-beige.vercel.app/api/enquiry \
  -H "Content-Type: application/json" \
  -d '{"fullName":"Duplicate Test","phone":"9999999999","email":"dup@test.com","source":"","recaptchaToken":""}' -s
```

**Expected:** Both return `"success":true` but only ONE lead in Zoho CRM

**Verify in Vercel logs:**
```
[ENQUIRY] New lead created - Name: Duplicate Test, Email: dup@test.com, Phone: 9999999999
[DUPLICATE] Duplicate submission detected: dup@test.com, 9999999999
```

---

## Rollback Plan (If Issues Arise)

**If deployment has critical issues:**

### Quick Rollback to Previous Version

```bash
# Go to Vercel Dashboard
# Deployments tab
# Find the previous successful deployment
# Click the "..." menu
# Select "Promote to Production"
```

**This reverts to the last working version instantly.**

---

## Monitoring Post-Deployment

### Daily Checks

**First 24 hours after deployment:**

1. **Check Error Rate**
   - Vercel Dashboard → Analytics
   - Error rate should be < 1%

2. **Check Function Duration**
   - Vercel Dashboard → Functions → `/api/enquiry`
   - Duration should be 1-3 seconds (not hitting 10s timeout)

3. **Check Logs for Patterns**
   - Look for `[ENQUIRY]` - successful submissions ✅
   - Look for `[RATE_LIMIT]` - expected on high volume ⚠️
   - Look for `[CAPTCHA_BLOCKED]` - should be rare ⚠️
   - Look for `[RETRY]` - should be rare (only on network issues) ⚠️

4. **Check Zoho CRM**
   - New leads appearing correctly
   - All form fields populated
   - No duplicate leads from same email+phone

### Weekly Checks

1. **Review metrics in Vercel Analytics**
2. **Check for error spikes**
3. **Monitor rate limit logs** - adjust if needed for legitimate traffic
4. **Verify reCAPTCHA scores** - adjust threshold if too many false positives

---

## Configuration Tuning (If Needed)

### If Rate Limit is Too Strict

**Currently set to:** 5 submissions/hour per IP

**To increase:**
1. Edit `/api/enquiry.js`
2. Find: `const RATE_LIMIT_MAX_SUBMISSIONS = 5;`
3. Change to: `const RATE_LIMIT_MAX_SUBMISSIONS = 10;` (example)
4. Commit, push, redeploy

### If reCAPTCHA is Blocking Too Many Humans

**Currently set to:** Score threshold of 0.5 (blocks scores < 0.5)

**To lower threshold (allow more submissions):**
1. Edit `/api/enquiry.js`
2. Find: `const SCORE_THRESHOLD = 0.5;`
3. Change to: `const SCORE_THRESHOLD = 0.3;` (more lenient)
4. Commit, push, redeploy

**Note:** Lower scores = more spam allowed. Balance is key.

### If Duplicate Window is Too Short/Long

**Currently set to:** 30 seconds

**To adjust:**
1. Edit `/api/enquiry.js`
2. Find: `const DUPLICATE_WINDOW_MS = 30 * 1000;`
3. Change to desired value (in milliseconds)
4. Commit, push, redeploy

---

## Troubleshooting Common Issues

### Form shows "Failed to submit enquiry"

**Check in order:**
1. ✅ reCAPTCHA Site Key is correct in `index.html`
2. ✅ Domain registered in Google reCAPTCHA console
3. ✅ All 6 environment variables set in Vercel
4. ✅ Vercel build succeeded (no errors)
5. ✅ Network connectivity working

### Only 1-2 submissions succeed, then "Too many submissions"

**Likely cause:** Rate limit hit

**Verify:**
- Use curl with different IPs or wait 1 hour
- Check Vercel logs for `[RATE_LIMIT]` messages

### Leads not appearing in Zoho CRM

**Check in order:**
1. ✅ Zoho credentials are correct
2. ✅ Zoho access token has correct scopes
3. ✅ Check Vercel logs for `[ENQUIRY]` messages
4. ✅ Check Vercel logs for errors: "Failed to get Zoho access token"
5. ✅ Verify API domain is correct (India vs US vs EU)

### reCAPTCHA script not loading

**Check:**
1. ✅ Domain is registered in Google reCAPTCHA console
2. ✅ `RECAPTCHA_SITE_KEY` is set in Vercel
3. ✅ Browser console shows no errors (F12)
4. ✅ No Content Security Policy (CSP) blocking Google scripts

---

## Success Criteria

**Deployment is successful when:**

- ✅ Form submits successfully from live site
- ✅ Lead appears in Zoho CRM within 10 seconds
- ✅ Vercel logs show `[ENQUIRY]` and `[CAPTCHA_VERIFIED]` messages
- ✅ Rate limit works (429 after 5 submissions)
- ✅ Duplicate detection works (only 1 lead from 2 submissions)
- ✅ reCAPTCHA script loads (no console errors)
- ✅ Error rate < 1% in Vercel Analytics
- ✅ No user-facing errors after 24 hours

---

## Support

For detailed testing and troubleshooting: See `SECURITY_TESTING_GUIDE.md`

