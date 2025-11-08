import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
// Update the model name if needed (e.g., "gemini-1.5-flash" or "gemini-2.0-flash-exp")
const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent";

interface Alternative {
  name: string;
  price: number;
  description?: string;
}

serve(async (req) => {
  try {
    const { title, price, category } = await req.json();

    if (!title || price === undefined) {
      return new Response(
        JSON.stringify({ success: false, error: "Title and price are required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const prompt = `Find 3-5 alternative products that are similar to or cheaper alternatives to the following product. Return ONLY a valid JSON array of objects with this exact structure:
[
  {
    "name": "Product name",
    "price": number (estimated price, numeric value only),
    "description": "Brief description or key difference (optional)"
  },
  ...
]

Product to find alternatives for:
- Title: ${title}
- Price: $${price}
${category ? `- Category: ${category}` : ""}

Focus on finding products that are either cheaper alternatives or similar quality options. Include estimated prices if possible.`;

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

    // Extract JSON array from response
    let jsonText = responseText.trim();
    if (jsonText.startsWith("```json")) {
      jsonText = jsonText.replace(/```json\n?/g, "").replace(/```\n?/g, "");
    } else if (jsonText.startsWith("```")) {
      jsonText = jsonText.replace(/```\n?/g, "");
    }

    const alternatives: Alternative[] = JSON.parse(jsonText);

    if (!Array.isArray(alternatives)) {
      throw new Error("Invalid response format");
    }

    // Validate and clean alternatives
    const cleanedAlternatives = alternatives
      .slice(0, 5)
      .map(alt => ({
        name: alt.name || "Unknown Product",
        price: typeof alt.price === "number" && !isNaN(alt.price) ? alt.price : null,
        description: alt.description || null,
      }));

    return new Response(
      JSON.stringify({
        success: true,
        alternatives: cleanedAlternatives,
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
        error: error.message || "Failed to find alternatives",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
});

