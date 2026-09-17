/**
 * Vercel Serverless Function: /api/enquiry
 * Handles enquiry form submissions and creates leads in Zoho CRM
 * 
 * Environment Variables Required:
 * - ZOHO_CLIENT_ID
 * - ZOHO_CLIENT_SECRET
 * - ZOHO_REFRESH_TOKEN
 * - ZOHO_API_DOMAIN (optional, defaults to https://www.zohoapis.in)
 * - RECAPTCHA_SECRET_KEY (for reCAPTCHA v3 backend verification)
 */

// Zoho OAuth Token Cache (in-memory for this serverless instance)
let zohoAccessToken = null;
let tokenExpiryTime = null;

// Duplicate Detection Cache: Store (email+phone) hashes for 30 seconds to prevent duplicates
// This prevents the same form from being submitted multiple times within a short window
const duplicateCache = new Map();
const DUPLICATE_WINDOW_MS = 30 * 1000; // 30 seconds

// Rate Limiting Cache: Track submissions per IP address
// Limit: 5 submissions per hour (3600 seconds) per IP
const rateLimitCache = new Map();
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const RATE_LIMIT_MAX_SUBMISSIONS = 5;

/**
 * Generate a hash key for duplicate detection (email + phone)
 */
function generateDuplicateKey(email, phone) {
  return `${email}|${phone}`.toLowerCase();
}

/**
 * Check if this submission is a duplicate (same email+phone within 30s)
 */
function isDuplicate(email, phone) {
  const key = generateDuplicateKey(email, phone);
  const cached = duplicateCache.get(key);
  
  if (cached && Date.now() - cached.timestamp < DUPLICATE_WINDOW_MS) {
    return true; // Duplicate detected
  }
  
  return false;
}

/**
 * Mark submission as processed (add to duplicate cache)
 */
function markAsProcessed(email, phone) {
  const key = generateDuplicateKey(email, phone);
  duplicateCache.set(key, { timestamp: Date.now() });
}

/**
 * Cleanup old entries from duplicate cache (runs on each request)
 */
function cleanupDuplicateCache() {
  const now = Date.now();
  for (const [key, value] of duplicateCache.entries()) {
    if (now - value.timestamp > DUPLICATE_WINDOW_MS) {
      duplicateCache.delete(key);
    }
  }
}

/**
 * Get client IP address from request
 * Handles X-Forwarded-For header (for proxied requests like on Vercel)
 */
function getClientIp(req) {
  // Try X-Forwarded-For first (set by proxies/CDNs like Vercel)
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    // x-forwarded-for can contain multiple IPs; use the first one
    return forwarded.split(',')[0].trim();
  }
  
  // Fallback to direct connection IP
  return req.headers['cf-connecting-ip'] ||
         req.socket?.remoteAddress ||
         req.connection?.remoteAddress ||
         '0.0.0.0';
}

/**
 * Check if client IP has exceeded rate limit
 * Returns: { allowed: boolean, remaining: number, resetTime: number }
 */
function checkRateLimit(ip) {
  const now = Date.now();
  const record = rateLimitCache.get(ip);
  
  // Initialize or reset if window has expired
  if (!record || now - record.windowStart > RATE_LIMIT_WINDOW_MS) {
    const newRecord = { windowStart: now, count: 0 };
    rateLimitCache.set(ip, newRecord);
    return {
      allowed: true,
      remaining: RATE_LIMIT_MAX_SUBMISSIONS,
      resetTime: now + RATE_LIMIT_WINDOW_MS
    };
  }
  
  const remaining = RATE_LIMIT_MAX_SUBMISSIONS - record.count;
  const allowed = record.count < RATE_LIMIT_MAX_SUBMISSIONS;
  
  return {
    allowed,
    remaining: Math.max(0, remaining),
    resetTime: record.windowStart + RATE_LIMIT_WINDOW_MS
  };
}

/**
 * Increment rate limit counter for IP
 */
function incrementRateLimit(ip) {
  const record = rateLimitCache.get(ip);
  if (record) {
    record.count++;
  }
}

/**
 * Cleanup old entries from rate limit cache (runs on each request)
 */
function cleanupRateLimitCache() {
  const now = Date.now();
  for (const [ip, record] of rateLimitCache.entries()) {
    if (now - record.windowStart > RATE_LIMIT_WINDOW_MS) {
      rateLimitCache.delete(ip);
    }
  }
}

/**
 * Retry helper: Retry a function with exponential backoff
 * Retries on transient failures: network errors, timeouts, 429 (rate limit), 503 (service unavailable)
 * Does NOT retry on permanent failures: 400 (bad request), 401 (auth), 404 (not found)
 */
async function retryWithExponentialBackoff(
  fn,
  maxRetries = 3,
  initialDelayMs = 1000
) {
  let lastError;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      
      // If this is not a retryable error or last attempt, throw
      const isRetryable = error.retryable !== false;
      const isLastAttempt = attempt === maxRetries;
      
      if (!isRetryable || isLastAttempt) {
        throw error;
      }
      
      // Calculate exponential backoff: 1s, 2s, 4s, 8s...
      const delayMs = initialDelayMs * Math.pow(2, attempt);
      
      console.log(
        `[RETRY] Attempt ${attempt + 1}/${maxRetries + 1} failed. ` +
        `Retrying in ${delayMs}ms. Error: ${error.message}`
      );
      
      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
  
  throw lastError;
}

/**
 * Create an error object with metadata for retry decision
 */
function createError(message, statusCode = null, retryable = false) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.retryable = retryable;
  return error;
}

/**
 * Get valid Zoho access token using refresh token (with retry logic)
 */
async function getZohoAccessToken() {
  try {
    const ZOHO_CLIENT_ID = process.env.ZOHO_CLIENT_ID;
    const ZOHO_CLIENT_SECRET = process.env.ZOHO_CLIENT_SECRET;
    const ZOHO_REFRESH_TOKEN = process.env.ZOHO_REFRESH_TOKEN;

    // Validate that all required credentials are present
    if (!ZOHO_CLIENT_ID || !ZOHO_CLIENT_SECRET || !ZOHO_REFRESH_TOKEN) {
      throw createError(
        'Missing required Zoho CRM credentials in environment variables',
        500,
        false // Not retryable - this is a config issue
      );
    }

    // Check if cached token is still valid
    if (zohoAccessToken && tokenExpiryTime && Date.now() < tokenExpiryTime) {
      return zohoAccessToken;
    }

    // Retry token refresh on transient failures
    return await retryWithExponentialBackoff(async () => {
      const tokenUrl = 'https://accounts.zoho.in/oauth/v2/token';
      const params = new URLSearchParams({
        client_id: ZOHO_CLIENT_ID,
        client_secret: ZOHO_CLIENT_SECRET,
        refresh_token: ZOHO_REFRESH_TOKEN,
        grant_type: 'refresh_token'
      });

      const response = await fetch(tokenUrl, {
        method: 'POST',
        body: params,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        timeout: 10000 // 10-second timeout
      });

      // Determine if error is retryable
      const isRetryable = response.status === 429 || response.status === 503 || response.status >= 500;
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('Zoho token error:', errorData);
        
        throw createError(
          `Failed to get Zoho access token: ${response.statusText}`,
          response.status,
          isRetryable
        );
      }

      const data = await response.json();
      zohoAccessToken = data.access_token;
      // Cache token for 50 minutes (Zoho tokens expire in 60 minutes)
      tokenExpiryTime = Date.now() + (50 * 60 * 1000);

      return zohoAccessToken;
    }, 3, 1000); // Max 3 retries, 1s initial delay
    
  } catch (error) {
    console.error('Error getting Zoho access token:', error.message);
    throw error;
  }
}

/**
 * Split full name into first and last name
 */
function splitFullName(fullName) {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) {
    return { firstName: parts[0], lastName: '' };
  }
  const firstName = parts[0];
  const lastName = parts.slice(1).join(' ');
  return { firstName, lastName };
}

/**
 * Validate form data
 */
function validateFormData(data) {
  const errors = [];

  if (!data.fullName || data.fullName.trim().length < 2) {
    errors.push('Full Name is required and must be at least 2 characters');
  }

  if (!data.phone || !/^\d{10}$/.test(data.phone)) {
    errors.push('Phone must be a valid 10-digit number');
  }

  if (!data.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
    errors.push('Email must be a valid email address');
  }

  return errors;
}

/**
 * Verify reCAPTCHA v3 token with Google
 * Returns score between 0.0 and 1.0 (1.0 = likely human, 0.0 = likely bot)
 * Action name should match frontend action
 */
async function verifyRecaptchaToken(token) {
  try {
    const RECAPTCHA_SECRET_KEY = process.env.RECAPTCHA_SECRET_KEY;

    // If reCAPTCHA not configured, skip verification (graceful degradation)
    if (!RECAPTCHA_SECRET_KEY) {
      console.warn('[RECAPTCHA] Secret key not configured, skipping verification');
      return { verified: true, score: 1.0, action: null };
    }

    // Verify token with Google
    const verificationUrl = 'https://www.google.com/recaptcha/api/siteverify';
    const response = await fetch(verificationUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        secret: RECAPTCHA_SECRET_KEY,
        response: token
      }),
      timeout: 5000 // 5-second timeout for Google verification
    });

    if (!response.ok) {
      throw createError(
        `reCAPTCHA verification failed: ${response.statusText}`,
        response.status,
        true // Retryable
      );
    }

    const result = await response.json();

    // reCAPTCHA returns:
    // {
    //   "success": boolean,
    //   "challenge_ts": timestamp,
    //   "hostname": domain,
    //   "score": 0.0-1.0,
    //   "action": action name,
    //   "error-codes": []
    // }

    if (!result.success) {
      console.warn('[RECAPTCHA] Verification failed:', result['error-codes']);
      return {
        verified: false,
        score: result.score || 0.0,
        action: result.action,
        errors: result['error-codes']
      };
    }

    // Score threshold: 0.5 (adjust based on your tolerance)
    // 1.0 = very likely human, 0.0 = very likely bot
    const SCORE_THRESHOLD = 0.5;
    const isLikelyHuman = result.score >= SCORE_THRESHOLD;

    if (!isLikelyHuman) {
      console.warn(
        `[RECAPTCHA] Low score (${result.score}) from ${result.hostname} - likely bot`
      );
    }

    return {
      verified: isLikelyHuman,
      score: result.score,
      action: result.action,
      errors: []
    };
  } catch (error) {
    console.error('Error verifying reCAPTCHA:', error.message);
    throw error;
  }
}

/**
 * Create lead in Zoho CRM (with retry logic for transient failures)
 */
async function createZohoLead(leadData) {
  try {
    return await retryWithExponentialBackoff(async () => {
      const accessToken = await getZohoAccessToken();
      const ZOHO_API_DOMAIN = process.env.ZOHO_API_DOMAIN || 'https://www.zohoapis.in';
      const apiUrl = `${ZOHO_API_DOMAIN}/crm/v8/Leads`;

      const payload = {
        data: [
          {
            First_Name: leadData.firstName,
            Last_Name: leadData.lastName,
            Phone: leadData.phone,
            Email: leadData.email,
            // Only include Lead_Source if source is provided
            ...(leadData.source && { Lead_Source: leadData.source })
          }
        ]
      };

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload),
        timeout: 10000 // 10-second timeout
      });

      // Determine if error is retryable
      const isRetryable = response.status === 429 || response.status === 503 || response.status >= 500;
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('Zoho API error:', errorData);
        
        throw createError(
          `Failed to create lead in Zoho: ${errorData.message || response.statusText}`,
          response.status,
          isRetryable
        );
      }

      const result = await response.json();
      return result;
    }, 3, 1000); // Max 3 retries, 1s initial delay
    
  } catch (error) {
    console.error('Error creating Zoho lead:', error.message);
    throw error;
  }
}

/**
 * Vercel Serverless Function Handler
 */
export default async function handler(req, res) {
  // Set CORS headers for POST requests
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  // Cleanup old cache entries
  cleanupDuplicateCache();
  cleanupRateLimitCache();

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // Only accept POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      message: 'Method not allowed. Use POST.'
    });
  }

  // Get client IP and check rate limit
  const clientIp = getClientIp(req);
  const rateLimitStatus = checkRateLimit(clientIp);

  // Add rate limit headers to response
  res.setHeader('X-RateLimit-Limit', RATE_LIMIT_MAX_SUBMISSIONS);
  res.setHeader('X-RateLimit-Remaining', rateLimitStatus.remaining);
  res.setHeader('X-RateLimit-Reset', Math.ceil(rateLimitStatus.resetTime / 1000));

  // Check if rate limit exceeded
  if (!rateLimitStatus.allowed) {
    console.warn(`[RATE_LIMIT] IP ${clientIp} exceeded rate limit`);
    return res.status(429).json({
      success: false,
      message: 'Too many submissions. Please try again later.',
      retryAfter: Math.ceil((rateLimitStatus.resetTime - Date.now()) / 1000)
    });
  }

  try {
    const { fullName, phone, email, source, recaptchaToken } = req.body;

    // Validate required fields
    const validationErrors = validateFormData({ fullName, phone, email });
    if (validationErrors.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: validationErrors
      });
    }

    // Verify reCAPTCHA token (if provided)
    if (recaptchaToken) {
      try {
        const captchaResult = await verifyRecaptchaToken(recaptchaToken);
        
        if (!captchaResult.verified) {
          console.warn(
            `[CAPTCHA_BLOCKED] Submission blocked - reCAPTCHA score: ${captchaResult.score}`
          );
          return res.status(403).json({
            success: false,
            message: 'Submission failed verification. Please try again.',
            captchaScore: captchaResult.score
          });
        }
        
        // Log reCAPTCHA score for monitoring
        console.log(
          `[CAPTCHA_VERIFIED] Score: ${captchaResult.score}, Action: ${captchaResult.action}`
        );
      } catch (captchaError) {
        console.error('reCAPTCHA verification error:', captchaError.message);
        // Don't block submission if reCAPTCHA verification fails
        // This allows graceful degradation if Google's service is down
        console.warn('[CAPTCHA_FALLBACK] Allowing submission despite reCAPTCHA error');
      }
    } else {
      // reCAPTCHA token not provided - warn but don't block
      console.warn('[CAPTCHA_MISSING] No reCAPTCHA token provided');
    }

    // Check for duplicate submission (same email+phone within 30 seconds)
    if (isDuplicate(email, phone)) {
      console.warn(`[DUPLICATE] Duplicate submission detected: ${email}, ${phone}`);
      // Return success to avoid exposing that we detected a duplicate
      // This prevents attackers from learning our dedup window
      return res.status(200).json({
        success: true,
        message: 'Enquiry submitted successfully. Lead created in CRM.',
        leadId: null
      });
    }

    // Split full name
    const { firstName, lastName } = splitFullName(fullName);

    // Create lead in Zoho CRM (with retry logic)
    const leadData = {
      firstName,
      lastName,
      phone,
      email,
      source: source || null
    };

    const zohoResponse = await createZohoLead(leadData);

    // Mark this submission as processed (prevent duplicates)
    markAsProcessed(email, phone);

    // Increment rate limit counter only on successful submission
    incrementRateLimit(clientIp);

    // Log successful submission (server-side only)
    console.log(`[ENQUIRY] New lead created - Name: ${fullName}, Email: ${email}, Phone: ${phone}, IP: ${clientIp}`);

    return res.status(200).json({
      success: true,
      message: 'Enquiry submitted successfully. Lead created in CRM.',
      // Return only non-sensitive data to frontend
      leadId: zohoResponse?.data?.[0]?.entity_id || null
    });
  } catch (error) {
    console.error('API Error:', error.message);
    
    // Return user-friendly error message
    // In production, log detailed errors server-side only
    return res.status(500).json({
      success: false,
      message: 'Failed to process enquiry. Please try again later.',
      // Only expose error details in development
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}
