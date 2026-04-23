const SHEET_ID = "15-MwPmN2j1vtM1xB-RFcRd_2UI74A2kHcfx-hPuAMdw";
const SHEET_GID = "0";
const SALES_LINES = {
  fibrofacil: {
    name: "MyM Fibrofacil",
    whatsappNumber: "5491159339958",
  },
  pino: {
    name: "MyM Pino",
    whatsappNumber: "5491160049643",
  },
};
const DEFAULT_LINE_KEY = "fibrofacil";

let catalog = [];
const quantities = {};
let activeCategory = "";
let searchTerm = "";
let summaryOpen = false;
let selectedIva = 0;
let scrollButtonTimer = null;
const SCROLL_BUTTON_IDLE_MS = 1400;
const SUBCATEGORY_NONE_KEY = "__sin_subcategoria__";
const textCollator = new Intl.Collator("es", { sensitivity: "base", numeric: true });
const MATERIAL_SORT_ORDER = ["melamina", "pino", "fibrofacil"];

const html = {
  root: document.documentElement,
  tabs: document.getElementById("category-tabs"),
  groups: document.getElementById("groups-container"),
  catalogScroll: document.getElementById("catalog-scroll"),
  scrollToBottom: document.getElementById("scroll-to-bottom"),
  search: document.getElementById("search-input"),
  empty: document.getElementById("empty-state"),
  summaryTotal: document.getElementById("summary-total"),
  summaryToggle: document.getElementById("summary-toggle"),
  summaryChevron: document.getElementById("summary-chevron"),
  summaryDetailsPanel: document.getElementById("summary-details-panel"),
  summaryDetailsList: document.getElementById("summary-details-list"),
  sendButton: document.getElementById("send-whatsapp"),
  ivaOptions: document.getElementById("iva-options"),
  channelBadge: document.getElementById("channel-badge"),
};

function getActiveSalesLine() {
  const params = new URLSearchParams(window.location.search);
  const lineKey = slugify(params.get("linea")) || DEFAULT_LINE_KEY;
  return SALES_LINES[lineKey] || SALES_LINES[DEFAULT_LINE_KEY];
}

const activeSalesLine = getActiveSalesLine();

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function slugify(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function parsePrice(raw) {
  if (typeof raw === "number") return raw;
  const text = String(raw || "").trim();
  if (!text) return NaN;

  const cleaned = text.replace(/[^\d.,-]/g, "");
  let normalized = cleaned;

  if (cleaned.includes(",") && cleaned.includes(".")) {
    normalized =
      cleaned.lastIndexOf(",") > cleaned.lastIndexOf(".")
        ? cleaned.replace(/\./g, "").replace(",", ".")
        : cleaned.replace(/,/g, "");
  } else if (cleaned.includes(",")) {
    normalized = /,\d{1,2}$/.test(cleaned)
      ? cleaned.replace(/\./g, "").replace(",", ".")
      : cleaned.replace(/,/g, "");
  } else if (cleaned.includes(".")) {
    normalized = /\.\d{1,2}$/.test(cleaned)
      ? cleaned.replace(/,/g, "")
      : cleaned.replace(/\./g, "");
  }

  const value = Number(normalized);
  return Number.isFinite(value) ? value : NaN;
}

function iconForMaterial(materialName) {
  const value = slugify(materialName);
  if (value.includes("pino")) return "forest";
  if (value.includes("melamina")) return "grid_view";
  if (value.includes("fibrofacil")) return "layers";
  return "inventory_2";
}

function isFibrofacilCategory(name) {
  return slugify(name) === "fibrofacil";
}

function getPromoUnits(categoryName, qty) {
  if (!isFibrofacilCategory(categoryName)) return 0;
  return Math.floor(qty / 10);
}

function formatMoney(value) {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
  }).format(value);
}

function compareText(a, b) {
  return textCollator.compare(String(a || ""), String(b || ""));
}

function materialSortIndex(materialName) {
  const normalized = slugify(materialName);
  const index = MATERIAL_SORT_ORDER.findIndex((token) => normalized.includes(token));
  return index === -1 ? MATERIAL_SORT_ORDER.length : index;
}

function compareMaterials(a, b) {
  const byOrder = materialSortIndex(a.name) - materialSortIndex(b.name);
  return byOrder !== 0 ? byOrder : compareText(a.name, b.name);
}

function setGroupsMessage(message) {
  html.groups.innerHTML = `<p class="text-sm text-slate-500">${escapeHtml(message)}</p>`;
}

function getRemainingScroll() {
  if (!html.catalogScroll) return 0;

  const containerIsScrollable = html.catalogScroll.scrollHeight - html.catalogScroll.clientHeight > 1;
  const remainingContainer = html.catalogScroll.scrollHeight - html.catalogScroll.scrollTop - html.catalogScroll.clientHeight;
  const remainingWindow =
    Math.max(
      document.documentElement.scrollHeight,
      document.body ? document.body.scrollHeight : 0
    ) -
    (window.scrollY + window.innerHeight);

  return containerIsScrollable ? remainingContainer : remainingWindow;
}

function hideScrollButton() {
  if (!html.scrollToBottom) return;
  html.scrollToBottom.classList.add("hidden");
}

function showScrollButtonTemporarily() {
  if (!html.scrollToBottom) return;
  const remaining = getRemainingScroll();
  if (remaining < 24) {
    hideScrollButton();
    return;
  }

  html.scrollToBottom.classList.remove("hidden");
  if (scrollButtonTimer) clearTimeout(scrollButtonTimer);
  scrollButtonTimer = setTimeout(() => {
    hideScrollButton();
  }, SCROLL_BUTTON_IDLE_MS);
}

function getActiveCategory() {
  return catalog.find((cat) => cat.id === activeCategory);
}

function getProductQty(id) {
  return quantities[id] || 0;
}

function updateQty(productId, delta) {
  const next = Math.max(0, getProductQty(productId) + delta);
  if (next === 0) {
    delete quantities[productId];
  } else {
    quantities[productId] = next;
  }
  render();
}

function toggleGroup(groupId) {
  const category = getActiveCategory();
  if (!category) return;
  const target = category.groups.find((g) => g.id === groupId);
  if (!target) return;
  target.open = !target.open;
  renderGroups();
}

function toggleSubcategory(groupId, subcategoryKey) {
  const category = getActiveCategory();
  if (!category) return;
  const targetGroup = category.groups.find((g) => g.id === groupId);
  if (!targetGroup) return;
  targetGroup.subOpen = targetGroup.subOpen || {};
  const current = targetGroup.subOpen[subcategoryKey];
  targetGroup.subOpen[subcategoryKey] = current === undefined ? false : !current;
  renderGroups();
}

function renderTabs() {
  if (catalog.length === 0) {
    html.tabs.innerHTML = "";
    return;
  }

  html.tabs.innerHTML = catalog
    .map((cat) => {
      const active = cat.id === activeCategory;
      return `
      <button
        data-cat="${escapeHtml(cat.id)}"
        class="flex flex-col items-center min-w-[88px] justify-center border-b-[3px] ${
          active ? "border-primary text-primary" : "border-transparent text-slate-500 dark:text-slate-400"
        } gap-1 pb-2 pt-3"
      >
        <span class="material-symbols-outlined">${escapeHtml(cat.icon)}</span>
        <p class="text-xs ${active ? "font-bold" : "font-medium"} whitespace-nowrap">${escapeHtml(cat.name)}</p>
      </button>`;
    })
    .join("");
}

function filteredProducts(group) {
  if (!searchTerm) return group.products;
  const term = searchTerm.toLowerCase();
  return group.products.filter((p) => {
    return (
      p.name.toLowerCase().includes(term) ||
      p.sku.toLowerCase().includes(term) ||
      group.name.toLowerCase().includes(term) ||
      p.subcategory.toLowerCase().includes(term)
    );
  });
}

function renderProductRow(product) {
  const qty = getProductQty(product.id);
  return `
    <div class="p-4 flex items-start justify-between gap-4">
      <div class="flex-1 min-w-0">
        <h4 class="text-sm font-semibold text-slate-800 dark:text-slate-100 break-words whitespace-normal leading-snug">${escapeHtml(product.name)}</h4>
        <p class="text-xs text-slate-500 dark:text-slate-400">SKU: ${escapeHtml(product.sku || "-")}</p>
        <p class="text-primary font-bold mt-1">${formatMoney(product.price)}</p>
      </div>
      <div class="flex shrink-0 items-center bg-slate-100 dark:bg-slate-800 rounded-lg p-1">
        <button data-action="minus" data-product="${escapeHtml(product.id)}" class="size-8 flex items-center justify-center rounded-md bg-white dark:bg-slate-700 shadow-sm text-primary">
          <span class="material-symbols-outlined text-lg">remove</span>
        </button>
        <span class="w-10 text-center font-bold text-sm dark:text-slate-100">${qty}</span>
        <button data-action="plus" data-product="${escapeHtml(product.id)}" class="size-8 flex items-center justify-center rounded-md ${
          qty > 0 ? "bg-primary text-white" : "bg-white dark:bg-slate-700 text-primary"
        } shadow-sm">
          <span class="material-symbols-outlined text-lg">add</span>
        </button>
      </div>
    </div>`;
}

function renderProductsWithSubcategories(group, products) {
  const hasSubcategories = products.some((product) => product.subcategory);
  if (!hasSubcategories) {
    return products.map(renderProductRow).join("");
  }

  group.subOpen = group.subOpen || {};
  const buckets = new Map();
  products.forEach((product) => {
    const key = product.subcategory || SUBCATEGORY_NONE_KEY;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(product);
  });

  return Array.from(buckets.entries())
    .sort(([keyA], [keyB]) => {
      if (keyA === SUBCATEGORY_NONE_KEY) return -1;
      if (keyB === SUBCATEGORY_NONE_KEY) return 1;
      return compareText(keyA, keyB);
    })
    .map(([subcategoryKey, items]) => {
      const subcategoryName =
        subcategoryKey === SUBCATEGORY_NONE_KEY ? "" : subcategoryKey;
      const rows = items.map(renderProductRow).join("");
      if (!subcategoryName) return rows;
      const isOpen =
        searchTerm.length > 0
          ? true
          : group.subOpen[subcategoryKey] === undefined
          ? false
          : group.subOpen[subcategoryKey];
      return `
        <div>
          <button
            data-subgroup="${escapeHtml(group.id)}"
            data-subgroup-key="${escapeHtml(subcategoryKey)}"
            class="w-full px-4 py-2 flex items-center justify-between text-xs font-bold uppercase tracking-wide text-slate-500 bg-slate-50 dark:bg-slate-800/60 dark:text-slate-300"
            type="button"
          >
            <span>${escapeHtml(subcategoryName)}</span>
            <span class="material-symbols-outlined text-base">${isOpen ? "expand_more" : "chevron_right"}</span>
          </button>
          ${isOpen ? rows : ""}
        </div>`;
    })
    .join("");
}

function renderGroups() {
  const category = getActiveCategory();
  if (!category) {
    html.groups.innerHTML = "";
    html.empty.classList.add("hidden");
    return;
  }

  const blocks = [];

  category.groups.forEach((group) => {
    const products = filteredProducts(group);
    if (searchTerm && products.length === 0) return;

    const productsHtml = group.open ? renderProductsWithSubcategories(group, products) : "";

    blocks.push(`
      <section class="rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
        <button data-group="${escapeHtml(group.id)}" class="w-full flex items-center justify-between p-4 ${
      group.open ? "bg-primary/5" : ""
    }">
          <div class="flex items-center gap-3">
            <span class="material-symbols-outlined text-primary">${
              group.open ? "folder_open" : "folder"
            }</span>
            <span class="font-bold text-slate-800 dark:text-slate-100">${escapeHtml(group.name)}</span>
          </div>
          <span class="material-symbols-outlined text-slate-400">${
            group.open ? "expand_more" : "chevron_right"
          }</span>
        </button>
        ${group.open ? `<div class="divide-y divide-slate-100">${productsHtml}</div>` : ""}
      </section>
    `);
  });

  html.groups.innerHTML = blocks.join("");
  html.empty.classList.toggle("hidden", blocks.length > 0);
}

function summary() {
  const selected = [];
  catalog.forEach((cat) => {
    cat.groups.forEach((group) => {
      group.products.forEach((product) => {
        const qty = getProductQty(product.id);
        if (qty > 0) {
          const promoQty = getPromoUnits(cat.name, qty);
          selected.push({ category: cat.name, group: group.name, product, qty, promoQty });
        }
      });
    });
  });

  let paidItems = 0;
  let bonusItems = 0;
  let subtotal = 0;
  let ivaAmount = 0;
  selected.forEach((item) => {
    paidItems += item.qty;
    bonusItems += item.promoQty;
    const lineSubtotal = item.qty * item.product.price;
    const lineIvaRate = isFibrofacilCategory(item.category) ? Math.max(selectedIva, 7) : selectedIva;
    const lineIva = lineSubtotal * (lineIvaRate / 100);
    subtotal += lineSubtotal;
    ivaAmount += lineIva;
  });

  return {
    selected,
    paidItems,
    bonusItems,
    totalItems: paidItems + bonusItems,
    subtotal,
    ivaAmount,
    totalPrice: subtotal + ivaAmount,
  };
}

function renderSummary() {
  const data = summary();
  html.summaryTotal.textContent = formatMoney(data.totalPrice);
  html.sendButton.disabled = data.totalItems === 0;

  if (data.selected.length === 0) {
    html.summaryDetailsList.innerHTML =
      '<p class="p-4 text-sm text-slate-500">Todavia no agregaste productos.</p>';
    summaryOpen = false;
  } else {
    html.summaryDetailsList.innerHTML = data.selected
      .map((item) => {
        const subtotal = item.qty * item.product.price;
        const promoLabel = item.promoQty > 0 ? `<p class="text-xs text-emerald-600 font-semibold">Promo: +${item.promoQty} gratis</p>` : "";
        return `
          <div class="p-4 flex items-start justify-between gap-3">
            <div class="min-w-0">
              <p class="text-sm font-semibold text-slate-800 dark:text-slate-100">${escapeHtml(item.product.name)}</p>
              <p class="text-xs text-slate-500 dark:text-slate-400">${escapeHtml(item.category)} · ${escapeHtml(
          item.group
        )}</p>
              ${promoLabel}
            </div>
            <div class="text-right shrink-0">
              <div class="flex items-center bg-slate-100 dark:bg-slate-800 rounded-lg p-1 mb-1">
                <button
                  data-summary-action="minus"
                  data-summary-product="${escapeHtml(item.product.id)}"
                  class="size-7 flex items-center justify-center rounded-md bg-white dark:bg-slate-700 shadow-sm text-primary"
                >
                  <span class="material-symbols-outlined text-base">remove</span>
                </button>
                <span class="w-8 text-center font-bold text-sm dark:text-slate-100">${item.qty}</span>
                <button
                  data-summary-action="plus"
                  data-summary-product="${escapeHtml(item.product.id)}"
                  class="size-7 flex items-center justify-center rounded-md bg-primary text-white shadow-sm"
                >
                  <span class="material-symbols-outlined text-base">add</span>
                </button>
              </div>
              <p class="text-xs text-primary font-semibold">${formatMoney(subtotal)}</p>
            </div>
          </div>`;
      })
      .join("");
  }

  html.summaryDetailsPanel.classList.toggle("hidden", !summaryOpen);
  html.summaryChevron.style.transform = summaryOpen ? "rotate(0deg)" : "rotate(180deg)";
  renderIvaOptions();
}

function renderIvaOptions() {
  const buttons = html.ivaOptions.querySelectorAll("[data-iva]");
  buttons.forEach((btn) => {
    const value = Number(btn.dataset.iva || 0);
    const active = value === selectedIva;
    btn.classList.toggle("bg-primary", active);
    btn.classList.toggle("text-white", active);
    btn.classList.toggle("border-primary", active);
    btn.classList.toggle("bg-white", !active);
    btn.classList.toggle("dark:bg-slate-800", !active);
    btn.classList.toggle("text-slate-700", !active);
    btn.classList.toggle("dark:text-slate-200", !active);
  });
}

function buildWhatsAppText() {
  const data = summary();
  const lines = [];
  const today = new Date().toLocaleString("es-AR");

  lines.push(`Hola, quiero hacer este pedido para ${activeSalesLine.name}:`);
  lines.push("");
  lines.push(`Fecha: ${today}`);
  lines.push("");

  data.selected.forEach((item) => {
    const codeLabel = item.product.sku ? ` (#${item.product.sku})` : "";
    lines.push(`* ${item.qty} x ${item.product.name}${codeLabel}`);
    if (item.promoQty > 0) {
      lines.push(`  Promo bonificada: ${item.promoQty} u.`);
    }
  });

  lines.push("");
  lines.push(`Subtotal: ${formatMoney(data.subtotal)}`);
  lines.push(`IVA: ${formatMoney(data.ivaAmount)}`);
  lines.push(`Total estimado: ${formatMoney(data.totalPrice)}`);

  return lines.join("\n");
}

function sendToWhatsApp() {
  const text = buildWhatsAppText();
  const url = `https://wa.me/${activeSalesLine.whatsappNumber}?text=${encodeURIComponent(text)}`;
  window.open(url, "_blank");
}

function applyLineBranding() {
  document.title = `${activeSalesLine.name} | Pedido Mayorista`;

  if (html.channelBadge) {
    html.channelBadge.textContent = `Linea activa: ${activeSalesLine.name}`;
    html.channelBadge.classList.remove("hidden");
  }
}

function clearOrder() {
  Object.keys(quantities).forEach((key) => delete quantities[key]);
  render();
}

function toggleTheme() {
  html.root.classList.toggle("dark");
}

function bindEvents() {
  html.tabs.addEventListener("click", (e) => {
    const button = e.target.closest("[data-cat]");
    if (!button) return;
    activeCategory = button.dataset.cat;
    render();
  });

  html.groups.addEventListener("click", (e) => {
    const groupButton = e.target.closest("[data-group]");
    if (groupButton) {
      toggleGroup(groupButton.dataset.group);
      return;
    }

    const subGroupButton = e.target.closest("[data-subgroup][data-subgroup-key]");
    if (subGroupButton) {
      toggleSubcategory(subGroupButton.dataset.subgroup, subGroupButton.dataset.subgroupKey);
      return;
    }

    const qtyButton = e.target.closest("[data-action][data-product]");
    if (!qtyButton) return;
    const productId = qtyButton.dataset.product;
    const delta = qtyButton.dataset.action === "plus" ? 1 : -1;
    updateQty(productId, delta);
  });

  html.search.addEventListener("input", (e) => {
    searchTerm = e.target.value.trim();
    renderGroups();
  });

  html.summaryToggle.addEventListener("click", () => {
    summaryOpen = !summaryOpen;
    renderSummary();
  });

  html.summaryDetailsList.addEventListener("click", (e) => {
    const button = e.target.closest("[data-summary-action][data-summary-product]");
    if (!button) return;
    const productId = button.dataset.summaryProduct;
    const delta = button.dataset.summaryAction === "plus" ? 1 : -1;
    updateQty(productId, delta);
    if (summary().totalItems > 0) summaryOpen = true;
  });

  html.ivaOptions.addEventListener("click", (e) => {
    const button = e.target.closest("[data-iva]");
    if (!button) return;
    selectedIva = Number(button.dataset.iva || 0);
    renderSummary();
  });

  html.sendButton.addEventListener("click", sendToWhatsApp);

  if (html.scrollToBottom && html.catalogScroll) {
    html.scrollToBottom.addEventListener("click", () => {
      html.catalogScroll.scrollTo({
        top: html.catalogScroll.scrollHeight,
        behavior: "smooth",
      });

      window.scrollTo({
        top: document.documentElement.scrollHeight,
        behavior: "smooth",
      });

      if (html.sendButton) {
        html.sendButton.scrollIntoView({ behavior: "smooth", block: "end" });
      }
    });

    html.catalogScroll.addEventListener("scroll", showScrollButtonTemporarily, { passive: true });
    window.addEventListener("scroll", showScrollButtonTemporarily, { passive: true });
    window.addEventListener(
      "resize",
      () => {
        if (getRemainingScroll() < 24) hideScrollButton();
      },
      { passive: true }
    );
    hideScrollButton();
  }
}

function render() {
  renderTabs();
  renderGroups();
  renderSummary();
  hideScrollButton();
}

async function loadCatalogFromSheet() {
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json&gid=${SHEET_GID}`;

  const parseSheetResponseText = (rawText) => {
    const match = rawText.match(/google\.visualization\.Query\.setResponse\((.*)\);?\s*$/s);
    if (!match) {
      throw new Error("Formato de respuesta de Google Sheets no reconocido");
    }
    return JSON.parse(match[1]);
  };

  const loadWithFetch = async () => {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`No se pudo leer la hoja (${response.status})`);
    }
    return parseSheetResponseText(await response.text());
  };

  const loadWithScript = () =>
    new Promise((resolve, reject) => {
      const previousGoogle = window.google;
      const previousSetResponse = window.google?.visualization?.Query?.setResponse;
      let settled = false;

      const cleanup = (scriptNode) => {
        if (scriptNode?.parentNode) scriptNode.parentNode.removeChild(scriptNode);
        if (window.google?.visualization?.Query) {
          window.google.visualization.Query.setResponse = previousSetResponse;
        }
      };

      window.google = window.google || {};
      window.google.visualization = window.google.visualization || {};
      window.google.visualization.Query = window.google.visualization.Query || {};
      window.google.visualization.Query.setResponse = (payload) => {
        if (settled) return;
        settled = true;
        cleanup(script);
        resolve(payload);
      };

      const script = document.createElement("script");
      script.src = `${url}&_ts=${Date.now()}`;
      script.async = true;
      script.onerror = () => {
        if (settled) return;
        settled = true;
        cleanup(script);
        if (!previousGoogle) delete window.google;
        reject(new Error("No se pudo cargar la hoja por script"));
      };

      document.head.appendChild(script);

      setTimeout(() => {
        if (settled) return;
        settled = true;
        cleanup(script);
        if (!previousGoogle) delete window.google;
        reject(new Error("Tiempo de espera agotado al cargar la hoja"));
      }, 12000);
    });

  let data;
  try {
    data = await loadWithFetch();
  } catch (_fetchError) {
    data = await loadWithScript();
  }

  const cols = data?.table?.cols || [];
  const rows = data?.table?.rows || [];

  const indexes = Object.fromEntries(cols.map((col, i) => [col.label, i]));
  const getRaw = (cells, label) => {
    const index = indexes[label];
    if (index === undefined) return "";
    const cell = cells[index];
    if (!cell || cell.v === null || cell.v === undefined) return "";
    return cell.v;
  };

  const materials = new Map();

  rows.forEach((row, rowIndex) => {
    const cells = row.c || [];
    const active = String(getRaw(cells, "activo") || "").trim().toLowerCase();
    if (active && active !== "si") return;

    const material = String(getRaw(cells, "lista_precio_1") || "").trim();
    const categoryName = String(getRaw(cells, "categoria") || "").trim();
    const subcategoryName = String(getRaw(cells, "subcategoria") || "").trim();
    const productName = String(getRaw(cells, "nombre_ia") || "").trim();
    const sku = String(getRaw(cells, "codigo") || "").trim();
    const price = parsePrice(getRaw(cells, "precio"));

    if (!material || !categoryName || !productName || !Number.isFinite(price)) return;

    const materialId = `mat-${slugify(material)}`;
    const groupId = `grp-${materialId}-${slugify(categoryName)}`;

    if (!materials.has(materialId)) {
      materials.set(materialId, {
        id: materialId,
        name: material,
        icon: iconForMaterial(material),
        groupsMap: new Map(),
      });
    }

    const materialEntry = materials.get(materialId);
    if (!materialEntry.groupsMap.has(groupId)) {
      materialEntry.groupsMap.set(groupId, {
        id: groupId,
        name: categoryName,
        open: false,
        products: [],
      });
    }

    materialEntry.groupsMap.get(groupId).products.push({
      id: `prd-${materialId}-${groupId}-${sku || slugify(productName)}-${rowIndex}`,
      name: productName,
      sku,
      price,
      subcategory: subcategoryName,
    });
  });

  return Array.from(materials.values())
    .sort(compareMaterials)
    .map((material) => ({
      id: material.id,
      name: material.name,
      icon: material.icon,
      groups: Array.from(material.groupsMap.values()).sort((a, b) =>
        compareText(a.name, b.name)
      ),
    }));
}

async function init() {
  applyLineBranding();
  bindEvents();
  setGroupsMessage("Cargando productos...");

  try {
    catalog = await loadCatalogFromSheet();
    if (!catalog.length) {
      setGroupsMessage("No hay productos disponibles en la hoja.");
      html.sendButton.disabled = true;
      return;
    }

    const melaminaCategory = catalog.find((cat) => slugify(cat.name).includes("melamina"));
    activeCategory = (melaminaCategory || catalog[0]).id;
    render();
  } catch (error) {
    console.error(error);
    const detail = error instanceof Error ? error.message : "Error desconocido";
    setGroupsMessage(`No se pudieron cargar los productos desde Google Sheets. (${detail})`);
    html.sendButton.disabled = true;
  }
}

init();
