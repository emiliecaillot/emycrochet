/*
 * script.js – logique principale du site Emy’Crochet
 *
 * - Récupération produits depuis Google Sheet (TSV)
 * - Panier via localStorage
 * - Rendus UI (home, boutique, panier)
 * - Intégration PayPal côté front : crée/capture l’ordre via tes routes Vercel
 */

/* ===================== CONFIG GÉNÉRALE ===================== */

// Produits
const csvUrl =
  "https://docs.google.com/spreadsheets/d/1EIVyYJHayAAoAwi7UxNiX5dPNOQCisBxmD6pVenz3OA/export?format=tsv&gid=0";

// Utilise toujours le domaine Vercel où vivent tes fonctions serverless
const API_BASE = "https://emycrochet.vercel.app";

/* ===================== PRODUITS (Google Sheet) ===================== */

/**
 * Récupère et parse les produits depuis un Google Sheet publié en TSV,
 * en se basant sur les NOMS de colonnes (casse insensible).
 * Colonnes attendues : id, name, description, size, option, price, images,
 * delay_min, delay_max, featured, active
 */
async function fetchProducts() {
  const response = await fetch(csvUrl);
  const text = await response.text();
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];

  const headers = lines[0].split("\t").map((h) => h.trim().toLowerCase());
  const col = (name) => headers.indexOf(name);

  const idx = {
    id: col("id"),
    name: col("name"),
    desc: col("description"),
    size: col("size"),
    option: col("option"),
    price: col("price"),
    images: col("images"),
    dmin: col("delay_min"),
    dmax: col("delay_max"),
    featured: col("featured"),
    active: col("active"),
  };

  return lines.slice(1).map((line) => {
    const cols = line.split("\t");
    const get = (i) => (i >= 0 ? (cols[i] ?? "").trim() : "");

    const rawPrice = get(idx.price).replace(",", ".");
    const priceNum = parseFloat(rawPrice) || 0;

    const images = get(idx.images)
      ? get(idx.images)
          .split("|")
          .map((s) => s.trim())
          .filter(Boolean)
      : [];

    return {
      id: get(idx.id),
      name: get(idx.name),
      description: get(idx.desc),
      size: get(idx.size),
      option: get(idx.option),
      price: priceNum,
      images,
      delay_min: get(idx.dmin),
      delay_max: get(idx.dmax),
      featured: toBoolean(get(idx.featured)),
      active: toBoolean(get(idx.active)),
    };
  });
}

/* ===================== ATELIER – Bandeau délais dynamiques ===================== */

// Bandeau atelier
const BANNER_TSV_URL =
  "https://docs.google.com/spreadsheets/d/1KZliMVom1cloLWf4ejxw0SAkBD5l5qGiKEY8-W0Vx_M/export?format=tsv&gid=0";

function showAtelierError(msg) {
  const wrap = document.getElementById("atelier-banner");
  const textEl = document.getElementById("atelier-text");
  const noteEl = document.getElementById("atelier-note");
  const badges = document.getElementById("atelier-badges");
  if (!wrap || !textEl || !noteEl || !badges) return;
  wrap.classList.remove("hidden");
  textEl.textContent = "Erreur chargement délais.";
  noteEl.textContent = msg;
  badges.innerHTML = "";
  console.error("[Atelier]", msg);
}

async function fetchAtelierSettingsExact() {
  const res = await fetch(BANNER_TSV_URL, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const tsv = await res.text();

  const lines = tsv.trim().split(/\r?\n/);
  if (lines.length < 2) throw new Error("TSV sans données (moins de 2 lignes)");

  const headers = lines[0].split("\t").map((h) => h.trim().toLowerCase());
  const values = lines[1].split("\t").map((v) => v.trim());
  const get = (name) => {
    const i = headers.indexOf(name);
    if (i < 0) throw new Error(`Colonne absente: ${name}`);
    return values[i] ?? "";
  };

  const small_min = Number(get("small_min").replace(",", "."));
  const small_max = Number(get("small_max").replace(",", "."));
  const large_min = Number(get("large_min").replace(",", "."));
  const large_max = Number(get("large_max").replace(",", "."));
  const note = get("note");
  const updated = get("updated_at");

  return {
    small_min: Number.isFinite(small_min) ? small_min : null,
    small_max: Number.isFinite(small_max) ? small_max : null,
    large_min: Number.isFinite(large_min) ? large_min : null,
    large_max: Number.isFinite(large_max) ? large_max : null,
    note,
    updated,
  };
}

function renderAtelierBanner(data) {
  const wrap = document.getElementById("atelier-banner");
  const textEl = document.getElementById("atelier-text");
  const noteEl = document.getElementById("atelier-note");
  const badges = document.getElementById("atelier-badges");
  if (!wrap || !textEl || !noteEl || !badges) return;

  if (!data) {
    showAtelierError("Pas de données.");
    return;
  }

  const hasSmall =
    Number.isFinite(data.small_min) && Number.isFinite(data.small_max);
  const hasLarge =
    Number.isFinite(data.large_min) && Number.isFinite(data.large_max);

  if (hasSmall && hasLarge) {
    textEl.textContent =
      "Délais de confection indicatifs selon la taille de la pièce.";
  } else if (hasSmall) {
    textEl.textContent = `Environ ${data.small_min}–${data.small_max} jours ouvrés.`;
  } else if (hasLarge) {
    textEl.textContent = `Environ ${data.large_min}–${data.large_max} jours ouvrés.`;
  } else {
    textEl.textContent =
      "Délais de confection variables selon les commandes en cours.";
  }

  badges.innerHTML = "";
  if (hasSmall) {
    const b = document.createElement("span");
    b.className =
      "inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-sm bg-salmon";
    b.textContent = `Petites pièces : ${data.small_min}–${data.small_max} j`;
    badges.appendChild(b);
  }
  if (hasLarge) {
    const b = document.createElement("span");
    b.className =
      "inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full text-sm bg-sky";
    b.textContent = `Pièces + grandes : ${data.large_min}–${data.large_max} j`;
    badges.appendChild(b);
  }
  if (data.updated) {
    const b = document.createElement("span");
    b.className =
      "inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs bg-blue";
    b.textContent = `MAJ ${data.updated}`;
    badges.appendChild(b);
  }

  if (data.note) {
    noteEl.textContent = data.note;
    noteEl.classList.remove("hidden");
  } else {
    noteEl.classList.add("hidden");
  }

  wrap.classList.remove("hidden");
}

document.addEventListener("DOMContentLoaded", async () => {
  try {
    const data = await fetchAtelierSettingsExact();
    renderAtelierBanner(data);
  } catch (err) {
    showAtelierError(err.message || String(err));
  }
});

/* ===================== OUTILS GÉNÉRAUX ===================== */

function toBoolean(val) {
  if (typeof val === "boolean") return val;
  if (typeof val === "number") return val !== 0;
  if (typeof val === "string") {
    const lower = val.trim().toLowerCase();
    return lower === "true" || lower === "yes" || lower === "1";
  }
  return false;
}

/* ===================== PANIER (localStorage) ===================== */

function loadCart() {
  try {
    const stored = localStorage.getItem("cart");
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

function saveCart(cart) {
  localStorage.setItem("cart", JSON.stringify(cart));
}

function addToCart(productId) {
  const cart = loadCart();
  const existing = cart.find((item) => item.id === productId);
  if (existing) existing.qty += 1;
  else cart.push({ id: productId, qty: 1 });
  saveCart(cart);
  updateCartCount();
}

function removeFromCart(productId) {
  const cart = loadCart();
  const idx = cart.findIndex((item) => item.id === productId);
  if (idx > -1) {
    if (cart[idx].qty > 1) cart[idx].qty -= 1;
    else cart.splice(idx, 1);
    saveCart(cart);
    updateCartCount();
  }
}

function updateCartCount() {
  const countBubble = document.querySelector(".cart-count");
  if (!countBubble) return;
  const cart = loadCart();
  const count = cart.reduce((sum, item) => sum + item.qty, 0);
  countBubble.textContent = count;
  if (count > 0) countBubble.classList.remove("invisible");
  else countBubble.classList.add("invisible");
}

/* ===================== RENDUS UI ===================== */

function renderFeatured(products) {
  const container = document.getElementById("featured-container");
  if (!container) return;
  container.innerHTML = "";

  let featured = products.filter((p) => p.active && p.featured).slice(0, 3);

  if (featured.length === 0) {
    container.innerHTML =
      '<p class="text-gray-600">Aucun produit mis en avant pour le moment.</p>';
    return;
  }

  featured.forEach((product) => {
    const card = document.createElement("div");
    card.className =
      "bg-white rounded-xl shadow hover:shadow-lg transition p-2 flex flex-col";

    const img = document.createElement("img");
    img.className = "w-96 h-96 object-cover rounded-xl mb-2";
    img.src = product.images[0] || "";
    img.alt = product.name;

    const title = document.createElement("h3");
    title.className = "font-semibold text-lg mb-1 text-txt";
    title.textContent = product.name;

    const price = document.createElement("p");
    price.className = "text-[#f3988b] font-bold mb-2";
    price.textContent = product.price.toFixed(2) + " €";

    const btn = document.createElement("a");
    btn.href = `boutique.html#p-${product.id}`;
    btn.className =
      "mt-auto self-end inline-block px-3 py-1.5 text-sm rounded bg-[#f3988b] text-txt hover:scale-95 transition";
    btn.textContent = "Voir";

    card.appendChild(img);
    card.appendChild(title);
    card.appendChild(price);
    card.appendChild(btn);
    container.appendChild(card);
  });
}

function renderBoutique(products) {
  const container = document.getElementById("boutique-container");
  if (!container) return;

  container.innerHTML = "";
  const activeProducts = products.filter((p) => p.active);

  if (activeProducts.length === 0) {
    container.innerHTML =
      '<p class="text-gray-600">Aucun produit disponible pour le moment.</p>';
    return;
  }

  activeProducts.forEach((product) => {
    const card = document.createElement("div");
    card.className =
      "bg-white rounded-lg shadow hover:shadow-lg transition p-4 flex flex-col";
    card.id = `p-${product.id}`;

    if (product.images && product.images.length > 1) {
      const wrap = document.createElement("div");
      wrap.className = "relative overflow-hidden rounded mb-2";
      wrap.setAttribute("data-carousel", "");
      wrap.setAttribute("data-product-id", product.id);

      const track = document.createElement("div");
      track.className = "flex transition-transform duration-500";
      track.setAttribute("data-track", "");

      product.images.forEach((src, i) => {
        const img = document.createElement("img");
        img.src = src;
        img.alt = `${product.name} ${i + 1}`;
        img.className =
          "w-full aspect-square object-cover flex-shrink-0 basis-full";
        track.appendChild(img);
      });

      wrap.appendChild(track);

      const prev = document.createElement("button");
      prev.className =
        "absolute left-2 top-1/2 -translate-y-1/2 bg-white/80 backdrop-blur rounded-full w-8 h-8 grid place-items-center cursor-pointer";
      prev.setAttribute("data-prev", "");
      prev.setAttribute("aria-label", "Image précédente");
      prev.textContent = "‹";

      const next = document.createElement("button");
      next.className =
        "absolute right-2 top-1/2 -translate-y-1/2 bg-white/80 backdrop-blur rounded-full w-8 h-8 grid place-items-center cursor-pointer";
      next.setAttribute("data-next", "");
      next.setAttribute("aria-label", "Image suivante");
      next.textContent = "›";

      const dots = document.createElement("div");
      dots.className = "absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-2";
      dots.setAttribute("data-dots", "");

      wrap.appendChild(prev);
      wrap.appendChild(next);
      wrap.appendChild(dots);

      card.appendChild(wrap);
    } else {
      const img = document.createElement("img");
      img.className = "w-full aspect-square object-cover rounded mb-2";
      img.src = product.images?.[0] || "";
      img.alt = product.name || "Création";
      card.appendChild(img);
    }

    const title = document.createElement("h3");
    title.className = "font-semibold text-lg text-gray-800";
    title.textContent = product.name || "";
    card.appendChild(title);

    if (product.description) {
      const desc = document.createElement("p");
      desc.className = "text-gray-600 text-sm mb-2";
      desc.textContent = product.description;
      card.appendChild(desc);
    }

    if (product.size) {
      const sizeElem = document.createElement("p");
      sizeElem.className = "text-gray-500 text-sm mb-1";
      sizeElem.innerHTML =
        '<span class="font-semibold">Taille :</span> ' + product.size;
      card.appendChild(sizeElem);
    }

    if (product.option) {
      const optElem = document.createElement("p");
      optElem.className = "text-gray-500 text-sm mb-1";
      optElem.innerHTML =
        '<span class="font-semibold">Options :</span> ' + product.option;
      card.appendChild(optElem);
    }

    if (product.delay_min && product.delay_max) {
      const delay = document.createElement("p");
      delay.className = "text-gray-500 text-sm mb-2";
      delay.textContent = `Délai de fabrication : ${product.delay_min}–${product.delay_max} j ouvrés`;
      card.appendChild(delay);
    }

    const price = document.createElement("p");
    price.className = "text-[#f3988b] font-bold mb-3";
    price.textContent = (product.price || 0).toFixed(2) + " €";
    card.appendChild(price);

    const btn = document.createElement("button");
    btn.className =
      "mt-auto bg-[#f3988b] hover:scale-95 transition text-white px-4 py-2 rounded-xl";
    btn.textContent = "Ajouter au panier";
    btn.addEventListener("click", () => addToCart(product.id));
    card.appendChild(btn);

    container.appendChild(card);
  });

  initAllCarousels();

  const hash = location.hash.slice(1);
  if (hash) {
    const target = document.getElementById(hash);
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
      target.classList.add("ring-2", "ring-[#f3988b]");
      setTimeout(
        () => target.classList.remove("ring-2", "ring-[#f3988b]"),
        1200
      );
    }
  }
}

function renderCartPage(products) {
  const container = document.getElementById("cart-container");
  if (!container) return;
  container.innerHTML = "";

  const cart = loadCart();
  if (cart.length === 0) {
    container.innerHTML = '<p class="text-gray-600">Votre panier est vide.</p>';
    return;
  }

  let total = 0;

  cart.forEach((item) => {
    const product = products.find((p) => p.id === item.id);
    if (!product) return;

    const row = document.createElement("div");
    row.className =
      "flex flex-col sm:flex-row items-start sm:items-center justify-between border-b py-4";

    const info = document.createElement("div");
    info.className = "flex items-center gap-4";

    const img = document.createElement("img");
    img.className = "w-20 h-20 object-cover rounded";
    img.src = product.images[0] || "";
    img.alt = product.name;

    const details = document.createElement("div");
    details.innerHTML = `<h3 class="font-semibold text-lg">${product.name}</h3>
                         <p class="text-sm text-gray-500">${product.price.toFixed(
                           2
                         )} € x ${item.qty}</p>`;

    info.appendChild(img);
    info.appendChild(details);

    const actions = document.createElement("div");
    actions.className = "flex items-center gap-2 mt-2 sm:mt-0";

    const qty = document.createElement("span");
    qty.className = "px-2 py-1 border rounded";
    qty.textContent = item.qty;

    const minusBtn = document.createElement("button");
    minusBtn.type = "button";
    minusBtn.className =
      "px-2.5 py-1 rounded bg-gray-200 hover:bg-gray-300 text-gray-700";
    minusBtn.setAttribute("aria-label", "Retirer 1");
    minusBtn.textContent = "−";
    minusBtn.addEventListener("click", () => {
      removeFromCart(item.id);
      renderCartPage(products);
      renderNotePreview(products);
      mountPayPalButtons(products);
    });

    const plusBtn = document.createElement("button");
    plusBtn.type = "button";
    plusBtn.className =
      "px-2.5 py-1 rounded bg-gray-200 hover:bg-gray-300 text-gray-700";
    plusBtn.setAttribute("aria-label", "Ajouter 1");
    plusBtn.textContent = "+";
    plusBtn.addEventListener("click", () => {
      addToCart(item.id);
      renderCartPage(products);
      renderNotePreview(products);
      mountPayPalButtons(products);
    });

    actions.appendChild(minusBtn);
    actions.appendChild(qty);
    actions.appendChild(plusBtn);

    const subtotal = product.price * item.qty;
    total += subtotal;

    const subtotalElem = document.createElement("div");
    subtotalElem.className = "text-[#85ccd5] font-bold mt-2 sm:mt-0";
    subtotalElem.textContent = subtotal.toFixed(2) + " €";

    row.appendChild(info);
    row.appendChild(actions);
    row.appendChild(subtotalElem);
    container.appendChild(row);
  });

  const totalElem = document.createElement("div");
  totalElem.className = "text-right mt-4 font-bold text-xl [#85ccd5]";
  totalElem.textContent = "Total : " + total.toFixed(2) + " €";
  container.appendChild(totalElem);

  // Bouton "Vider le panier"
  const clearWrap = document.createElement("div");
  clearWrap.className = "mt-3 flex justify-end";

  const clearBtn = document.createElement("button");
  clearBtn.type = "button";
  clearBtn.className =
    "px-4 py-2 rounded-xl bg-red-500/50 text-white hover:bg-red-500";
  clearBtn.textContent = "Vider le panier";
  clearBtn.addEventListener("click", () => {
    saveCart([]);
    updateCartCount();
    renderCartPage(products);
    renderNotePreview(products);
    mountPayPalButtons(products);
  });

  clearWrap.appendChild(clearBtn);
  container.appendChild(clearWrap);
}

/* ===================== CARROUSEL ===================== */

function initCarousel(root) {
  const track = root.querySelector("[data-track]");
  if (!track) return;
  const slides = Array.from(track.children);
  const prev = root.querySelector("[data-prev]");
  const next = root.querySelector("[data-next]");
  const dotsWrap = root.querySelector("[data-dots]");
  let index = 0;

  if (dotsWrap) {
    slides.forEach((_, i) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className =
        "w-2.5 h-2.5 rounded-full bg-white/70 border border-white/80 hover:bg-white focus:outline-none";
      b.setAttribute("aria-label", `Aller à l'image ${i + 1}`);
      b.addEventListener("click", () => goTo(i));
      dotsWrap.appendChild(b);
    });
  }

  function update() {
    track.style.transform = `translateX(${-index * 100}%)`;
    if (dotsWrap) {
      Array.from(dotsWrap.children).forEach((d, i) => {
        d.className =
          "w-2.5 h-2.5 rounded-full border " +
          (i === index ? "bg-white" : "bg-white/70") +
          " border-white/80";
      });
    }
  }
  function goTo(i) {
    index = (i + slides.length) % slides.length;
    update();
  }

  prev?.addEventListener("click", () => goTo(index - 1));
  next?.addEventListener("click", () => goTo(index + 1));

  let startX = 0,
    dx = 0,
    touching = false;
  track.addEventListener(
    "touchstart",
    (e) => {
      touching = true;
      startX = e.touches[0].clientX;
    },
    { passive: true }
  );
  track.addEventListener(
    "touchmove",
    (e) => {
      if (!touching) return;
      dx = e.touches[0].clientX - startX;
    },
    { passive: true }
  );
  track.addEventListener("touchend", () => {
    if (Math.abs(dx) > 40) dx < 0 ? goTo(index + 1) : goTo(index - 1);
    dx = 0;
    touching = false;
  });

  update();
}

function initAllCarousels() {
  document.querySelectorAll("[data-carousel]").forEach(initCarousel);
}

/* ===================== FORMULAIRE CONTACT ===================== */

(function () {
  const ta = document.getElementById("message");
  const out = document.getElementById("msg-count");
  if (!ta || !out) return;
  const update = () => (out.textContent = String(ta.value.length));
  ta.addEventListener("input", update);
  update();
})();

(function () {
  const form = document.getElementById("contact-form");
  const btn = document.getElementById("contact-submit");
  const fb = document.getElementById("form-feedback");
  if (!form) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    fb.classList.add("hidden");
    fb.textContent = "";
    btn.disabled = true;
    btn.classList.add("opacity-60", "cursor-not-allowed");

    try {
      const formData = new FormData(form);
      const res = await fetch(form.action, {
        method: "POST",
        headers: { Accept: "application/json" },
        body: formData,
      });

      if (res.ok) {
        form.reset();
        document.getElementById("msg-count").textContent = "0";
        fb.textContent =
          "Merci ! Votre message a bien été envoyé. Je vous réponds rapidement.";
        fb.className =
          "mt-3 text-sm text-green-700 bg-green-50 border border-green-200 rounded px-3 py-2";
      } else {
        fb.textContent =
          "Oups… impossible d’envoyer le message. Réessayez ou écrivez-moi directement à emycrochet22@gmail.com.";
        fb.className =
          "mt-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2";
      }
    } catch {
      fb.textContent = "Erreur réseau. Vérifiez votre connexion et réessayez.";
      fb.className =
        "mt-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2";
    } finally {
      btn.disabled = false;
      btn.classList.remove("opacity-60", "cursor-not-allowed");
    }
  });
})();

/* ===================== PAYPAL ===================== */

/** Construit la charge utile items pour le serveur (id + quantity) */
function buildPayPalItemsFromCart() {
  const cart = loadCart();
  return cart.map((it) => ({
    id: String(it.id),
    quantity: Math.max(1, Number(it.qty) || 1),
  }));
}

/** Helpers pour appeler tes routes Vercel */
async function createOrderOnServer(items) {
  const res = await fetch(`${API_BASE}/api/create-order`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ items }),
  });
  if (!res.ok)
    throw new Error(`create-order ${res.status} ${await res.text()}`);
  const data = await res.json();
  return data.id; // orderID PayPal
}

async function captureOrderOnServer(orderID) {
  const res = await fetch(`${API_BASE}/api/capture-order`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ orderID }),
  });
  if (!res.ok)
    throw new Error(`capture-order ${res.status} ${await res.text()}`);
  return res.json();
}

/** Affiche une petite note récap dans la zone PayPal (facultatif) */
function renderNotePreview(products) {
  const zone = document.getElementById("paypal-zone");
  if (!zone) return;
  const cart = loadCart();
  if (!cart.length) return;

  const old = zone.querySelector(".note-preview");
  if (old) old.remove();

  const ul = document.createElement("ul");
  ul.className = "mt-3 text-sm text-gray-600 list-disc pl-5";
  cart.forEach((it) => {
    const p = products.find((x) => x.id === it.id);
    const li = document.createElement("li");
    li.textContent = `${p?.name || "Article"} — x${it.qty}`;
    ul.appendChild(li);
  });

  const wrap = document.createElement("div");
  wrap.className =
    "note-preview mt-3 p-3 bg-gray-50 border border-gray-200 rounded";
  const title = document.createElement("div");
  title.className = "text-xs font-medium text-gray-700 mb-1";
  title.textContent = "Contenu de votre commande :";
  wrap.appendChild(title);
  wrap.appendChild(ul);
  zone.appendChild(wrap);
}

/** Monte le bouton PayPal (une seule fois) */
async function mountPayPalButtons(products) {
  const zone = document.getElementById("paypal-button-container");
  if (!zone) return;
  if (!window.paypal) return;

  zone.innerHTML = "";

  const cart = loadCart();
  if (!cart.length) {
    const p = document.createElement("p");
    p.className = "text-sm text-gray-600";
    p.textContent = "Ajoutez des articles pour activer le paiement PayPal.";
    zone.appendChild(p);
    return;
  }

  const items = buildPayPalItemsFromCart();

  window.paypal
    .Buttons({
      style: { layout: "vertical", shape: "pill", label: "paypal" },

      createOrder: async () => {
        return await createOrderOnServer(items);
      },

      onApprove: async ({ orderID }) => {
        await captureOrderOnServer(orderID);
        saveCart([]);
        updateCartCount();
        location.href = "merci.html";
      },

      onError: (err) => {
        console.error("PayPal error:", err);
        alert("Impossible de lancer le paiement PayPal.");
      },
    })
    .render("#paypal-button-container");
}

/* ===================== BOOTSTRAP PAGES ===================== */

document.addEventListener("DOMContentLoaded", () => {
  updateCartCount();
  const page = document.body.dataset.page;

  fetchProducts().then((products) => {
    if (page === "home") {
      renderFeatured(products);
    } else if (page === "boutique") {
      renderBoutique(products);
    } else if (page === "cart") {
      renderCartPage(products);
      renderNotePreview(products);
      window.__lastProducts = products;

      if (window.paypal) {
        mountPayPalButtons(products);
      } else {
        // Déclenché par l'attribut onload du script PayPal dans panier.html
        window.addEventListener(
          "paypalLoaded",
          () => mountPayPalButtons(products),
          { once: true }
        );
      }
    }
  });
});
