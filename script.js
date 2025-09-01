/*
 * script.js – Version Vitrine (optimisée) pour Emy’Crochet
 *
 * ✅ Récupération produits depuis Google Sheet (TSV)
 * ✅ Bandeau "Atelier" (délais dynamiques)
 * ✅ Rendus UI (home, boutique) avec carrousel
 * ✅ Formulaire de contact (envoi via form action)
 * ✅ Lazy-loading des images + hints (sizes, width/height, decoding)
 * ✅ Carrousel paresseux : seule la 1re image charge immédiatement
 * ✅ IntersectionObserver : promotion data-src → src quand la carte est visible
 * ✅ Priorité réseau sur les 3 premières cartes produits
 */

/* ===================== CONFIG GÉNÉRALE ===================== */

// Produits
const csvUrl =
  "https://docs.google.com/spreadsheets/d/1EIVyYJHayAAoAwi7UxNiX5dPNOQCisBxmD6pVenz3OA/export?format=tsv&gid=0";

/* ===================== UTILITAIRES ===================== */

function toBoolean(val) {
  if (typeof val === "boolean") return val;
  if (typeof val === "number") return val !== 0;
  if (typeof val === "string") {
    const lower = val.trim().toLowerCase();
    return lower === "true" || lower === "yes" || lower === "1";
  }
  return false;
}

/** Donne au navigateur tous les indices utiles pour bien charger l’image. */
function tuneImg(img, { sizes, w = 800, h = 800, priority = false } = {}) {
  img.loading = priority ? "eager" : "lazy";
  img.decoding = "async";
  if (sizes) img.sizes = sizes;
  // Dimensions déclarées => moins de CLS + meilleur scheduling réseau
  img.width = w;
  img.height = h;
  if (priority) img.fetchPriority = "high";
}

/* ===================== PRODUITS (Google Sheet) ===================== */

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
    // nouvelle colonne : category OU categories
    category:
      (headers.indexOf("category") !== -1 && headers.indexOf("category")) ||
      (headers.indexOf("categories") !== -1 && headers.indexOf("categories")) ||
      -1,
  };

  return lines.slice(1).map((line) => {
    const cols = line.split("\t");
    const get = (i) => (i >= 0 ? (cols[i] ?? "").trim() : "");

    // Prix (support virgule)
    const rawPrice = get(idx.price).replace(",", ".");
    const priceNum = parseFloat(rawPrice) || 0;

    // Images (séparateur |)
    const images = get(idx.images)
      ? get(idx.images)
          .split("|")
          .map((s) => s.trim())
          .filter(Boolean)
      : [];

    // Catégories (séparateur | ou ,)
    const catsRaw = get(idx.category);
    const categories = catsRaw
      ? catsRaw
          .split(/[|,]/)
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
      categories, // ⬅️ nouveau champ exploitable pour les filtres
    };
  });
}

/* ============ CATEGORIES (helpers + état) ============ */

// Ordre suggéré en tête (le reste sera trié alpha)
const PREFERRED_CAT_ORDER = ["Animal", "Décoration", "Peluche", "Bébé"];

// État global simple
let __ALL_PRODUCTS = [];
let __SELECTED_CATS = new Set(); // valeurs en lower-case

function norm(s) {
  return (s || "").toLowerCase();
}

function getAllCategories(products) {
  const set = new Set();
  products.forEach((p) => (p.categories || []).forEach((c) => set.add(c)));
  // On remet d’abord l’ordre préféré, puis les autres alpha
  const preferred = PREFERRED_CAT_ORDER.filter((c) => set.has(c));
  const others = [...set]
    .filter((c) => !PREFERRED_CAT_ORDER.includes(c))
    .sort((a, b) => a.localeCompare(b));
  return [...preferred, ...others];
}

function isProductInSelectedCats(product) {
  if (!__SELECTED_CATS.size) return true; // aucun filtre => tout passe
  const cats = (product.categories || []).map((c) => c.toLowerCase());
  // une seule catégorie sélectionnée => contient ?
  const [sel] = Array.from(__SELECTED_CATS);
  return cats.includes(sel);
}

function filterProductsByCats(products) {
  return products.filter((p) => p.active && isProductInSelectedCats(p));
}

// FONCTION CATEGORIE FILTRE
function renderCategoryFilters(products) {
  const wrap = document.getElementById("category-filters");
  if (!wrap) return;

  wrap.innerHTML = "";

  const allCats = getAllCategories(products);

  // Bouton "Tous"
  const btnAll = document.createElement("button");
  btnAll.type = "button";
  btnAll.className =
    "px-3 py-1.5 rounded-full border text-sm hover:bg-gray-50 data-[active=true]:bg-[#85ccd5] data-[active=true]:text-white cursor-pointer";
  btnAll.textContent = "Tous";
  btnAll.dataset.active = String(__SELECTED_CATS.size === 0);
  btnAll.addEventListener("click", () => {
    __SELECTED_CATS.clear();
    // Mettre à jour l'état visuel
    wrap
      .querySelectorAll("button")
      .forEach((b) => (b.dataset.active = "false"));
    btnAll.dataset.active = "true";
    refreshBoutique();
  });
  wrap.appendChild(btnAll);

  // Boutons par catégorie
  allCats.forEach((cat) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className =
      "px-3 py-1.5 rounded-full border text-sm hover:bg-gray-50 data-[active=true]:bg-[#85ccd5] data-[active=true]:text-white cursor-pointer";
    b.textContent = cat;
    b.dataset.cat = cat;
    b.dataset.active = String(__SELECTED_CATS.has(norm(cat)));

    b.addEventListener("click", () => {
      const key = norm(cat);
      const alreadyActive =
        __SELECTED_CATS.has(key) && __SELECTED_CATS.size === 1;

      // 1) Si on reclique sur la même catégorie active => retire le filtre (montre tout)
      if (alreadyActive) {
        __SELECTED_CATS.clear();
      } else {
        // 2) Sinon, sélection EXCLUSIVE : on remplace par la nouvelle catégorie
        __SELECTED_CATS.clear();
        __SELECTED_CATS.add(key);
      }

      // MAJ visuelle : un seul actif (ou aucun)
      const wrap = document.getElementById("category-filters");
      wrap
        .querySelectorAll("button")
        .forEach((btn) => (btn.dataset.active = "false"));
      // Active l’unique cat si on en a une
      if (__SELECTED_CATS.size === 1) {
        b.dataset.active = "true";
        // le bouton "Tous" doit être inactif
        const btnAll = wrap.querySelector("button:first-child");
        if (btnAll) btnAll.dataset.active = "false";
      } else {
        // aucun filtre -> bouton "Tous" actif
        const btnAll = wrap.querySelector("button:first-child");
        if (btnAll) btnAll.dataset.active = "true";
      }

      refreshBoutique();
    });

    wrap.appendChild(b);
  });
}

function refreshBoutique() {
  const filtered = filterProductsByCats(__ALL_PRODUCTS);
  renderBoutique(filtered);
}

/* ===================== ATELIER – Bandeau délais dynamiques ===================== */

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

/* ===================== RENDUS UI (VITRINE) ===================== */

function renderFeatured(products) {
  const container = document.getElementById("featured-container");
  if (!container) return;
  container.innerHTML = "";

  const featured = products.filter((p) => p.active && p.featured).slice(0, 3);

  if (featured.length === 0) {
    container.innerHTML =
      '<p class="text-gray-600">Aucune création mise en avant pour le moment.</p>';
    return;
  }

  featured.forEach((product, idx) => {
    const card = document.createElement("div");
    card.className =
      "bg-white rounded-xl shadow hover:shadow-lg transition p-2 flex flex-col";

    const img = document.createElement("img");
    img.className = "w-96 h-96 object-cover rounded-xl mb-2";
    img.alt = product.name;
    // Priorité sur la 1re carte (souvent au-dessus du fold)
    tuneImg(img, {
      sizes: "(max-width: 640px) 90vw, 24rem",
      w: 768,
      h: 768,
      priority: idx === 0,
    });
    img.src = product.images[0] || "";

    const title = document.createElement("h3");
    title.className = "font-semibold text-lg mb-1 text-txt";
    title.textContent = product.name;

    const price = document.createElement("p");
    price.className = "text-[#f3988b] font-bold mb-2";
    price.textContent =
      typeof product.price === "number" && !isNaN(product.price)
        ? product.price.toFixed(2) + " €"
        : "";

    const btn = document.createElement("a");
    btn.href = `boutique.html#p-${product.id}`;
    btn.className =
      "mt-auto self-end inline-block px-3 py-1.5 text-sm rounded bg-[#f3988b] text-white hover:scale-95 transition";
    btn.textContent = "Voir la création";

    card.appendChild(img);
    card.appendChild(title);
    if (price.textContent) card.appendChild(price);
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
      '<p class="text-gray-600">Aucune création disponible pour le moment.</p>';
    return;
  }

  activeProducts.forEach((product, index) => {
    const priority = index < 3; // prioriser les 3 premières cartes visibles

    const card = document.createElement("div");
    card.className =
      "bg-white rounded-lg shadow hover:shadow-lg transition p-4 flex flex-col";
    card.id = `p-${product.id}`;

    // Carrousel multiple images – seule la 1re est chargée immédiatement
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
        img.alt = `${product.name} ${i + 1}`;
        img.className =
          "w-full aspect-square object-cover flex-shrink-0 basis-full";

        // Hints d'image cohérents
        tuneImg(img, {
          sizes: "(max-width:640px) 100vw, (max-width:1024px) 50vw, 33vw",
          w: 800,
          h: 800,
          priority: priority && i === 0, // priorité seulement sur la 1re slide des 3 premières cartes
        });

        if (i === 0) {
          img.src = src; // charge seulement la première slide
        } else {
          img.dataset.src = src; // les autres seront promues plus tard
        }
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
      img.alt = product.name || "Création";
      tuneImg(img, {
        sizes: "(max-width:640px) 100vw, (max-width:1024px) 50vw, 33vw",
        w: 800,
        h: 800,
        priority, // priorité sur les 3 premières cartes
      });
      img.src = product.images?.[0] || "";
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

    if (typeof product.price === "number" && !isNaN(product.price)) {
      const price = document.createElement("p");
      price.className = "text-[#338896] font-bold mb-3";
      price.textContent = product.price.toFixed(2) + " €";
      card.appendChild(price);
    }

    const ctaWrap = document.createElement("div");
    ctaWrap.className = "mt-auto flex flex-wrap gap-2";
    const contactBtn = document.createElement("a");
    contactBtn.href = "contact.html";
    contactBtn.className =
      "inline-block bg-[#85ccd5] text-white px-4 py-2 rounded-xl hover:scale-95 transition";
    contactBtn.textContent = "Prendre contact";
    ctaWrap.appendChild(contactBtn);

    card.appendChild(ctaWrap);

    container.appendChild(card);
  });

  initAllCarousels();
  setupCardObserver(); // <-- charge les images data-src quand les cartes deviennent visibles

  // Scroll vers un produit si hash présent
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
      b.addEventListener("click", () => {
        goTo(i);
        ensureSlideLoaded(i); // garantit que la slide cliquée est chargée
      });
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

  function ensureSlideLoaded(i) {
    const slide = slides[i];
    if (!slide) return;
    const img = slide.tagName === "IMG" ? slide : slide.querySelector("img");
    if (img && img.dataset && img.dataset.src && !img.src) {
      img.src = img.dataset.src;
      img.removeAttribute("data-src");
    }
  }

  prev?.addEventListener("click", () => {
    goTo(index - 1);
    ensureSlideLoaded(index); // charge la slide de destination si besoin
  });
  next?.addEventListener("click", () => {
    goTo(index + 1);
    ensureSlideLoaded(index);
  });

  // Évènements tactiles
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
    if (Math.abs(dx) > 40) {
      if (dx < 0) {
        goTo(index + 1);
      } else {
        goTo(index - 1);
      }
      ensureSlideLoaded(index);
    }
    dx = 0;
    touching = false;
  });

  update();
}

function initAllCarousels() {
  document.querySelectorAll("[data-carousel]").forEach(initCarousel);
}

/* ===================== LAZY PROMOTION & OBSERVER ===================== */

function promoteLazyImgs(root) {
  const imgs = root.querySelectorAll("img[data-src]");
  imgs.forEach((img) => {
    if (!img.src) img.src = img.dataset.src;
    img.removeAttribute("data-src");
  });
}

// Observe les cartes produits pour charger leurs images quand elles entrent dans le viewport
function setupCardObserver() {
  const cards = document.querySelectorAll("#boutique-container > div");
  if (!("IntersectionObserver" in window) || !cards.length) return;

  const io = new IntersectionObserver(
    (entries, obs) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          promoteLazyImgs(entry.target);
          obs.unobserve(entry.target);
        }
      });
    },
    { rootMargin: "600px 0px" } // pré-charge nettement avant l’entrée à l’écran
  );

  cards.forEach((card) => io.observe(card));
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
        const counter = document.getElementById("msg-count");
        if (counter) counter.textContent = "0";
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

/* ===================== BOOTSTRAP PAGES (VITRINE) ===================== */

document.addEventListener("DOMContentLoaded", () => {
  const page = document.body.dataset.page; // "home" | "boutique" | autre

  fetchProducts().then((products) => {
    if (page === "home") {
      renderFeatured(products);
    } else if (page === "boutique") {
      __ALL_PRODUCTS = products;
      __SELECTED_CATS = new Set();

      // 🔹 Pré-sélection via ?cat=xxx
      const params = new URLSearchParams(location.search);
      const pre = params.get("cat");
      if (pre) {
        const first = pre
          .split(/[|,]/)
          .map((s) => s.trim())
          .filter(Boolean)[0];
        if (first) {
          __SELECTED_CATS.add(first.toLowerCase());
        }
      }

      // Ensuite on rend les filtres + la boutique
      renderCategoryFilters(__ALL_PRODUCTS);
      refreshBoutique();
    }
  });
});
