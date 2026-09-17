# Zoho CRM Integration Setup Guide

This document explains how to set up Zoho CRM credentials for the OPUS Cybercity enquiry form integration.

---

## Environment Variables Required

The following environment variables must be configured to enable Zoho CRM lead creation:

| Variable Name | Description | Format | Required | Location |
|---------------|-------------|--------|----------|----------|
| `ZOHO_CLIENT_ID` | OAuth 2.0 Client ID from Zoho Developer Console | `1000.xxxxxxx...` | ✅ Yes | Vercel / .env |
| `ZOHO_CLIENT_SECRET` | OAuth 2.0 Client Secret (keep secret!) | `xxxxxxx...` | ✅ Yes | Vercel / .env |
| `ZOHO_REFRESH_TOKEN` | OAuth 2.0 Refresh Token for token renewal | `1000.xxxxxxx...` | ✅ Yes | Vercel / .env |
| `ZOHO_API_DOMAIN` | Zoho API endpoint domain | `https://www.zohoapis.in` | ⚠️ Optional | Vercel / .env |

---

## Getting Zoho Credentials

### Step 1: Register OAuth Application in Zoho

1. Go to [Zoho Developer Console](https://accounts.zoho.in/developerconsole)
2. Click **"Add Client"**
3. Choose **"Server-based Applications"**
4. Fill in:
   - **Client Name:** OPUS Cybercity Landing Page
   - **Company Name:** Your company name
   - **Homepage URL:** https://opuscybercity-beige.vercel.app
   - **Authorized Redirect URIs:** https://opuscybercity-beige.vercel.app/api/enquiry
5. Click **"Create"**
6. You will receive:
   - **Client ID** (e.g., `1000.GSAEK85LZFJLJT3IGW35MI6APZM22Q`)
   - **Client Secret** (e.g., `d0fccf110856b879cb5333d254e5a2e1f4a6891f64`)

### Step 2: Generate Refresh Token

1. In Zoho Developer Console, click your application
2. Click **"Client Secret"** to reveal the secret
3. Use the authorization URL below to get a refresh token:

```
https://accounts.zoho.in/oauth/v2/auth?scope=ZohoCRM.modules.ALL,ZohoCRM.users.ALL,ZohoCRM.settings.ALL&client_id=YOUR_CLIENT_ID&response_type=code&access_type=offline&redirect_uri=https://opuscybercity-beige.vercel.app/api/enquiry
```

Replace `YOUR_CLIENT_ID` with your actual Client ID.

4. Click the link, authorize the application
5. You'll receive a **code** in the redirect URL (e.g., `?code=1000.abc123...`)
6. Exchange this code for a refresh token using:

```bash
curl -X POST https://accounts.zoho.in/oauth/v2/token \
  -d "client_id=YOUR_CLIENT_ID" \
  -d "client_secret=YOUR_CLIENT_SECRET" \
  -d "code=YOUR_CODE" \
  -d "grant_type=authorization_code" \
  -d "redirect_uri=https://opuscybercity-beige.vercel.app/api/enquiry"
```

Response will contain:
```json
{
  "access_token": "...",
  "refresh_token": "1000.abc123...",
  "token_type": "Bearer",
  "expires_in": 3600
}
```

Copy the **refresh_token** value.

---

## Local Development Setup

### Step 1: Create .env File

Create a `.env` file in the project root (it's in `.gitignore`, so it won't be committed):

```bash
ZOHO_CLIENT_ID=1000.GSAEK85LZFJLJT3IGW35MI6APZM22Q
ZOHO_CLIENT_SECRET=d0fccf110856b879cb5333d254e5a2e1f4a6891f64
ZOHO_REFRESH_TOKEN=1000.cb5f5b04e847b39f2c043a2de32f880c.e77a64c3b7a2619fbd7ff560e367b6d8
ZOHO_API_DOMAIN=https://www.zohoapis.in
```

**IMPORTANT:** Replace with your actual credentials!

### Step 2: Verify Setup Locally

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Test the endpoint
curl -X POST http://localhost:3000/api/enquiry \
  -H "Content-Type: application/json" \
  -d '{
    "fullName": "Test User",
    "phone": "9876543210",
    "email": "test@example.com",
    "source": "Local Test"
  }'
```

Expected response:
```json
{
  "success": true,
  "message": "Enquiry submitted successfully. Lead created in CRM.",
  "leadId": "xxxxxxxxxxxxx"
}
```

---

## Production Setup (Vercel)

### Step 1: Add Environment Variables to Vercel

1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Select **OPUS Cybercity** project
3. Click **Settings → Environment Variables**
4. Add each variable:

```
ZOHO_CLIENT_ID = 1000.GSAEK85LZFJLJT3IGW35MI6APZM22Q
ZOHO_CLIENT_SECRET = d0fccf110856b879cb5333d254e5a2e1f4a6891f64
ZOHO_REFRESH_TOKEN = 1000.cb5f5b04e847b39f2c043a2de32f880c.e77a64c3b7a2619fbd7ff560e367b6d8
ZOHO_API_DOMAIN = https://www.zohoapis.in
```

5. Click **Save**
6. Trigger a redeployment:
   - Go to **Deployments**
   - Click the three dots on the latest deployment
   - Click **Redeploy**

### Step 2: Test on Live Website

1. Visit https://opuscybercity-beige.vercel.app/
2. Fill the enquiry form:
   - Name: Test User
   - Phone: 9876543210
   - Email: test@example.com
   - Source: (leave empty or select option)
3. Click "Request Purchase Details"
4. Expected behavior:
   - Button shows "Submitting..."
   - Page redirects to /thank-you within 1 second
   - Check Zoho CRM → Leads → new lead should appear

---

## Security & Best Practices

### ✅ DO:
- ✅ Keep credentials in `.env` file (not committed)
- ✅ Use Vercel Environment Variables for production
- ✅ Rotate credentials annually
- ✅ Use HTTPS only (Vercel provides this)
- ✅ Log errors server-side for debugging
- ✅ Test locally before deploying to production

### ❌ DON'T:
- ❌ Commit `.env` file to git
- ❌ Share credentials in emails or Slack
- ❌ Expose credentials in frontend code
- ❌ Use the same credentials for other projects
- ❌ Hardcode credentials in application
- ❌ Log credentials to console

---

## Troubleshooting

### Error: "Missing required Zoho CRM credentials"
**Cause:** Environment variables not set  
**Solution:** Verify all 4 variables are added to Vercel or .env file

### Error: "Failed to get Zoho access token"
**Cause:** Invalid Client ID, Client Secret, or Refresh Token  
**Solution:** 
1. Regenerate credentials in Zoho Developer Console
2. Update environment variables
3. Redeploy Vercel project

### Error: "Failed to create lead in Zoho"
**Cause:** 
- Zoho CRM module not accessible
- Required fields missing in Zoho schema
- Zoho account has API rate limits
**Solution:**
1. Check Zoho CRM permissions
2. Verify Lead module has First_Name, Last_Name, Phone, Email fields
3. Wait a few minutes and retry (rate limit)

### Lead created but doesn't appear in Zoho CRM
**Cause:** Lead creation succeeded but not visible in UI  
**Solution:** 
1. Check Zoho CRM filters/views
2. Search by phone number or email
3. Check "All" leads view
4. Refresh the browser

### Button stays on "Submitting..." indefinitely
**Cause:** 
- API endpoint not responding
- Network connection lost
- CORS issue
**Solution:**
1. Check browser console for errors (F12)
2. Check Vercel deployment logs
3. Try form submission again

---

## Support & Documentation

- [Zoho CRM API Documentation](https://www.zoho.com/crm/developer/docs/api/v8/)
- [Zoho OAuth 2.0 Documentation](https://www.zoho.com/accounts/protocol/oauth.html)
- [Vercel Environment Variables](https://vercel.com/docs/projects/environment-variables)
- [OPUS Cybercity GitHub](https://github.com/tellasindhupriya2007/OPUS-CYBERCITY)

---

## File Locations

| File | Purpose |
|------|---------|
| `/api/enquiry.js` | Serverless function that handles form submission |
| `/.env.example` | Template for environment variables (committed to git) |
| `/.env` | Actual credentials (NOT committed, only local) |
| `/brochure.js` | Frontend form handler that calls `/api/enquiry` |
| `/vercel.json` | Vercel configuration for serverless functions |

---

## Quick Reference

### Local Development Command
```bash
npm run dev
```

### Production Endpoint
```
https://opuscybercity-beige.vercel.app/api/enquiry
```

### Zoho Lead API Endpoint
```
https://www.zohoapis.in/crm/v8/Leads
```

### Credentials Format
```
Client ID:     1000.xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
Client Secret: xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
Refresh Token: 1000.xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```
