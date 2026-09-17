# Security Protections Testing Guide

This guide explains how to test the three production security protections implemented for the Cybercity Opus enquiry form:

1. **Retry Logic & Duplicate Prevention**
2. **Rate Limiting**
3. **reCAPTCHA v3 Verification**

---

## Prerequisites

Before testing, ensure:

- ✅ All environment variables are set in Vercel (or `.env` locally):
  - `ZOHO_CLIENT_ID`, `ZOHO_CLIENT_SECRET`, `ZOHO_REFRESH_TOKEN`, `ZOHO_API_DOMAIN`
  - `RECAPTCHA_SITE_KEY`, `RECAPTCHA_SECRET_KEY`
- ✅ You have access to Vercel function logs: https://vercel.com/dashboard → Project → Deployments → Functions
- ✅ You have `curl` installed (or use Postman/Insomnia for testing)
- ✅ Live site deployed: https://opuscybercity-beige.vercel.app/

---

## 1. Testing Retry Logic & Duplicate Prevention

### What it does:
- Retries failed Zoho API calls up to 3 times with exponential backoff (1s, 2s, 4s)
- Detects duplicate submissions (same email + phone within 30 seconds)
- Ensures genuine submissions are never silently lost

### Test 1.1: Verify Successful Submission Creates Lead

**Steps:**
1. Fill the form on https://opuscybercity-beige.vercel.app/ with:
   - Full Name: `John Doe`
   - Phone: `9876543210`
   - Email: `john.doe.test@example.com`
   - Source: `Social Media`

2. Submit the form
3. You should be redirected to `/thank-you`

**Verification:**
- ✅ Lead appears in Zoho CRM within 10 seconds
- ✅ Console shows no errors
- ✅ Vercel logs show `[ENQUIRY] New lead created`

---

### Test 1.2: Duplicate Detection (30-second window)

**Steps:**
1. Submit the same form immediately (same email + phone)
2. Try submitting again within 30 seconds

**Expected Behavior:**
- ✅ First submission succeeds → redirects to thank-you
- ✅ Second submission returns success but **logs show `[DUPLICATE] Duplicate submission detected`**
- ✅ Only ONE lead is created in Zoho CRM (not two)

**Why it's done this way:**
- Returns HTTP 200 success to avoid exposing the dedup window to attackers
- Prevents attackers from learning the detection mechanism

**Check Vercel logs:**
```
[ENQUIRY] New lead created - Name: John Doe, Email: john.doe.test@example.com, Phone: 9876543210
[DUPLICATE] Duplicate submission detected: john.doe.test@example.com, 9876543210
```

---

### Test 1.3: Verify Retry Logic (simulate transient failure)

This test requires simulator access to Zoho API or temporary network interruption.

**Advanced Manual Test:**
1. Open browser DevTools → Network tab
2. Add Network throttling: `DevTools → ⋮ → Settings → Throttling → Slow 4G`
3. Submit form with throttled connection
4. Check Vercel logs for `[RETRY]` messages

**Expected in Logs:**
```
[RETRY] Attempt 1/4 failed. Retrying in 1000ms. Error: ...
[RETRY] Attempt 2/4 failed. Retrying in 2000ms. Error: ...
[ENQUIRY] New lead created (succeeds on retry)
```

**Note:** Genuine retries only happen on transient errors (429, 503, timeout). Permanent errors (400 bad request, 401 auth failure) don't retry.

---

## 2. Testing Rate Limiting

### What it does:
- Limits submissions to 5 per hour per IP address
- Returns HTTP 429 (Too Many Requests) when exceeded
- Automatically resets after 1 hour

### Test 2.1: Verify Rate Limit Headers

**Using curl (test one submission):**
```bash
curl -X POST https://opuscybercity-beige.vercel.app/api/enquiry \
  -H "Content-Type: application/json" \
  -d '{
    "fullName": "Test User",
    "phone": "9876543210",
    "email": "test.ratelimit@example.com",
    "source": "Testing",
    "recaptchaToken": ""
  }' -v
```

**Look for these response headers:**
```
X-RateLimit-Limit: 5
X-RateLimit-Remaining: 4
X-RateLimit-Reset: 1726666800  (Unix timestamp when limit resets)
```

---

### Test 2.2: Trigger Rate Limit (5 submissions)

**Script to hit rate limit (submit 6 times):**
```bash
#!/bin/bash

BASE_URL="https://opuscybercity-beige.vercel.app/api/enquiry"

for i in {1..6}; do
  echo "Submission $i..."
  
  curl -X POST $BASE_URL \
    -H "Content-Type: application/json" \
    -d "{
      \"fullName\": \"Rate Limit Test $i\",
      \"phone\": \"9876543210\",
      \"email\": \"rate.test.$i@example.com\",
      \"source\": \"Test\",
      \"recaptchaToken\": \"\"
    }" \
    -w "\nStatus: %{http_code}\n" \
    -s | grep -E "success|Too many|Status"
  
  sleep 1
done
```

**Expected output:**
```
Submission 1...
"success": true
Status: 200

Submission 2...
"success": true
Status: 200

... (submissions 3-5 succeed)

Submission 6...
"success": false,
"message": "Too many submissions. Please try again later.",
"retryAfter": 3599
Status: 429
```

---

### Test 2.3: Verify Rate Limit Per IP

**From different network (mobile hotspot / VPN):**
- The 5-submission limit applies per IP address
- A different IP can submit 5 more times independently
- This allows genuine users from different locations to use the form

**To test locally:**
- Use `curl` with `--header "X-Forwarded-For: 192.168.1.100"` to simulate different IPs
- Each simulated IP gets its own 5-submission quota

```bash
# First IP (192.168.1.100): Should succeed
curl -X POST https://opuscybercity-beige.vercel.app/api/enquiry \
  -H "X-Forwarded-For: 192.168.1.100" \
  -H "Content-Type: application/json" \
  -d '{"fullName":"Test","phone":"9876543210","email":"test1@example.com","source":"","recaptchaToken":""}' \
  -w "Status: %{http_code}\n"

# Different IP (192.168.1.101): Should also succeed (different quota)
curl -X POST https://opuscybercity-beige.vercel.app/api/enquiry \
  -H "X-Forwarded-For: 192.168.1.101" \
  -H "Content-Type: application/json" \
  -d '{"fullName":"Test","phone":"9876543210","email":"test2@example.com","source":"","recaptchaToken":""}' \
  -w "Status: %{http_code}\n"
```

---

### Test 2.4: Check Vercel Logs

**In Vercel dashboard:**
1. Go to Deployments → Latest → Functions → `/api/enquiry`
2. Look for rate limit logs:

```
[RATE_LIMIT] IP 192.168.1.100 exceeded rate limit
```

---

## 3. Testing reCAPTCHA v3

### What it does:
- Invisible background verification (no user interaction required)
- Scores submissions: 1.0 (human) → 0.0 (bot)
- Blocks submissions with score < 0.5
- Gracefully degrades if reCAPTCHA unavailable

### Prerequisites for reCAPTCHA Testing:
- ✅ `RECAPTCHA_SITE_KEY` set in Vercel
- ✅ `RECAPTCHA_SECRET_KEY` set in Vercel
- ✅ Domain registered in Google reCAPTCHA Console

### Test 3.1: Verify reCAPTCHA Script Loads

**In browser DevTools:**
1. Open https://opuscybercity-beige.vercel.app/
2. Go to Console tab
3. Type: `window.grecaptcha` (should return an object, not `undefined`)

**Expected:**
```javascript
> window.grecaptcha
Object { execute: fn, render: fn, getResponse: fn, ... }
```

---

### Test 3.2: Verify Token Generation on Form Submit

**Steps:**
1. Open DevTools → Network tab
2. Fill and submit the enquiry form
3. Look for POST request to `/api/enquiry`
4. Inspect the request body in Network tab

**Expected in request body:**
```json
{
  "fullName": "John Doe",
  "phone": "9876543210",
  "email": "john@example.com",
  "source": "Social Media",
  "recaptchaToken": "03AOPtNoVQZ2VqLvM1_nqJ6o... [long token string]"
}
```

**Note:** Token should be a non-empty string (typically 600-800 characters)

---

### Test 3.3: Verify Backend Verification

**Check Vercel logs after submission:**
1. Go to Vercel Dashboard → Deployments → Latest → Functions → `/api/enquiry`
2. Look for logs like:

**Legitimate human submission:**
```
[CAPTCHA_VERIFIED] Score: 0.92, Action: enquiry_submission
[ENQUIRY] New lead created
```

**Suspected bot submission:**
```
[CAPTCHA_BLOCKED] Submission blocked - reCAPTCHA score: 0.15
```

---

### Test 3.4: Test Bot-like Behavior

**Automated bot submission (with curl - no token):**
```bash
curl -X POST https://opuscybercity-beige.vercel.app/api/enquiry \
  -H "Content-Type: application/json" \
  -d '{
    "fullName": "Bot Attack",
    "phone": "9876543210",
    "email": "bot@spam.com",
    "source": "",
    "recaptchaToken": ""
  }'
```

**Expected Response:**
```json
{
  "success": false,
  "message": "Too many submissions. Please try again later.",
  "retryAfter": 3599
}
```

**Note:** It gets rate-limited before reCAPTCHA check (which is good - defense in depth)

---

### Test 3.5: Graceful Degradation (Missing Secret Key)

**If `RECAPTCHA_SECRET_KEY` is not set in environment:**

1. Remove the secret key from Vercel temporarily (for testing only)
2. Submit the form
3. Check response and logs

**Expected:**
- ✅ Form submission still succeeds
- ✅ Log shows: `[CAPTCHA_MISSING] No reCAPTCHA token provided` (warning, not error)
- ✅ Lead is created in Zoho CRM
- ✅ No user sees an error

**This ensures the form doesn't break if reCAPTCHA fails.**

---

## 4. Integration Testing: All Three Protections Together

### Scenario: Spam Bot Attack

**Bot tries 10 submissions in 2 seconds from same IP:**

```bash
for i in {1..10}; do
  curl -X POST https://opuscybercity-beige.vercel.app/api/enquiry \
    -H "Content-Type: application/json" \
    -d "{
      \"fullName\": \"Bot $i\",
      \"phone\": \"1111111111\",
      \"email\": \"bot$i@spam.com\",
      \"source\": \"\",
      \"recaptchaToken\": \"\"
    }" &
done
wait
```

**What happens:**
1. ✅ Submissions 1-5: Succeed (rate limit quota not exceeded)
2. ✅ Submission 6+: HTTP 429 Too Many Requests (rate limited)
3. ✅ Vercel logs show:
   ```
   [RATE_LIMIT] IP x.x.x.x exceeded rate limit
   ```
4. ✅ Only 5 leads created in Zoho CRM (not 10)
5. ✅ If different emails but same phone repeated: Duplicate detection within 30s window prevents duplicate leads

---

### Scenario: Legitimate User Retries Failed Submission

**Network flake during lead creation:**

1. User submits form (network hiccup occurs)
2. Backend retries 3 times with backoff (1s, 2s, 4s)
3. On retry 2, Zoho responds
4. User redirected to thank-you
5. Lead appears in CRM

**Verification in logs:**
```
[RETRY] Attempt 1/4 failed. Retrying in 1000ms. Error: ...
[RETRY] Attempt 2/4 failed. Retrying in 2000ms. Error: ...
[ENQUIRY] New lead created
```

✅ **User experience:** Invisible retries - form works reliably even with network issues

---

### Scenario: Legitimate High-Volume Day

**50 genuine enquiries from different IPs (office building, multiple networks):**

- ✅ Each IP can submit 5 times (50 submissions across 10+ IPs = all succeed)
- ✅ Each submission gets reCAPTCHA verification (scores 0.8+)
- ✅ All 50 leads created in Zoho CRM
- ✅ No false positives blocking real users

---

## 5. Monitoring & Alert Setup

### Key Metrics to Monitor

**In Vercel Dashboard:**
1. Function error rate: Should stay < 1%
2. Function duration: Should be 1-3 seconds (timeout set to 10s)
3. Successful 200 responses: Track submissions succeeding

**Server-Side Logs to Watch For:**

| Log Pattern | Meaning | Action |
|---|---|---|
| `[ENQUIRY]` | Successful lead created | ✅ Good |
| `[CAPTCHA_VERIFIED]` Score: 0.8+ | Human submission | ✅ Good |
| `[RATE_LIMIT]` | IP exceeded 5/hour | ⚠️ Monitor (normal for heavy traffic) |
| `[DUPLICATE]` | Same email+phone in 30s | ⚠️ May indicate user error or bot |
| `[CAPTCHA_BLOCKED]` | Low reCAPTCHA score | ⚠️ Bot detected |
| `[RETRY]` | Zoho API failure + retry | ⚠️ Watch if frequent |

---

## 6. Troubleshooting

### Issue: "Failed to submit enquiry" error on form

**Possible causes:**
1. ❌ reCAPTCHA script not loading → Check domain in Google reCAPTCHA console
2. ❌ Invalid reCAPTCHA Site Key → Verify in `index.html` and `RECAPTCHA_SITE_KEY` env var
3. ❌ Rate limit exceeded → Wait 1 hour or use different IP
4. ❌ Zoho API down → Check Zoho status page
5. ❌ Duplicate within 30s → Try with different email/phone

**Debug steps:**
- Check browser console for JavaScript errors
- Check Vercel function logs for backend errors
- Verify all environment variables set in Vercel

---

### Issue: "Too many submissions" on first submission

**Cause:** Rate limit hit (unlikely unless 5+ submissions already made)

**Solution:** 
- Use fresh IP/VPN
- Wait 1 hour for quota reset
- Check if another user from your network already submitted 5 times

---

### Issue: reCAPTCHA not appearing / loading

**Cause:** Domain not registered in Google reCAPTCHA console

**Solution:**
1. Go to https://www.google.com/recaptcha/admin
2. Add domain: `opuscybercity-beige.vercel.app`
3. Get Site Key and Secret Key
4. Set in Vercel environment variables
5. Redeploy

---

## 7. Performance Baselines

| Metric | Target | Actual |
|--------|--------|--------|
| Form submission time | < 3s | (Test locally) |
| Zoho lead creation | < 2s | (Check via logs) |
| reCAPTCHA verification | < 1s | (Check response time) |
| Rate limit check | < 10ms | (In-memory, instant) |
| Duplicate check | < 10ms | (In-memory, instant) |
| **Total P95 latency** | < 5s | (Monitor in Vercel) |

---

## 8. Post-Deployment Checklist

After deploying to production:

- [ ] All 6 environment variables set in Vercel
- [ ] Domain registered in Google reCAPTCHA console
- [ ] Vercel build succeeds (no runtime errors)
- [ ] Test form submission from live site
- [ ] Lead appears in Zoho CRM within 10 seconds
- [ ] Vercel logs show `[ENQUIRY]` success message
- [ ] reCAPTCHA script loads (check DevTools)
- [ ] Rate limit headers present in response
- [ ] Try duplicate submission → only one lead created
- [ ] Monitor function logs for errors 24 hours post-deploy

---

## Questions?

For support:
1. Check Vercel function logs first
2. Review this guide's troubleshooting section
3. Verify all environment variables are set correctly
4. Test with curl to isolate frontend vs backend issues

