// app/routes/app.apisavedob.jsx
import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, Accept, Origin",
  "Access-Control-Allow-Credentials": "true"
};

// Loader for GET requests and OPTIONS preflight
export const loader = async ({ request }) => {
  
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders
    });
  }
  
  return json({ message: "Customer metafield API endpoint" }, {
    headers: corsHeaders
  });
};

// Action for POST requests
export const action = async ({ request }) => {
  // Print all sessions for debugging
  const allSessions = await prisma.session.findMany();
  
  // Handle preflight OPTIONS request
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders
    });
  }

  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { 
      status: 405,
      headers: corsHeaders 
    });
  }

  try {
    
    const requestBody = await request.text();
    const { customerId, shop, dob } = JSON.parse(requestBody);
    const session = await prisma.session.findFirst({
        where: { shop }
    });

    const accessToken = session?.accessToken;

    if (!customerId || !shop || !accessToken) {
      return json({ error: "Customer ID, shop, and access token are required" }, { 
        status: 400,
        headers: corsHeaders 
      });
    }

    // Use direct Shopify API call instead of authenticate.admin
    const shopifyApiUrl = `https://${shop}/admin/api/2024-01/graphql.json`;

    // First, create metafield definition if it doesn't exist
    const createDefinition = async () => {
      const definitionMutation = `
        mutation metafieldDefinitionCreate($definition: MetafieldDefinitionInput!) {
          metafieldDefinitionCreate(definition: $definition) {
            createdDefinition {
              id
              name
              namespace
              key
            }
            userErrors {
              field
              message
            }
          }
        }
      `;

      const dobDefinition = {
        name: "Date of Birth",
        namespace: "custom",
        key: "dob",
        description: "Customer's date of birth",
        type: "single_line_text_field",
        ownerType: "CUSTOMER"
      };

      const defResponse = await fetch(shopifyApiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': accessToken
        },
        body: JSON.stringify({
          query: definitionMutation,
          variables: { definition: dobDefinition }
        })
      });

      const defResult = await defResponse.json();
      return defResult;
    };

    // Try to create definition (will fail if it already exists, which is fine)
    try {
      await createDefinition();
      console.log("✅ ACTION - Definition created or already exists");
    } catch (error) {
      console.log("⚠️ ACTION - Definition creation failed (may already exist):", error.message);
    }

    // Now set the metafield value
    const setMetafieldsMutation = `
      mutation metafieldsSet($metafields: [MetafieldsSetInput!]!) {
        metafieldsSet(metafields: $metafields) {
          metafields {
            id
            namespace
            key
            value
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    const metafields = [];
    
    if (dob) {
      metafields.push({
        ownerId: customerId,
        namespace: "custom",
        key: "dob",
        value: dob,
        type: "single_line_text_field"
      });
    }

    if (metafields.length === 0) {
      return json({ error: "No data to save" }, { 
        status: 400,
        headers: corsHeaders 
      });
    }

    const response = await fetch(shopifyApiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': accessToken
      },
      body: JSON.stringify({
        query: setMetafieldsMutation,
        variables: { metafields }
      })
    });

    const result = await response.json();

    if (result.errors) {
      return json({ 
        error: "GraphQL errors", 
        details: result.errors 
      }, { 
        status: 400,
        headers: corsHeaders 
      });
    }

    if (result.data?.metafieldsSet?.userErrors?.length > 0) {
      return json({ 
        error: "Failed to save metafields", 
        details: result.data.metafieldsSet.userErrors 
      }, { 
        status: 400,
        headers: corsHeaders 
      });
    }

    return json({ 
      success: true, 
      message: "Customer metafields saved successfully",
      metafields: result.data?.metafieldsSet?.metafields 
    }, {
      headers: corsHeaders
    });

  } catch (error) {
    console.error("❌ ACTION - Unexpected error:", error);
    console.error("❌ ACTION - Error stack:", error.stack);
    return json({ 
      error: "Internal server error", 
      message: error.message 
    }, { 
      status: 500,
      headers: corsHeaders 
    });
  }
};
