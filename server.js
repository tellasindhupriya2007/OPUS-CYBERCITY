const express = require('express');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = 3000;
const HOST = '0.0.0.0';

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Zoho CRM Configuration
const ZOHO_CONFIG = {
  clientId: process.env.ZOHO_CLIENT_ID,
  clientSecret: process.env.ZOHO_CLIENT_SECRET,
  refreshToken: process.env.ZOHO_REFRESH_TOKEN,
  apiDomain: process.env.ZOHO_API_DOMAIN || 'https://www.zohoapis.in',
  accountsUrl: 'https://accounts.zoho.in/oauth/v2/token'
};

// Zoho OAuth Token Cache (in-memory)
let zohoAccessToken = null;
let tokenExpiryTime = null;

/**
 * Get valid Zoho access token using refresh token
 */
async function getZohoAccessToken() {
  try {
    // Check if cached token is still valid
    if (zohoAccessToken && tokenExpiryTime && Date.now() < tokenExpiryTime) {
      return zohoAccessToken;
    }

    // Request new access token using refresh token
    const tokenUrl = ZOHO_CONFIG.accountsUrl;
    const params = new URLSearchParams({
      client_id: ZOHO_CONFIG.clientId,
      client_secret: ZOHO_CONFIG.clientSecret,
      refresh_token: ZOHO_CONFIG.refreshToken,
      grant_type: 'refresh_token'
    });

    const response = await fetch(tokenUrl, {
      method: 'POST',
      body: params,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('Zoho token error:', errorData);
      throw new Error(`Failed to get Zoho access token: ${response.statusText}`);
    }

    const data = await response.json();
    zohoAccessToken = data.access_token;
    // Cache token for 50 minutes (expires in 60 minutes)
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
    const apiUrl = `${ZOHO_CONFIG.apiDomain}/crm/v8/Leads`;

    const payload = {
      data: [
        {
          First_Name: leadData.firstName,
          Last_Name: leadData.lastName,
          Phone: leadData.phone,
          Email: leadData.email,
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
      const errorData = await response.json();
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

// API Endpoint: Submit enquiry form (MUST be before static middleware)
app.post('/api/enquiry', async (req, res) => {
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

    // Log successful submission
    console.log(`[ENQUIRY] New lead created - Name: ${fullName}, Email: ${email}, Phone: ${phone}`);

    return res.status(200).json({
      success: true,
      message: 'Enquiry submitted successfully. Lead created in CRM.',
      zohoResponse
    });
  } catch (error) {
    console.error('API Error:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to process enquiry. Please try again later.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Serve static assets from project directory
app.use(express.static(path.join(__dirname)));

// Clean URL rewrite for /thank-you
app.get('/thank-you', (req, res) => {
  res.sendFile(path.join(__dirname, 'thank-you.html'));
});

// Root route
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, HOST, () => {
  console.log(`Server running on http://${HOST}:${PORT}`);
});
