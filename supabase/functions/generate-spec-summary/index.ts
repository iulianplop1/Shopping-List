import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
// Update the model name if needed (e.g., "gemini-1.5-flash" or "gemini-2.0-flash-exp")
const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent";

serve(async (req) => {
  try {
    const { title, specifications } = await req.json();

    if (!title || !specifications || !Array.isArray(specifications)) {
      return new Response(
        JSON.stringify({ success: false, error: "Title and specifications array are required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const specsText = specifications.join("\n");

    const prompt = `Given the following product title and specifications, create a clean, concise summary with exactly 3-5 bullet points highlighting the most important features. Return ONLY a JSON array of strings, each string being one bullet point (without the bullet symbol).

Product: ${title}

Specifications:
${specsText}

Return format: ["Feature 1", "Feature 2", "Feature 3", ...]`;

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

    const summary: string[] = JSON.parse(jsonText);

    if (!Array.isArray(summary)) {
      throw new Error("Invalid response format");
    }

    return new Response(
      JSON.stringify({
        success: true,
        summary: summary.slice(0, 5), // Ensure max 5 items
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
        error: error.message || "Failed to generate summary",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
});

