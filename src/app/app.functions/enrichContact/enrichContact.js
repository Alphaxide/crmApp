const hubspot = require('@hubspot/api-client');
const companies = require('../data/companies.json');
const jobTitles = require('../data/jobTitles.json');

exports.main = async (context = {}) => {
  const { contactId } = context.parameters;

  // Validate input
  if (!contactId) {
    return {
      statusCode: 400,
      body: { error: 'Contact ID is required' }
    };
  }

  try {
    // Initialize HubSpot client
    const hubspotClient = new hubspot.Client({
      accessToken: process.env.PRIVATE_APP_ACCESS_TOKEN
    });

    // Fetch contact from HubSpot
    const contact = await hubspotClient.crm.contacts.basicApi.getById(
      contactId,
      ['email', 'jobtitle', 'firstname', 'lastname', 'company', 'industry', 'city']
    );

    const email = contact.properties.email;
    const jobTitle = contact.properties.jobtitle || '';

    // Extract domain from email
    const domain = extractDomain(email);

    // Enrich company data
    const companyData = enrichCompanyData(domain);

    // Enrich job title data
    const jobData = enrichJobTitle(jobTitle);

    // Prepare update payload using EXISTING HubSpot properties
    const updateData = {};

    // Only update if we have enriched data
    if (companyData.name) {
      updateData.company = companyData.name;
    }
    
    if (companyData.industry) {
      updateData.industry = companyData.industry;
    }
    
    if (companyData.location) {
      updateData.city = companyData.location.split(',')[0].trim();
    }

    // Add a note about enrichment in the notes/description field
    const enrichmentNote = `Enriched on ${new Date().toISOString().split('T')[0]}. ` +
                          `Seniority: ${jobData.seniority || 'Unknown'}, ` +
                          `Department: ${jobData.department || 'Unknown'}, ` +
                          `Company Size: ${companyData.size || 'Unknown'}`;
    
    // Check if there's anything to update
    if (Object.keys(updateData).length === 0) {
      return {
        statusCode: 200,
        body: {
          success: true,
          message: 'No enrichment data found for this contact',
          domain: domain
        }
      };
    }

    // Update contact in HubSpot
    await hubspotClient.crm.contacts.basicApi.update(contactId, {
      properties: updateData
    });

    return {
      statusCode: 200,
      body: {
        success: true,
        message: 'Contact enriched successfully',
        enrichedData: updateData,
        additionalInfo: {
          seniority: jobData.seniority,
          department: jobData.department,
          companySize: companyData.size,
          enrichmentNote: enrichmentNote
        }
      }
    };

  } catch (error) {
    console.error('Enrichment error:', error);
    return {
      statusCode: 500,
      body: {
        success: false,
        error: error.message
      }
    };
  }
};

// Helper function: Extract domain from email
function extractDomain(email) {
  if (!email) return null;
  const parts = email.split('@');
  return parts.length === 2 ? parts[1].toLowerCase() : null;
}

// Helper function: Enrich company data
function enrichCompanyData(domain) {
  if (!domain) return {};
  
  // Check if domain exists in our sample data
  if (companies[domain]) {
    return companies[domain];
  }

  // Check for variations (remove www, etc)
  const cleanDomain = domain.replace('www.', '');
  if (companies[cleanDomain]) {
    return companies[cleanDomain];
  }

  // Return empty if not found
  return {};
}

// Helper function: Enrich job title
function enrichJobTitle(jobTitle) {
  if (!jobTitle) return {};

  const lowerTitle = jobTitle.toLowerCase();
  
  // Try to match patterns
  for (const pattern of jobTitles.patterns) {
    for (const keyword of pattern.keywords) {
      if (lowerTitle.includes(keyword)) {
        return {
          seniority: pattern.seniority,
          department: pattern.department
        };
      }
    }
  }

  return {};
}