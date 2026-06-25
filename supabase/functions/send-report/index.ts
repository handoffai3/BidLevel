import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const resendApiKey = Deno.env.get("RESEND_API_KEY");

serve(async (req) => {
  // CORS Headers
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
      },
    });
  }

  try {
    const { toEmail, pdfBase64, projectName, bidsCount, gapsCount, lowestBid } = await req.json();

    if (!toEmail || !pdfBase64) {
      throw new Error("Missing required fields: toEmail, pdfBase64");
    }

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${resendApiKey}`,
      },
      body: JSON.stringify({
        from: "reports@bidclear.com", // This might need to be verified in Resend or a test sender
        to: toEmail,
        subject: `Bid Leveling Report — ${projectName}`,
        html: `
          <p>Please find attached the bid leveling summary for <strong>${projectName}</strong>.</p>
          <ul>
            <li>${bidsCount} bids compared</li>
            <li>${gapsCount} scope gaps identified</li>
            <li>Recommended award: ${lowestBid}</li>
          </ul>
          <p>Prepared by Harbor Construction Group using BidClear.</p>
        `,
        attachments: [
          {
            filename: `${projectName.replace(/\s+/g, "_")}_Report.pdf`,
            content: pdfBase64.split(",")[1] || pdfBase64, // remove data URI prefix if present
          },
        ],
      }),
    });

    if (!res.ok) {
      const errorData = await res.text();
      throw new Error(`Resend API Error: ${errorData}`);
    }

    const data = await res.json();

    return new Response(JSON.stringify({ success: true, data }), {
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
      status: 200,
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
      status: 500,
    });
  }
});
