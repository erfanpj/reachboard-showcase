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
/** Frozen at draft review; unchanged by later cart edits until reset. */
let campaignSnapshot = null;

function cartTotal(lines = cart) {
  return lines.reduce((sum, line) => sum + line.payable * line.qty, 0);
}

function isSubmittedPhase() {
  return status.includes("awaiting payment");
}

function isDraftPhase() {
  return status.startsWith("draft campaign");
}

function cartEditingLocked() {
  return isSubmittedPhase();
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
  const locked = cartEditingLocked();
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
      <button type="button" data-add="${p.slug}" ${locked ? "disabled" : ""}>Add</button>
      <button type="button" class="secondary" data-remove="${p.slug}" ${locked ? "disabled" : ""}>Remove</button>`;
    root.appendChild(div);
  });
  if (locked) {
    const note = document.createElement("p");
    note.className = "muted";
    note.textContent =
      "Submitted campaign is locked. Reset the simulation to shop again.";
    root.appendChild(note);
  }
  root.querySelectorAll("[data-add]:not([disabled])").forEach((btn) => {
    btn.addEventListener("click", () => {
      const pkg = PACKAGES.find((p) => p.slug === btn.dataset.add);
      const line = cart.find((l) => l.slug === pkg.slug);
      if (line) line.qty += 1;
      else cart.push({ ...pkg, qty: 1 });
      renderCart();
    });
  });
  root.querySelectorAll("[data-remove]:not([disabled])").forEach((btn) => {
    btn.addEventListener("click", () => {
      cart = cart.filter((l) => l.slug !== btn.dataset.remove);
      renderCart();
    });
  });
}

function renderCart() {
  const snapBlock = document.getElementById("campaignSnapshot");
  const shoppingPanel = document.getElementById("shoppingCartPanel");
  const flowActions = document.getElementById("flowActions");
  const resetBtn = document.getElementById("reset");

  if (campaignSnapshot && (isDraftPhase() || isSubmittedPhase())) {
    snapBlock.hidden = false;
    document.getElementById("snapshotTotal").textContent = `${campaignSnapshot.total} ${CREDIT}`;
    document.getElementById("snapshotLines").innerHTML = campaignSnapshot.lines
      .map((l) => `<li>${l.title} — ${l.payable} ${CREDIT} × ${l.qty}</li>`)
      .join("");
  } else {
    snapBlock.hidden = true;
  }

  shoppingPanel.hidden = isSubmittedPhase();
  flowActions.hidden = isSubmittedPhase();

  const total = cartTotal();
  const count = cart.reduce((n, l) => n + l.qty, 0);
  document.getElementById("cartTotal").textContent = `Cart total: ${total} ${CREDIT} · ${count} item${count === 1 ? "" : "s"}`;
  document.getElementById("cartLines").innerHTML = cart
    .map((l) => `<li>${l.title} — ${l.payable} ${CREDIT} × ${l.qty}</li>`)
    .join("");
  document.getElementById("status").textContent = status;
  document.getElementById("submit").disabled = !isDraftPhase();
  document.getElementById("toDraft").disabled = isSubmittedPhase();
  resetBtn.hidden = false;
  resetBtn.disabled = false;
}

document.getElementById("filter").addEventListener("input", (e) => {
  renderPackages(e.target.value);
});

document.getElementById("toDraft").addEventListener("click", () => {
  if (!cart.length) {
    status = "empty cart";
    campaignSnapshot = null;
  } else {
    campaignSnapshot = {
      lines: cart.map((l) => ({ ...l })),
      total: cartTotal(),
    };
    status = "draft campaign (simulated)";
  }
  renderCart();
  renderPackages(document.getElementById("filter").value);
});

document.getElementById("submit").addEventListener("click", () => {
  if (isDraftPhase() && campaignSnapshot) {
    status = "awaiting payment (simulated)";
  }
  renderCart();
  renderPackages(document.getElementById("filter").value);
});

document.getElementById("reset").addEventListener("click", () => {
  cart = [];
  campaignSnapshot = null;
  status = "empty cart";
  document.getElementById("filter").value = "";
  renderCart();
  renderPackages("");
});

renderCompare();
renderPackages("");
renderCart();
