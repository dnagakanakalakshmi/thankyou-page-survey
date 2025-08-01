import { json } from "@remix-run/node";
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

  const url = new URL(request.url);
  const customerId = url.searchParams.get("customerId");
  const shop = url.searchParams.get("shop");

  if (!customerId || !shop) {
    return json({ error: "Customer ID and shop are required" }, { 
      status: 400,
      headers: corsHeaders
    });
  }

  try {
    // Get session from database like in apishopify.jsx
    const session = await prisma.session.findFirst({
      where: { shop },
      orderBy: { expires: "desc" },
    });

    if (!session || !session.accessToken) {
      return json({ error: "Authentication required. Please reinstall the app." }, {
        status: 401,
        headers: corsHeaders
      });
    }

    // Get active questions from prisma
    let storeQuestions = await prisma.storeQuestions.findUnique({
      where: { shop },
    });

    if (!storeQuestions) {
      return json({ questions: [] }, {
        headers: corsHeaders
      });
    }

    const questions = JSON.parse(storeQuestions.questions || "[]");
    const activeQuestions = questions.filter(q => q.isActive);

    if (activeQuestions.length === 0) {
      return json({ questions: [] }, {
        headers: corsHeaders
      });
    }

    // Get customer metafields to check which questions already have answers using direct API call
    const shopifyApiUrl = `https://${shop}/admin/api/2024-01/graphql.json`;

    const customerMetafieldsQuery = `
      query getCustomerMetafields($id: ID!) {
        customer(id: $id) {
          metafields(first: 250) {
            edges {
              node {
                key
                value
                namespace
              }
            }
          }
        }
      }
    `;

    const customerMetafieldsResponse = await fetch(shopifyApiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': session.accessToken
      },
      body: JSON.stringify({
        query: customerMetafieldsQuery,
        variables: {
          id: `gid://shopify/Customer/${customerId}`,
        }
      })
    });

    const customerMetafieldsData = await customerMetafieldsResponse.json();

    if (customerMetafieldsData.errors) {
      return json({ 
        error: "GraphQL errors", 
        details: customerMetafieldsData.errors 
      }, { 
        status: 400,
        headers: corsHeaders 
      });
    }

    // Extract existing metafield keys for customer answers
    const existingAnswerKeys = [];
    if (customerMetafieldsData.data?.customer?.metafields?.edges) {
      customerMetafieldsData.data.customer.metafields.edges.forEach(edge => {
        if (edge.node.namespace === "custom") {
          existingAnswerKeys.push(edge.node.key);
        }
      });
    }

    // Filter out questions that already have answers (using sanitized title as key)
    const unansweredQuestions = activeQuestions.filter(question => {
      const sanitizedTitle = question.title.toString().replace(/\s+/g, "").toLowerCase();
      return !existingAnswerKeys.includes(sanitizedTitle);
    });

    // Get the count setting from the database (default to 0 means show all)
    const count = storeQuestions.count || 0;
    
    // Limit questions based on count setting
    let questionsToSend = unansweredQuestions;
    if (count > 0) {
      // If count is set, limit to that number or the available unanswered questions (whichever is smaller)
      questionsToSend = unansweredQuestions.slice(0, Math.min(count, unansweredQuestions.length));
    }

    // Ensure all questions include the options field for select types
    const questionsWithOptions = questionsToSend.map(question => ({
      ...question,
      options: question.options || null // Ensure options field is present
    }));
    
    return json({ questions: questionsWithOptions }, {
      headers: corsHeaders
    });

  } catch (error) {
    console.error("❌ LOADER - Error fetching customer metafields:", error);
    return json({ error: "Failed to fetch customer data" }, { 
      status: 500,
      headers: corsHeaders
    });
  }
};

// Action for POST requests
export const action = async ({ request }) => {
  
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
    
    const { customerId, shop, answers } = JSON.parse(requestBody);

    if (!customerId || !shop) {
      return json({ error: "Customer ID and shop are required" }, { 
        status: 400,
        headers: corsHeaders
      });
    }

    if (!answers) {
      return json({ error: "Answers are required" }, { 
        status: 400,
        headers: corsHeaders
      });
    }

    // Get session from database like in apisavedob.jsx
    const session = await prisma.session.findFirst({
      where: { shop }
    });

    const accessToken = session?.accessToken;

    if (!accessToken) {
      return json({ error: "Authentication required. Please reinstall the app." }, { 
        status: 401,
        headers: corsHeaders 
      });
    }

    // Use direct Shopify API call like in apisavedob.jsx
    const shopifyApiUrl = `https://${shop}/admin/api/2024-01/graphql.json`;

    // First, create metafield definitions if they don't exist (like in apisavedob.jsx)
    const createDefinitions = async (metafieldsToCreate) => {
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

      // Create definition for each unique metafield key
      const uniqueKeys = [...new Set(metafieldsToCreate.map(m => m.key))];
      
      for (const key of uniqueKeys) {
        const definition = {
          name: key.charAt(0).toUpperCase() + key.slice(1), // Capitalize first letter
          namespace: "custom",
          key: key,
          description: `Survey question answer: ${key}`,
          type: "single_line_text_field",
          ownerType: "CUSTOMER"
        };

        try {
          const defResponse = await fetch(shopifyApiUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Shopify-Access-Token': accessToken
            },
            body: JSON.stringify({
              query: definitionMutation,
              variables: { definition }
            })
          });

          const defResult = await defResponse.json();
        } catch (error) {
          console.log(`⚠️ ACTION - Definition creation failed for ${key} (may already exist):`, error.message);
        }
      }
    };

    const metafieldsToCreate = [];

    // Prepare metafields for each answer using sanitized title as key
    Object.entries(answers).forEach(([questionTitle, answer]) => {
      if (answer && answer.trim() !== "") {
        // Sanitize the title like in questions.jsx - remove spaces and convert to lowercase
        const sanitizedTitle = questionTitle.toString().replace(/\s+/g, "").toLowerCase();
        
        metafieldsToCreate.push({
          ownerId: `gid://shopify/Customer/${customerId}`,
          namespace: "custom",
          key: sanitizedTitle,
          value: answer.toString(),
          type: "single_line_text_field"
        });
      }
    });

    if (metafieldsToCreate.length === 0) {
      return json({ message: "No valid answers to save" }, {
        headers: corsHeaders
      });
    }

    // Create metafield definitions first (like in apisavedob.jsx)
    try {
      await createDefinitions(metafieldsToCreate);
    } catch (error) {
      console.log("⚠️ ACTION - Definition creation failed (may already exist):", error.message);
    }

    // Use metafieldsSet mutation like in apisavedob.jsx
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

    const response = await fetch(shopifyApiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': accessToken
      },
      body: JSON.stringify({
        query: setMetafieldsMutation,
        variables: { metafields: metafieldsToCreate }
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
        error: "Failed to save answers", 
        details: result.data.metafieldsSet.userErrors 
      }, { 
        status: 400,
        headers: corsHeaders
      });
    }

    return json({ 
      success: true,
      message: "Answers saved successfully",
      savedCount: metafieldsToCreate.length,
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
