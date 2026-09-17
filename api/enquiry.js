/**
 * Vercel Serverless Function: /api/enquiry
 * Handles enquiry form submissions and creates leads in Zoho CRM
 * 
 * Environment Variables Required:
 * - ZOHO_CLIENT_ID
 * - ZOHO_CLIENT_SECRET
 * - ZOHO_REFRESH_TOKEN
 * - ZOHO_API_DOMAIN (optional, defaults to https://www.zohoapis.in)
 */

// Zoho OAuth Token Cache (in-memory for this serverless instance)
let zohoAccessToken = null;
let tokenExpiryTime = null;

/**
 * Get valid Zoho access token using refresh token
 */
async function getZohoAccessToken() {
  try {
    const ZOHO_CLIENT_ID = process.env.ZOHO_CLIENT_ID;
    const ZOHO_CLIENT_SECRET = process.env.ZOHO_CLIENT_SECRET;
    const ZOHO_REFRESH_TOKEN = process.env.ZOHO_REFRESH_TOKEN;

    // Validate that all required credentials are present
    if (!ZOHO_CLIENT_ID || !ZOHO_CLIENT_SECRET || !ZOHO_REFRESH_TOKEN) {
      throw new Error('Missing required Zoho CRM credentials in environment variables');
    }

    // Check if cached token is still valid
    if (zohoAccessToken && tokenExpiryTime && Date.now() < tokenExpiryTime) {
      return zohoAccessToken;
    }

    // Request new access token using refresh token
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
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('Zoho token error:', errorData);
      throw new Error(`Failed to get Zoho access token: ${response.statusText}`);
    }

    const data = await response.json();
    zohoAccessToken = data.access_token;
    // Cache token for 50 minutes (Zoho tokens expire in 60 minutes)
    tokenExpiryTime = Date.now() + (50 * 60 * 1000);

    return zohoAccessToken;
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
 * Create lead in Zoho CRM
 */
async function createZohoLead(leadData) {
  try {
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
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('Zoho API error:', errorData);
      throw new Error(`Failed to create lead in Zoho: ${errorData.message || response.statusText}`);
    }

    const result = await response.json();
    return result;
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

  try {
    const { fullName, phone, email, source } = req.body;

    // Validate required fields
    const validationErrors = validateFormData({ fullName, phone, email });
    if (validationErrors.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: validationErrors
      });
    }

    // Split full name
    const { firstName, lastName } = splitFullName(fullName);

    // Create lead in Zoho CRM
    const leadData = {
      firstName,
      lastName,
      phone,
      email,
      source: source || null
    };

    const zohoResponse = await createZohoLead(leadData);

    // Log successful submission (server-side only)
    console.log(`[ENQUIRY] New lead created - Name: ${fullName}, Email: ${email}, Phone: ${phone}`);

    return res.status(200).json({
      success: true,
      message: 'Enquiry submitted successfully. Lead created in CRM.',
      // Return only non-sensitive data to frontend
      leadId: zohoResponse?.data?.[0]?.entity_id || null
    });
  } catch (error) {
    console.error('API Error:', error.message);
    
    return res.status(500).json({
      success: false,
      message: 'Failed to process enquiry. Please try again later.',
      // Only expose error details in development
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}
