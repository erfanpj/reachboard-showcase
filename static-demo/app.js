const CREDIT = "RB credits";

const PACKAGES = [
  {
    slug: "northline-sound",
    title: "Northline Sound",
    channel: "Podcast network",
    placement: "Mid-roll weekly tech show (~45k downloads/ep)",
    deliverable: "Host-read 60s + show-notes link",
    payable: 40,
  },
  {
    slug: "echo-weekly",
    title: "Echo Weekly",
    channel: "Newsletter",
    placement: "Hero slot above the fold (18k opens)",
    deliverable: "Logo lockup, 120-word blurb, one CTA",
    payable: 35,
  },
  {
    slug: "harbor-post",
    title: "Harbor Post",
    channel: "Regional newspaper",
    placement: "Quarter-page print + digital sidebar",
    deliverable: "Print PDF + 300×250 banner",
    payable: 28,
  },
  {
    slug: "citrus-fm",
    title: "Citrus FM",
    channel: "FM radio",
    placement: "Drive-time rotation (6 spots/week)",
    deliverable: "15s spot + traffic mention",
    payable: 22,
  },
  {
    slug: "ledger-daily",
    title: "Ledger Daily",
    channel: "Business daily",
    placement: "Finance footer strip Mon–Fri",
    deliverable: "Text + monochrome logo",
    payable: 31,
  },
  {
    slug: "vivid-stream",
    title: "Vivid Stream",
    channel: "Live stream",
    placement: "Pre-roll on two sponsored streams",
    deliverable: "20s bumper + pinned chat link",
    payable: 26,
  },
];

let cart = [];
let status = "empty cart";

function cartTotal() {
  return cart.reduce((sum, line) => sum + line.payable * line.qty, 0);
}

function renderCompare() {
  const slugs = ["echo-weekly", "northline-sound"];
  const row = document.getElementById("compareRow");
  row.innerHTML = slugs
    .map((slug) => {
      const p = PACKAGES.find((x) => x.slug === slug);
      return `<div class="pkg-card"><p class="channel">${p.channel}</p><strong>${p.title}</strong><p>${p.placement}</p><p>${p.deliverable}</p><p class="total">${p.payable} ${CREDIT}</p></div>`;
    })
    .join("");
}

function renderPackages(filter) {
  const q = (filter || "").trim().toLowerCase();
  const root = document.getElementById("packages");
  root.innerHTML = "";
  PACKAGES.filter(
    (p) =>
      !q ||
      p.title.toLowerCase().includes(q) ||
      p.channel.toLowerCase().includes(q) ||
      p.slug.includes(q),
  ).forEach((p) => {
    const div = document.createElement("div");
    div.className = "card pkg-card";
    div.innerHTML = `<p class="channel">${p.channel}</p><strong>${p.title}</strong>
      <p>${p.placement}</p><p>${p.deliverable}</p>
      <p class="total">${p.payable} ${CREDIT}</p>
      <button type="button" data-add="${p.slug}">Add</button>
      <button type="button" class="secondary" data-remove="${p.slug}">Remove</button>`;
    root.appendChild(div);
  });
  root.querySelectorAll("[data-add]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const pkg = PACKAGES.find((p) => p.slug === btn.dataset.add);
      const line = cart.find((l) => l.slug === pkg.slug);
      if (line) line.qty += 1;
      else cart.push({ ...pkg, qty: 1 });
      renderCart();
    });
  });
  root.querySelectorAll("[data-remove]").forEach((btn) => {
    btn.addEventListener("click", () => {
      cart = cart.filter((l) => l.slug !== btn.dataset.remove);
      renderCart();
    });
  });
}

function renderCart() {
  const total = cartTotal();
  const count = cart.reduce((n, l) => n + l.qty, 0);
  document.getElementById("cartTotal").textContent = `Cart total: ${total} ${CREDIT} · ${count} item${count === 1 ? "" : "s"}`;
  const ul = document.getElementById("cartLines");
  ul.innerHTML = cart
    .map((l) => `<li>${l.title} — ${l.payable} ${CREDIT} × ${l.qty}</li>`)
    .join("");
  document.getElementById("status").textContent = status;
}

document.getElementById("filter").addEventListener("input", (e) => {
  renderPackages(e.target.value);
});

document.getElementById("toDraft").addEventListener("click", () => {
  status = cart.length ? "draft campaign (simulated)" : "empty cart";
  renderCart();
});

document.getElementById("submit").addEventListener("click", () => {
  if (status.startsWith("draft")) status = "awaiting payment (simulated)";
  renderCart();
});

document.getElementById("reset").addEventListener("click", () => {
  cart = [];
  status = "empty cart";
  renderCart();
});

renderCompare();
renderPackages("");
renderCart();
