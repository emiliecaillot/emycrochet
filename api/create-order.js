// Node 18+ (Vercel)
// Crée un ordre PayPal à partir du panier validé côté serveur.

const PAYPAL_CLIENT_ID = process.env.PAYPAL_CLIENT_ID; // SANDBOX
const PAYPAL_SECRET = process.env.PAYPAL_SECRET; // SANDBOX
const PAYPAL_API = "https://api-m.sandbox.paypal.com"; // SANDBOX

// Ton Google Sheet publié en TSV (colonnes: id | name | price)
const CSV_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vQi8LisKQjdMENRFQqMfnoWzipbBQOJwUOtT7qYuiSnLVWeS3w4KQ-WUcgjcqDpGpl0xZWF9RaCd2cv/pub?output=tsv";

export default async function handler(req, res) {
  // CORS pour appels depuis 127.0.0.1
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    if (req.method !== "POST")
      return res.status(405).json({ error: "Method Not Allowed" });

    const { items } = req.body || {};
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "No items" });
    }

    // 1) Récupère le catalogue (id, name, price) depuis le Sheet
    const tsv = await (await fetch(CSV_URL, { cache: "no-store" })).text();
    const lines = tsv.trim().split(/\r?\n/);
    const headers = lines[0].split("\t").map((h) => h.trim().toLowerCase());
    const idx = {
      id: headers.indexOf("id"),
      name: headers.indexOf("name"),
      price: headers.indexOf("price"),
    };

    const catalog = new Map();
    for (const line of lines.slice(1)) {
      const cols = line.split("\t");
      const id = (cols[idx.id] || "").trim();
      const name = (cols[idx.name] || "").trim();
      const price = parseFloat((cols[idx.price] || "0").replace(",", ".")) || 0;
      if (id) catalog.set(String(id), { name, price });
    }

    // 2) Valide les items reçus
    let total = 0;
    const validatedItems = [];

    for (const it of items) {
      const id = String(it.id);
      const qty = Math.max(1, parseInt(it.quantity, 10) || 1);
      const cat = catalog.get(id);
      if (!cat || !Number.isFinite(cat.price) || cat.price <= 0) {
        return res
          .status(400)
          .json({ error: `Unknown or invalid item: ${id}` });
      }
      total += cat.price * qty;
      validatedItems.push({
        name: (cat.name || "Article").substring(0, 127),
        quantity: String(qty),
        unit_amount: { currency_code: "EUR", value: cat.price.toFixed(2) },
        sku: id.substring(0, 127),
        category: "PHYSICAL_GOODS",
      });
    }

    // 3) OAuth PayPal
    const basic = Buffer.from(`${PAYPAL_CLIENT_ID}:${PAYPAL_SECRET}`).toString(
      "base64"
    );
    const tokenRes = await fetch(`${PAYPAL_API}/v1/oauth2/token`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${basic}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
    });
    if (!tokenRes.ok) {
      const text = await tokenRes.text();
      return res
        .status(500)
        .json({ error: "PayPal auth failed", detail: text });
    }
    const tokenData = await tokenRes.json();

    // 4) Crée l’ordre
    const orderRes = await fetch(`${PAYPAL_API}/v2/checkout/orders`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        intent: "CAPTURE",
        purchase_units: [
          {
            amount: {
              currency_code: "EUR",
              value: total.toFixed(2),
              breakdown: {
                item_total: { currency_code: "EUR", value: total.toFixed(2) },
              },
            },
            items: validatedItems,
          },
        ],
      }),
    });
    if (!orderRes.ok) {
      const text = await orderRes.text();
      return res
        .status(500)
        .json({ error: "PayPal create failed", detail: text });
    }
    const orderData = await orderRes.json();
    return res.status(200).json({ id: orderData.id });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Internal error" });
  }
}
