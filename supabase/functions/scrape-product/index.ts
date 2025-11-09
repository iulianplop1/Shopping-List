import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
// Update the model name if needed (e.g., "gemini-1.5-flash" or "gemini-2.0-flash-exp")
const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent";

interface ProductData {
  product_title: string;
  price: number;
  main_image_url: string;
  list_of_specifications: string[];
  suggested_category?: string;
}

serve(async (req) => {
  try {
    const { url } = await req.json();

    if (!url) {
      return new Response(
        JSON.stringify({ success: false, error: "URL is required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Fetch the webpage HTML
    const htmlResponse = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
      }
    });

    if (!htmlResponse.ok) {
      throw new Error(`Failed to fetch URL: ${htmlResponse.statusText}`);
    }

    const html = await htmlResponse.text();

    // Extract text content (simplified - in production, you might want to use a proper HTML parser)
    const textContent = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .substring(0, 50000); // Limit to 50k chars for Gemini

    // Call Gemini API to extract product information
    const prompt = `Extract product information from the following webpage content. Return ONLY a valid JSON object with this exact structure:
{
  "product_title": "string",
  "price": number (numeric value in EUR, convert from other currencies if needed),
  "main_image_url": "string (full URL)",
  "list_of_specifications": ["string", "string", ...],
  "suggested_category": "string (one word category like Tech, Home, Apparel, etc.)"
}

IMPORTANT REQUIREMENTS:
- Price: CRITICAL - Extract the actual current price. Look for price patterns like "€", "EUR", "$", "USD", "DKK", "kr", "£", "GBP", etc. Convert to EUR if needed (1 EUR ≈ 7.5 DKK, 1 EUR ≈ 1.1 USD, 1 EUR ≈ 0.85 GBP). If price is not found, use null.

Webpage content:
${textContent}

If you cannot find certain information, use null for that field. Price should be a number in EUR.`;

    const geminiResponse = await fetch(
      `${GEMINI_API_URL}?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: prompt,
                },
              ],
            },
          ],
        }),
      }
    );

    if (!geminiResponse.ok) {
      const errorText = await geminiResponse.text();
      throw new Error(`Gemini API error: ${errorText}`);
    }

    const geminiData = await geminiResponse.json();
    const responseText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!responseText) {
      throw new Error("No response from Gemini API");
    }

    // Extract JSON from response (handle markdown code blocks)
    let jsonText = responseText.trim();
    if (jsonText.startsWith("```json")) {
      jsonText = jsonText.replace(/```json\n?/g, "").replace(/```\n?/g, "");
    } else if (jsonText.startsWith("```")) {
      jsonText = jsonText.replace(/```\n?/g, "");
    }

    const productData: ProductData = JSON.parse(jsonText);

    // Validate and clean the data
    if (!productData.product_title) {
      productData.product_title = "Unknown Product";
    }

    if (typeof productData.price !== "number" || isNaN(productData.price)) {
      productData.price = 0;
    }

    if (!Array.isArray(productData.list_of_specifications)) {
      productData.list_of_specifications = [];
    }

    return new Response(
      JSON.stringify({
        success: true,
        product: productData,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || "Failed to scrape product",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
});

