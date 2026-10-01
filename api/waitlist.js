// POST /api/waitlist
//
// Runs on Vercel as a serverless function. Any file in /api becomes one, even
// on a plain static site, so this sits next to index.html with no build step.
//
// This is the only place the Customer.io keys exist. They are read from the
// environment at runtime and never reach the browser.
//
//   CIO_SITE_ID        Customer.io -> Settings -> API Credentials -> Track API
//   CIO_API_KEY        same page, the Track API key (not the App API key)

const TRACK_API = "https://track.customer.io/api/v1/customers";

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Use POST." });
  }

  const siteId = process.env.CIO_SITE_ID;
  const apiKey = process.env.CIO_API_KEY;

  // Fail loudly here rather than returning a cheerful 200 that writes nothing.
  if (!siteId || !apiKey) {
    console.error("Missing CIO_SITE_ID or CIO_API_KEY in the environment.");
    return res.status(500).json({ error: "Server is not configured." });
  }

  // Vercel parses a JSON body for us, but a form post or a stray string can
  // still arrive, so take it either way.
  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch (e) { body = {}; }
  }

  const email = ((body && body.email) || "").trim().toLowerCase();

  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return res.status(400).json({ error: "A valid email is required." });
  }

  const auth = Buffer.from(siteId + ":" + apiKey).toString("base64");

  try {
    // The Track API upserts, so someone signing up twice updates their profile
    // instead of erroring. The email doubles as the identifier.
    const cio = await fetch(TRACK_API + "/" + encodeURIComponent(email), {
      method: "PUT",
      headers: {
        "Authorization": "Basic " + auth,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        email: email,
        signup_source: "waitlist",
        created_at: Math.floor(Date.now() / 1000)
      })
    });

    if (!cio.ok) {
      const detail = await cio.text();
      console.error("Customer.io rejected the write:", cio.status, detail);
      // Surface the upstream status so a failure is diagnosable from the
      // browser. The status only, never the body: that can echo credentials.
      return res.status(502).json({
        error: "Could not reach the mailing list.",
        customerio_status: cio.status
      });
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("Waitlist request failed:", err);
    return res.status(500).json({ error: "Something went wrong." });
  }
};
