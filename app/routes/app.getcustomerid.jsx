import { json } from "@remix-run/node";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, Accept, Origin",
  "Access-Control-Allow-Credentials": "true"
};

// Loader for GET requests and OPTIONS preflight
export const loader = async ({ request }) => {
  // Import server-only modules inside the loader function
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient();
  
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders
    });
  }

  const url = new URL(request.url);
  const orderId = url.searchParams.get("orderId");
  const shop = url.searchParams.get("shop");

  if (!orderId || !shop) {
    return json({ error: "Order ID and shop are required" }, { 
      status: 400,
      headers: corsHeaders 
    });
  }

  try {
    // Get session from database like in app.getquestions.jsx
    const session = await prisma.session.findFirst({
      where: { shop }
    });

    const accessToken = session?.accessToken;

    if (!accessToken) {
      console.error("❌ No access token found for shop:", shop);
      return json({ 
        error: "Authentication failed - no access token found" 
      }, { 
        status: 401,
        headers: corsHeaders 
      });
    }

    // Use direct Shopify API call instead of authenticate.admin
    const shopifyApiUrl = `https://${shop}/admin/api/2024-01/graphql.json`;

    // Construct the GraphQL query to get customer from order
    const getCustomerFromOrderQuery = `
      query getCustomerFromOrder($orderId: ID!) {
        order(id: $orderId) {
          id
          name
          customer {
            id
            email
            firstName
            lastName
            displayName
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
        query: getCustomerFromOrderQuery,
        variables: {
          orderId: orderId
        }
      })
    });

    if (!response.ok) {
      console.error("❌ Shopify API response not ok:", response.status, response.statusText);
      return json({ 
        error: `Shopify API error: ${response.status}` 
      }, { 
        status: response.status,
        headers: corsHeaders 
      });
    }

    const result = await response.json();

    if (result.errors) {
      console.error("❌ GraphQL errors:", result.errors);
      return json({ 
        error: "Failed to fetch customer from order", 
        details: result.errors 
      }, { 
        status: 400,
        headers: corsHeaders 
      });
    }

    const order = result.data?.order;
    if (!order) {
      return json({ 
        error: "Order not found" 
      }, { 
        status: 404,
        headers: corsHeaders 
      });
    }

    const customer = order.customer;
    if (!customer) {
      return json({ 
        error: "No customer associated with this order" 
      }, { 
        status: 404,
        headers: corsHeaders 
      });
    }

    return json({ 
      success: true,
      customerId: customer.id,
      customer: {
        id: customer.id,
        email: customer.email,
        firstName: customer.firstName,
        lastName: customer.lastName,
        displayName: customer.displayName
      },
      order: {
        id: order.id,
        name: order.name
      }
    }, {
      headers: corsHeaders
    });

  } catch (error) {
    console.error("❌ Error fetching customer from order:", error);
    return json({ 
      error: "Internal server error", 
      message: error.message 
    }, { 
      status: 500,
      headers: corsHeaders 
    });
  }
};
