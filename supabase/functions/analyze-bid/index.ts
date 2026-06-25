import { extractText, getDocumentProxy } from "npm:unpdf";

const AICREDITS_API_KEY = Deno.env.get("AICREDITS_API_KEY");
const MODEL_ID = "anthropic/claude-sonnet-4.6";

Deno.serve(async (req) => {

  // Allow frontend to call this function
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
      },
    });
  }

  try {
    // Get file content from frontend
    const { fileBase64, fileName } = await req.json();

    if (!AICREDITS_API_KEY) {
      throw new Error("AICREDITS_API_KEY is not set in Edge Function secrets");
    }

    if (!fileBase64) {
      throw new Error("No file content received");
    }

    // Extract text from PDF using unpdf
    let extractedText = "";
    try {
      const binaryString = atob(fileBase64);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const pdf = await getDocumentProxy(bytes);
      const result = await extractText(pdf, { mergePages: true });
      extractedText = result.text;
    } catch (pdfError) {
      console.error("PDF extraction error:", pdfError);
      throw new Error("Failed to extract text from PDF: " + pdfError.message);
    }

    if (!extractedText || extractedText.trim().length === 0) {
      throw new Error("PDF text extraction returned empty content. Is this a scanned document?");
    }

    const prompt = `You are a construction bid analyzer. Here is the text extracted from the bid document:

--- START OF DOCUMENT (${fileName}) ---
${extractedText}
--- END OF DOCUMENT ---

Extract ALL of the following from this bid document and return ONLY as valid JSON with no extra text:

{
  "company_name": "name of subcontractor",
  "base_total": 000000,
  "scope_items": [
    {
      "item_name": "line item name",
      "amount": 00000,
      "status": "included or excluded"
    }
  ],
  "flags": [
    {
      "item_name": "problem item name",
      "flag_type": "scope_gap or unusual_price",
      "extracted_text": "exact words from bid",
      "gap_low": 00000,
      "gap_high": 00000,
      "recommendation": "plain english what to do"
    }
  ]
}

Return ONLY the JSON. Nothing else. No markdown code fences.`;

    const url = "https://api.aicredits.in/v1/chat/completions";

    const body = {
      model: MODEL_ID,
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.1,
    };

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${AICREDITS_API_KEY}`
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`AICredits API error (${response.status}): ${errorBody}`);
    }

    const data = await response.json();
    const responseText = data.choices?.[0]?.message?.content;

    if (!responseText) {
      throw new Error("Empty response from AICredits: " + JSON.stringify(data));
    }

    // Parse — strip markdown fences if wrapped anyway
    const cleaned = responseText
      .replace(/^```json\s*/i, "")
      .replace(/```\s*$/, "")
      .trim();

    const parsed = JSON.parse(cleaned);

    return new Response(JSON.stringify(parsed), {
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (error) {
    console.error("analyze-bid error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });
  }
});
