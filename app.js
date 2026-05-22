/* HidroSed v0.1 - Vanilla JS, sin dependencias externas */
const $ = (id) => document.getElementById(id);
const fmt = (v, d = 3) => Number.isFinite(v) ? Number(v).toFixed(d) : "";
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

const state = {
  projectName: "Tramo de río",
  globals: {
    q: 40,
    slope: 0.0022,
    n: 0.035,
    tr: 100,
    gammaS: 2650,
    gammaMix: 1.00,
    gammaW: 1000,
    g: 9.81
  },
  sections: [],
  activeIndex: 0,
  gradation: [
    { d: 0.18, p: 5 }, { d: 0.30, p: 10 }, { d: 0.60, p: 30 },
    { d: 1.20, p: 50 }, { d: 2.40, p: 84 }, { d: 3.20, p: 90 }, { d: 8.0, p: 100 }
  ],
  results: []
};

let tempPointsPx = [];
let isDrawing = false;
let bgImage = null;
let bgImageDataUrl = null;

function defaultSection(i, spacing = 20) {
  return {
    id: `SEC-${String(i * spacing).padStart(4, "0")}`,
    distance: i * spacing,
    q: state.globals.q,
    slope: state.globals.slope,
    n: state.globals.n,
    manualB: 20,
    manualH: 1.5,
    mu: 1.0,
    isCurve: false,
    curveSide: "exterior",
    curveFactor: 1.15,
    d50: 1.2,
    d84: 2.4,
    d90: 3.2,
    dm: 1.2,
    widthScale: 60,
    heightScale: 8,
    zBottom: 0,
    points: [],
    bgImage: null,
    note: ""
  };
}

function init() {
  bindEvents();
  generateSections(5, 20);
  syncGlobalsFromInputs();
  renderAll();
  redrawCanvas();
  calculateGradation();
}

function bindEvents() {
  document.querySelectorAll(".tab").forEach(btn => {
    btn.addEventListener("click", () => switchTab(btn.dataset.tab));
  });

  $("btnGenerateSections").addEventListener("click", () => {
    const n = parseInt($("numSections").value || "1", 10);
    const spacing = parseFloat($("defaultSpacing").value || "0");
    generateSections(n, spacing);
    renderAll();
    redrawCanvas();
  });
  $("btnAddSection").addEventListener("click", () => {
    const spacing = parseFloat($("defaultSpacing").value || "20");
    state.sections.push(defaultSection(state.sections.length, spacing));
    state.activeIndex = state.sections.length - 1;
    renderAll();
    loadActiveSectionToCanvas();
  });

  ["projectName", "globalQ", "globalSlope", "globalN", "returnPeriod", "gammaS", "gammaMix"].forEach(id => {
    $(id).addEventListener("input", () => syncGlobalsFromInputs());
  });
  $("btnApplyGlobal").addEventListener("click", () => {
    syncGlobalsFromInputs();
    state.sections.forEach(s => {
      s.q = state.globals.q;
      s.slope = state.globals.slope;
      s.n = state.globals.n;
    });
    renderSectionsTable();
  });

  $("activeSection").addEventListener("change", e => {
    state.activeIndex = parseInt(e.target.value, 10);
    loadActiveSectionToCanvas();
    updateSectionStatus();
  });

  const canvas = $("sectionCanvas");
  canvas.addEventListener("pointerdown", pointerDown);
  canvas.addEventListener("pointermove", pointerMove);
  window.addEventListener("pointerup", () => { isDrawing = false; });
  canvas.addEventListener("dblclick", () => {
    tempPointsPx.pop();
    redrawCanvas();
  });

  ["scaleX", "scaleY", "zBottom"].forEach(id => $(id).addEventListener("input", () => redrawCanvas()));
  $("btnClearCanvas").addEventListener("click", () => { tempPointsPx = []; redrawCanvas(); updatePointStatus(); });
  $("btnSaveGeometry").addEventListener("click", saveGeometryToActiveSection);
  $("btnSortPoints").addEventListener("click", () => {
    tempPointsPx.sort((a, b) => a.x - b.x);
    redrawCanvas();
  });
  $("btnExampleSection").addEventListener("click", loadExampleSection);
  $("imageInput").addEventListener("change", handleImageUpload);
  $("btnRemoveImage").addEventListener("click", () => { bgImage = null; bgImageDataUrl = null; redrawCanvas(); });

  $("btnAddGrain").addEventListener("click", () => {
    state.gradation.push({ d: 1, p: 50 });
    renderGrainTable(); calculateGradation();
  });
  $("btnExampleGrain").addEventListener("click", () => {
    state.gradation = [
      { d: 0.18, p: 5 }, { d: 0.30, p: 10 }, { d: 0.60, p: 30 },
      { d: 1.20, p: 50 }, { d: 2.40, p: 84 }, { d: 3.20, p: 90 }, { d: 8.0, p: 100 }
    ];
    renderGrainTable(); calculateGradation();
  });
  $("btnApplyGrain").addEventListener("click", applyGrainToSections);

  $("btnRun1").addEventListener("click", runCalculations);
  $("btnRun2").addEventListener("click", runCalculations);
  $("btnExportCsv").addEventListener("click", exportCSV);
  $("btnReport").addEventListener("click", exportReportHTML);
  $("btnExportJson").addEventListener("click", exportJSON);
  $("jsonImport").addEventListener("change", importJSON);
  $("btnSaveLocal").addEventListener("click", () => { localStorage.setItem("hidrosed-state", JSON.stringify(state)); alert("Proyecto guardado en este navegador."); });
  $("btnLoadLocal").addEventListener("click", loadLocal);
}

function switchTab(tab) {
  document.querySelectorAll(".tab").forEach(b => b.classList.toggle("active", b.dataset.tab === tab));
  document.querySelectorAll(".tab-panel").forEach(p => p.classList.remove("active"));
  $(`tab-${tab}`).classList.add("active");
  if (tab === "drawing") setTimeout(redrawCanvas, 50);
  if (tab === "gradation") setTimeout(drawGrainCurve, 50);
  if (tab === "results") setTimeout(drawProfile, 50);
}

function syncGlobalsFromInputs() {
  state.projectName = $("projectName").value || "Tramo de río";
  state.globals.q = parseFloat($("globalQ").value || "0");
  state.globals.slope = parseFloat($("globalSlope").value || "0");
  state.globals.n = parseFloat($("globalN").value || "0.035");
  state.globals.tr = parseFloat($("returnPeriod").value || "100");
  state.globals.gammaS = parseFloat($("gammaS").value || "2650");
  state.globals.gammaMix = parseFloat($("gammaMix").value || "1");
}

function generateSections(n, spacing) {
  state.sections = [];
  for (let i = 0; i < n; i++) state.sections.push(defaultSection(i, spacing));
  state.activeIndex = 0;
}

function renderAll() {
  $("projectName").value = state.projectName;
  $("globalQ").value = state.globals.q;
  $("globalSlope").value = state.globals.slope;
  $("globalN").value = state.globals.n;
  $("returnPeriod").value = state.globals.tr;
  $("gammaS").value = state.globals.gammaS;
  $("gammaMix").value = state.globals.gammaMix;
  renderActiveSelect();
  renderSectionsTable();
  renderGrainTable();
  updateSectionStatus();
}

function renderActiveSelect() {
  const sel = $("activeSection");
  sel.innerHTML = state.sections.map((s, i) => `<option value="${i}">${s.id} · ${s.distance} m</option>`).join("");
  sel.value = String(state.activeIndex);
}

function renderSectionsTable() {
  const rows = state.sections.map((s, i) => `
    <tr>
      <td><input data-i="${i}" data-k="id" value="${s.id}" /></td>
      <td><input class="tiny" type="number" step="1" data-i="${i}" data-k="distance" value="${s.distance}" /></td>
      <td><input class="tiny" type="number" step="0.01" data-i="${i}" data-k="q" value="${s.q}" /></td>
      <td><input class="tiny" type="number" step="0.0001" data-i="${i}" data-k="slope" value="${s.slope}" /></td>
      <td><input class="tiny" type="number" step="0.001" data-i="${i}" data-k="n" value="${s.n}" /></td>
      <td><input class="tiny" type="number" step="0.1" data-i="${i}" data-k="manualB" value="${s.manualB}" /></td>
      <td><input class="tiny" type="number" step="0.01" data-i="${i}" data-k="manualH" value="${s.manualH}" /></td>
      <td><input class="tiny" type="number" step="0.01" data-i="${i}" data-k="d50" value="${s.d50}" /></td>
      <td><input class="tiny" type="number" step="0.01" data-i="${i}" data-k="d84" value="${s.d84}" /></td>
      <td><input class="tiny" type="number" step="0.01" data-i="${i}" data-k="d90" value="${s.d90}" /></td>
      <td><input class="tiny" type="number" step="0.01" data-i="${i}" data-k="dm" value="${s.dm}" /></td>
      <td><input class="tiny" type="number" step="0.01" data-i="${i}" data-k="mu" value="${s.mu}" /></td>
      <td><select data-i="${i}" data-k="isCurve"><option value="false" ${!s.isCurve ? "selected" : ""}>No</option><option value="true" ${s.isCurve ? "selected" : ""}>Sí</option></select></td>
      <td><select data-i="${i}" data-k="curveSide"><option value="interior" ${s.curveSide === "interior" ? "selected" : ""}>Interior</option><option value="exterior" ${s.curveSide === "exterior" ? "selected" : ""}>Exterior</option></select></td>
      <td><input class="tiny" type="number" step="0.01" data-i="${i}" data-k="curveFactor" value="${s.curveFactor}" /></td>
      <td>${s.points && s.points.length > 1 ? `<span class="badge ok">${s.points.length} pts</span>` : `<span class="badge">manual</span>`}</td>
      <td><button class="ghost" data-action="select" data-i="${i}">Editar</button></td>
      <td><button class="ghost danger" data-action="delete" data-i="${i}">Eliminar</button></td>
    </tr>
  `).join("");
  $("sectionsTable").innerHTML = `
    <thead><tr>
      <th>Sección</th><th>Dist. m</th><th>Q</th><th>J/S</th><th>n</th><th>B manual</th><th>h manual</th>
      <th>D50 mm</th><th>D84 mm</th><th>D90 mm</th><th>Dm mm</th><th>μ</th><th>Curva</th><th>Lado</th><th>Factor</th><th>Geom.</th><th></th><th></th>
    </tr></thead><tbody>${rows}</tbody>`;
  $("sectionsTable").querySelectorAll("input,select").forEach(el => el.addEventListener("input", updateSectionFromCell));
  $("sectionsTable").querySelectorAll("button").forEach(btn => btn.addEventListener("click", tableButtonAction));
  renderActiveSelect();
}

function updateSectionFromCell(e) {
  const i = parseInt(e.target.dataset.i, 10);
  const k = e.target.dataset.k;
  let v = e.target.value;
  if (["distance", "q", "slope", "n", "manualB", "manualH", "d50", "d84", "d90", "dm", "mu", "curveFactor"].includes(k)) v = parseFloat(v || "0");
  if (k === "isCurve") v = e.target.value === "true";
  state.sections[i][k] = v;
  renderActiveSelect();
}

function tableButtonAction(e) {
  const i = parseInt(e.currentTarget.dataset.i, 10);
  const action = e.currentTarget.dataset.action;
  if (action === "select") {
    state.activeIndex = i;
    renderActiveSelect();
    switchTab("drawing");
    loadActiveSectionToCanvas();
  }
  if (action === "delete" && state.sections.length > 1) {
    state.sections.splice(i, 1);
    state.activeIndex = clamp(state.activeIndex, 0, state.sections.length - 1);
    renderSectionsTable();
    loadActiveSectionToCanvas();
  }
}

function activeSection() { return state.sections[state.activeIndex]; }

function loadActiveSectionToCanvas() {
  const s = activeSection();
  $("scaleX").value = s.widthScale || 60;
  $("scaleY").value = s.heightScale || 8;
  $("zBottom").value = s.zBottom || 0;
  tempPointsPx = (s.points || []).map(realToPx);
  bgImageDataUrl = s.bgImage || null;
  if (bgImageDataUrl) {
    bgImage = new Image();
    bgImage.onload = redrawCanvas;
    bgImage.src = bgImageDataUrl;
  } else {
    bgImage = null;
  }
  redrawCanvas();
  updatePointStatus();
}

function pointerPos(e) {
  const rect = $("sectionCanvas").getBoundingClientRect();
  const scaleX = $("sectionCanvas").width / rect.width;
  const scaleY = $("sectionCanvas").height / rect.height;
  return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
}
function pointerDown(e) {
  isDrawing = true;
  const p = pointerPos(e);
  tempPointsPx.push(p);
  redrawCanvas();
}
function pointerMove(e) {
  if (!isDrawing) return;
  if ($("drawMode").value === "pencil") {
    const p = pointerPos(e);
    const last = tempPointsPx[tempPointsPx.length - 1];
    if (!last || Math.hypot(p.x - last.x, p.y - last.y) > 4) tempPointsPx.push(p);
    redrawCanvas();
  }
}

function pxToReal(p) {
  const W = $("sectionCanvas").width, H = $("sectionCanvas").height;
  const sx = parseFloat($("scaleX").value || "60");
  const sy = parseFloat($("scaleY").value || "8");
  const zb = parseFloat($("zBottom").value || "0");
  return { x: p.x / W * sx, z: zb + (1 - p.y / H) * sy };
}
function realToPx(p) {
  const W = $("sectionCanvas").width, H = $("sectionCanvas").height;
  const sx = parseFloat($("scaleX").value || "60");
  const sy = parseFloat($("scaleY").value || "8");
  const zb = parseFloat($("zBottom").value || "0");
  return { x: p.x / sx * W, y: (1 - (p.z - zb) / sy) * H };
}

function redrawCanvas() {
  const canvas = $("sectionCanvas");
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  if (bgImage) {
    ctx.globalAlpha = 0.55;
    ctx.drawImage(bgImage, 0, 0, canvas.width, canvas.height);
    ctx.globalAlpha = 1;
  }
  drawGrid(ctx, canvas.width, canvas.height);
  if (tempPointsPx.length) {
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#0f766e";
    ctx.fillStyle = "#0f766e";
    ctx.beginPath();
    tempPointsPx.forEach((p, idx) => idx ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
    ctx.stroke();
    tempPointsPx.forEach((p, idx) => {
      ctx.beginPath(); ctx.arc(p.x, p.y, idx === 0 || idx === tempPointsPx.length - 1 ? 5 : 3, 0, Math.PI * 2); ctx.fill();
    });
  }
  updatePointStatus();
}

function drawGrid(ctx, w, h) {
  ctx.save();
  ctx.strokeStyle = "#e5e7eb";
  ctx.lineWidth = 1;
  for (let x = 0; x <= w; x += w / 10) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
  for (let y = 0; y <= h; y += h / 8) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
  ctx.fillStyle = "#64748b";
  ctx.font = "13px system-ui";
  ctx.fillText("0 m", 8, h - 8);
  ctx.fillText(`${$("scaleX").value || 60} m`, w - 58, h - 8);
  ctx.fillText(`cota ${$("zBottom").value || 0} m`, 8, h - 26);
  ctx.restore();
}

function updatePointStatus() {
  $("pointStatus").textContent = `${tempPointsPx.length} puntos digitalizados.`;
}
function updateSectionStatus() {
  const s = activeSection();
  $("sectionStatus").innerHTML = s && s.points && s.points.length > 1
    ? `Geometría guardada: <strong>${s.points.length}</strong> puntos · ${s.id}`
    : `Sin geometría guardada. Se usará B=${s?.manualB || ""} m y h=${s?.manualH || ""} m.`;
}

function saveGeometryToActiveSection() {
  const s = activeSection();
  if (tempPointsPx.length < 2) { alert("Debe dibujar al menos 2 puntos de sección."); return; }
  const pts = tempPointsPx.map(pxToReal).sort((a, b) => a.x - b.x);
  s.points = simplifyPoints(pts, 0.03);
  s.widthScale = parseFloat($("scaleX").value || "60");
  s.heightScale = parseFloat($("scaleY").value || "8");
  s.zBottom = parseFloat($("zBottom").value || "0");
  s.bgImage = bgImageDataUrl;
  const minZ = Math.min(...s.points.map(p => p.z));
  const maxX = Math.max(...s.points.map(p => p.x));
  const minX = Math.min(...s.points.map(p => p.x));
  s.manualB = Math.max(0.1, maxX - minX);
  s.manualH = Math.max(0.1, (Math.max(...s.points.map(p => p.z)) - minZ) * 0.55);
  updateSectionStatus();
  renderSectionsTable();
  alert(`Geometría guardada en ${s.id}: ${s.points.length} puntos.`);
}

function simplifyPoints(pts, tol = 0.02) {
  if (pts.length < 3) return pts;
  const out = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) {
    const a = out[out.length - 1], b = pts[i];
    if (Math.hypot(a.x - b.x, a.z - b.z) >= tol) out.push(b);
  }
  out.push(pts[pts.length - 1]);
  return out;
}

function handleImageUpload(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    bgImageDataUrl = reader.result;
    bgImage = new Image();
    bgImage.onload = redrawCanvas;
    bgImage.src = bgImageDataUrl;
  };
  reader.readAsDataURL(file);
}

function loadExampleSection() {
  const W = $("sectionCanvas").width, H = $("sectionCanvas").height;
  tempPointsPx = [
    { x: 30, y: H * .35 }, { x: 120, y: H * .48 }, { x: 240, y: H * .62 },
    { x: 380, y: H * .72 }, { x: 520, y: H * .66 }, { x: 690, y: H * .55 },
    { x: 850, y: H * .44 }, { x: W - 30, y: H * .38 }
  ];
  redrawCanvas();
}

function renderGrainTable() {
  const rows = state.gradation.map((g, i) => `
    <tr>
      <td>${i + 1}</td>
      <td><input type="number" step="0.001" data-i="${i}" data-k="d" value="${g.d}" /></td>
      <td><input type="number" step="0.1" data-i="${i}" data-k="p" value="${g.p}" /></td>
      <td><button class="ghost danger" data-i="${i}">Eliminar</button></td>
    </tr>`).join("");
  $("grainTable").innerHTML = `<thead><tr><th>#</th><th>Diámetro (mm)</th><th>% que pasa</th><th></th></tr></thead><tbody>${rows}</tbody>`;
  $("grainTable").querySelectorAll("input").forEach(el => el.addEventListener("input", e => {
    const i = parseInt(e.target.dataset.i, 10);
    const k = e.target.dataset.k;
    state.gradation[i][k] = parseFloat(e.target.value || "0");
    calculateGradation();
  }));
  $("grainTable").querySelectorAll("button").forEach(btn => btn.addEventListener("click", e => {
    const i = parseInt(e.currentTarget.dataset.i, 10);
    state.gradation.splice(i, 1);
    renderGrainTable(); calculateGradation();
  }));
}

function sortedGradation() {
  return state.gradation
    .filter(g => Number.isFinite(g.d) && g.d > 0 && Number.isFinite(g.p))
    .sort((a, b) => a.p - b.p);
}

function percentileD(percent) {
  const arr = sortedGradation();
  if (arr.length < 2) return NaN;
  if (percent <= arr[0].p) return arr[0].d;
  if (percent >= arr[arr.length - 1].p) return arr[arr.length - 1].d;
  for (let i = 1; i < arr.length; i++) {
    if (percent <= arr[i].p) {
      const a = arr[i - 1], b = arr[i];
      const t = (percent - a.p) / (b.p - a.p || 1);
      const logD = Math.log10(a.d) + t * (Math.log10(b.d) - Math.log10(a.d));
      return Math.pow(10, logD);
    }
  }
  return NaN;
}

function calculateGradation() {
  const d10 = percentileD(10), d16 = percentileD(16), d30 = percentileD(30), d50 = percentileD(50), d60 = percentileD(60), d84 = percentileD(84), d90 = percentileD(90);
  const dm = d50;
  const cu = d60 / d10;
  const cc = (d30 * d30) / (d10 * d60);
  $("grainSummary").innerHTML = [
    ["D10", d10], ["D16", d16], ["D30", d30], ["D50", d50], ["D60", d60], ["D84", d84], ["D90", d90], ["Dm LL", dm], ["Cu", cu], ["Cc", cc]
  ].map(([k, v]) => `<div class="metric"><strong>${fmt(v, 3)}</strong><span>${k}${k.startsWith("D") ? " mm" : ""}</span></div>`).join("");
  drawGrainCurve();
  return { d10, d16, d30, d50, d60, d84, d90, dm, cu, cc };
}

function applyGrainToSections() {
  const g = calculateGradation();
  state.sections.forEach(s => {
    if (Number.isFinite(g.d50)) s.d50 = g.d50;
    if (Number.isFinite(g.d84)) s.d84 = g.d84;
    if (Number.isFinite(g.d90)) s.d90 = g.d90;
    if (Number.isFinite(g.dm)) s.dm = g.dm;
  });
  renderSectionsTable();
}

function drawGrainCurve() {
  const c = $("grainCanvas"); if (!c) return;
  const ctx = c.getContext("2d");
  ctx.clearRect(0, 0, c.width, c.height);
  ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height);
  const arr = sortedGradation();
  if (arr.length < 2) return;
  const pad = 44;
  const minD = Math.min(...arr.map(g => g.d));
  const maxD = Math.max(...arr.map(g => g.d));
  const lx0 = Math.log10(minD), lx1 = Math.log10(maxD);
  const x = d => pad + (Math.log10(d) - lx0) / (lx1 - lx0 || 1) * (c.width - 2 * pad);
  const y = p => c.height - pad - p / 100 * (c.height - 2 * pad);
  ctx.strokeStyle = "#e5e7eb"; ctx.lineWidth = 1;
  for (let p = 0; p <= 100; p += 20) { ctx.beginPath(); ctx.moveTo(pad, y(p)); ctx.lineTo(c.width - pad, y(p)); ctx.stroke(); }
  ctx.strokeStyle = "#0f766e"; ctx.lineWidth = 3; ctx.beginPath();
  arr.forEach((g, i) => i ? ctx.lineTo(x(g.d), y(g.p)) : ctx.moveTo(x(g.d), y(g.p))); ctx.stroke();
  ctx.fillStyle = "#0f766e"; arr.forEach(g => { ctx.beginPath(); ctx.arc(x(g.d), y(g.p), 4, 0, Math.PI * 2); ctx.fill(); });
  ctx.fillStyle = "#334155"; ctx.font = "13px system-ui";
  ctx.fillText("% que pasa", 10, 20);
  ctx.fillText("Diámetro mm (escala log)", c.width / 2 - 80, c.height - 10);
  [10, 50, 90].forEach(p => { ctx.fillText(String(p), 12, y(p) + 4); });
}

function hydraulicAtWaterLevel(points, wl) {
  const pts = points.slice().sort((a, b) => a.x - b.x);
  let A = 0, P = 0, T = 0;
  let minZ = Infinity, wet = false, maxDepth = 0;
  for (const p of pts) minZ = Math.min(minZ, p.z);
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    if (b.x === a.x) continue;
    const da = wl - a.z, db = wl - b.z;
    const dx = b.x - a.x;
    const len = Math.hypot(dx, b.z - a.z);
    maxDepth = Math.max(maxDepth, da, db);
    if (da > 0 && db > 0) {
      A += (da + db) * 0.5 * Math.abs(dx);
      P += len;
      T += Math.abs(dx);
      wet = true;
    } else if (da > 0 || db > 0) {
      const t = da / (da - db);
      const xi = a.x + t * dx;
      if (da > 0) {
        const wetDx = Math.abs(xi - a.x);
        A += 0.5 * da * wetDx;
        P += Math.hypot(wetDx, wl - a.z);
        T += wetDx;
      } else {
        const wetDx = Math.abs(b.x - xi);
        A += 0.5 * db * wetDx;
        P += Math.hypot(wetDx, wl - b.z);
        T += wetDx;
      }
      wet = true;
    }
  }
  const R = P > 0 ? A / P : 0;
  const h = T > 0 ? A / T : 0;
  return { A, P, R, T, h, maxDepth: Math.max(0, wl - minZ), wet };
}

function normalDepthFromGeometry(points, Q, n, S) {
  const minZ = Math.min(...points.map(p => p.z));
  const maxZ = Math.max(...points.map(p => p.z));
  let lo = minZ + 1e-4;
  let hi = maxZ + Math.max(2, (maxZ - minZ) * 2);
  const qAt = wl => {
    const h = hydraulicAtWaterLevel(points, wl);
    return h.A > 0 && h.R > 0 ? (1 / n) * h.A * Math.pow(h.R, 2 / 3) * Math.sqrt(Math.max(S, 0)) : 0;
  };
  let guard = 0;
  while (qAt(hi) < Q && guard < 20) { hi += (hi - lo) * 1.5 + 1; guard++; }
  for (let iter = 0; iter < 70; iter++) {
    const mid = (lo + hi) / 2;
    if (qAt(mid) < Q) lo = mid; else hi = mid;
  }
  const wl = (lo + hi) / 2;
  const props = hydraulicAtWaterLevel(points, wl);
  return { wl, ...props, Qcalc: qAt(wl) };
}

function manualHydraulic(s) {
  const B = Math.max(0.001, s.manualB);
  const h = Math.max(0.001, s.manualH);
  const A = B * h;
  const P = B + 2 * h;
  const R = A / P;
  const T = B;
  const Qcalc = (1 / s.n) * A * Math.pow(R, 2 / 3) * Math.sqrt(Math.max(s.slope, 0));
  return { A, P, R, T, h, maxDepth: h, wl: h, Qcalc };
}

function betaLL(Tr) { return 0.7929 + 0.0973 * Math.log10(Math.max(Tr, 1)); }
function zLL(Dm_mm) {
  const L = Math.log10(Math.max(Dm_mm, 0.0001));
  return 0.394557 - 0.04136 * L - 0.00891 * L * L;
}
function phiLL(gammaMix) {
  return gammaMix <= 1 ? 1 : -0.54 + 1.5143 * gammaMix;
}
function criticalVelocityHEC18(y, d50mm) {
  const Dm = Math.max(d50mm, 0.2) / 1000;
  return 6.19 * Math.pow(Math.max(y, 0.001), 1 / 6) * Math.pow(Dm, 1 / 3);
}

function computeSection(s) {
  const Q = Math.max(0, s.q);
  const S = Math.max(0, s.slope);
  const n = Math.max(0.001, s.n);
  let hyd, source;
  if (s.points && s.points.length > 1) { hyd = normalDepthFromGeometry(s.points, Q, n, S); source = "dibujada"; }
  else { hyd = manualHydraulic(s); source = "manual"; }

  const A = hyd.A, R = hyd.R, Be = Math.max(0.001, hyd.T || s.manualB), h = Math.max(0.001, hyd.h || s.manualH);
  const V = A > 0 ? Q / A : 0;
  const Fr = (A > 0 && Be > 0) ? V / Math.sqrt(state.globals.g * A / Be) : 0;
  const tau = state.globals.gammaW * state.globals.g * R * S;
  const theta = tau / ((state.globals.gammaS - state.globals.gammaW) * state.globals.g * Math.max(s.d50 / 1000, 1e-6));
  const Vc = criticalVelocityHEC18(h, s.d50);
  const moving = V > Vc;

  const alpha = Q / (Be * Math.pow(h, 5 / 3));
  const beta = betaLL(state.globals.tr);
  const z = zLL(s.dm);
  const phi = phiLL(state.globals.gammaMix);
  const mu = Math.max(0.1, s.mu || 1);
  const denomLL = 0.68 * beta * mu * phi * Math.pow(Math.max(s.dm, 0.0001), 0.28);
  const Hs = Math.pow((alpha * Math.pow(h, 5 / 3)) / denomLL, 1 / (1 + z));
  const scourBase = Math.max(0, Hs - h);
  const curveApplied = s.isCurve && s.curveSide === "exterior" ? Math.max(1, s.curveFactor || 1) : 1;
  const scour = scourBase * curveApplied;

  const Ks = 1 / n;
  const d90m = Math.max(s.d90 / 1000, 1e-6);
  const dm_m = Math.max(s.dm / 1000, 1e-6);
  const Kr = 26 / Math.pow(d90m, 1 / 6);
  const left = Math.pow(Ks / Kr, 1.5) * state.globals.gammaW * S * R;
  const threshold = 0.047 * (state.globals.gammaS - state.globals.gammaW) * dm_m;
  const coeff = 0.25 * Math.pow(state.globals.gammaW / state.globals.g, 1 / 3) * Math.pow(1 - state.globals.gammaW / state.globals.gammaS, 2 / 3);
  const excess = left - threshold;
  const gs = excess > 0 ? Math.pow(excess / coeff, 1.5) : 0;
  const GkgS = gs * Be;
  const GtonH = GkgS * 3.6;
  const Gm3H = GtonH / (state.globals.gammaS / 1000);

  return {
    id: s.id, distance: s.distance, source, isCurve: s.isCurve, curveSide: s.curveSide,
    Q, S, n, Be, h, A, P: hyd.P, R, V, Fr, tau, theta, Vc, moving,
    d50: s.d50, d84: s.d84, d90: s.d90, dm: s.dm,
    alpha, beta, z, phi, mu, Hs, scourBase, curveApplied, scour,
    Ks, Kr, gs, GkgS, GtonH, Gm3H,
    bedMin: s.points && s.points.length ? Math.min(...s.points.map(p => p.z)) : 0,
    waterLevel: hyd.wl || h,
    note: s.note || ""
  };
}

function runCalculations() {
  syncGlobalsFromInputs();
  state.results = state.sections.map(computeSection);
  renderResults();
  switchTab("results");
}

function renderResults() {
  const maxScour = Math.max(0, ...state.results.map(r => r.scour));
  const maxGs = Math.max(0, ...state.results.map(r => r.GtonH));
  const critical = state.results.reduce((a, r) => r.scour > (a?.scour || -1) ? r : a, null);
  const movingCount = state.results.filter(r => r.moving).length;
  $("resultSummary").innerHTML = `
    <div class="metric"><strong>${fmt(maxScour, 2)}</strong><span>Socavación máxima ajustada (m)</span></div>
    <div class="metric"><strong>${critical ? critical.id : "-"}</strong><span>Sección crítica</span></div>
    <div class="metric"><strong>${fmt(maxGs, 2)}</strong><span>Arrastre máximo MPM (ton/h)</span></div>
    <div class="metric"><strong>${movingCount}/${state.results.length}</strong><span>Secciones con lecho móvil</span></div>
  `;
  const warns = [];
  if (state.results.some(r => r.source === "manual")) warns.push("Hay secciones sin geometría dibujada: se usaron ancho y tirante manuales.");
  if (state.results.some(r => r.isCurve)) warns.push("Existen tramos en curva: el factor aplicado es preliminar; en curvas críticas se debe revisar distribución lateral de velocidades.");
  if (state.results.some(r => r.d50 < 0.2)) warns.push("D50 menor a 0,2 mm detectado: para fórmulas de inicio de movimiento puede sobreestimar socavación si hay cohesión.");
  $("warnings").innerHTML = warns.map(w => `<div class="warning">${w}</div>`).join("");
  renderResultsTable();
  drawProfile();
}

function renderResultsTable() {
  const rows = state.results.map(r => `
    <tr>
      <td>${r.id}</td><td>${fmt(r.distance, 1)}</td><td>${r.source}</td><td>${r.isCurve ? `<span class="badge curve">${r.curveSide}</span>` : ""}</td>
      <td>${fmt(r.Q, 2)}</td><td>${fmt(r.Be, 2)}</td><td>${fmt(r.h, 3)}</td><td>${fmt(r.A, 2)}</td><td>${fmt(r.R, 3)}</td>
      <td>${fmt(r.V, 3)}</td><td>${fmt(r.Fr, 3)}</td><td>${fmt(r.tau, 2)}</td><td>${fmt(r.Vc, 3)}</td><td>${r.moving ? `<span class="badge warn">móvil</span>` : `<span class="badge ok">estable</span>`}</td>
      <td>${fmt(r.d50, 3)}</td><td>${fmt(r.d84, 3)}</td><td>${fmt(r.d90, 3)}</td><td>${fmt(r.dm, 3)}</td>
      <td>${fmt(r.gs, 3)}</td><td>${fmt(r.GtonH, 2)}</td><td>${fmt(r.Gm3H, 2)}</td>
      <td>${fmt(r.alpha, 3)}</td><td>${fmt(r.beta, 3)}</td><td>${fmt(r.z, 3)}</td><td>${fmt(r.Hs, 3)}</td><td>${fmt(r.scourBase, 3)}</td><td>${fmt(r.scour, 3)}</td>
    </tr>`).join("");
  $("resultsTable").innerHTML = `<thead><tr>
    <th>Sección</th><th>Dist.</th><th>Geom.</th><th>Curva</th><th>Q</th><th>Be</th><th>h</th><th>A</th><th>R</th><th>V</th><th>Fr</th><th>τ0</th><th>Vc</th><th>Cond.</th>
    <th>D50</th><th>D84</th><th>D90</th><th>Dm</th><th>gs kg/s/m</th><th>Gs ton/h</th><th>Gs m³/h</th><th>α</th><th>β</th><th>z</th><th>Hs</th><th>Soc. base</th><th>Soc. ajust.</th>
  </tr></thead><tbody>${rows}</tbody>`;
}

function drawProfile() {
  const c = $("profileCanvas"); if (!c || !state.results.length) return;
  const ctx = c.getContext("2d");
  ctx.clearRect(0, 0, c.width, c.height);
  ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height);
  const pad = 50;
  const xs = state.results.map(r => r.distance);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const bed = state.results.map(r => r.bedMin || 0);
  const scoured = state.results.map(r => (r.bedMin || 0) - r.scour);
  const water = state.results.map(r => (r.bedMin || 0) + r.h);
  const minY = Math.min(...scoured) - 0.2;
  const maxY = Math.max(...water) + 0.2;
  const X = d => pad + (d - minX) / (maxX - minX || 1) * (c.width - 2 * pad);
  const Y = z => c.height - pad - (z - minY) / (maxY - minY || 1) * (c.height - 2 * pad);
  ctx.strokeStyle = "#e5e7eb"; ctx.lineWidth = 1;
  for (let i = 0; i <= 5; i++) { const y = pad + i * (c.height - 2 * pad) / 5; ctx.beginPath(); ctx.moveTo(pad, y); ctx.lineTo(c.width - pad, y); ctx.stroke(); }
  drawLine(ctx, xs, bed, X, Y, "#334155", 3);
  drawLine(ctx, xs, scoured, X, Y, "#b42318", 3);
  drawLine(ctx, xs, water, X, Y, "#0284c7", 2, [8, 6]);
  ctx.fillStyle = "#334155"; ctx.font = "13px system-ui";
  ctx.fillText("Perfil longitudinal preliminar", pad, 24);
  ctx.fillText("Fondo original", pad, c.height - 16);
  ctx.fillStyle = "#b42318"; ctx.fillText("Fondo socavado", pad + 110, c.height - 16);
  ctx.fillStyle = "#0284c7"; ctx.fillText("Agua", pad + 240, c.height - 16);
}
function drawLine(ctx, xs, ys, X, Y, color, width, dash = []) {
  ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = width; ctx.setLineDash(dash); ctx.beginPath();
  xs.forEach((x, i) => i ? ctx.lineTo(X(x), Y(ys[i])) : ctx.moveTo(X(x), Y(ys[i])));
  ctx.stroke(); ctx.restore();
}

function exportCSV() {
  if (!state.results.length) runCalculations();
  const headers = ["id","distance_m","source","curve","Q_m3s","S","n","Be_m","h_m","Area_m2","R_m","V_ms","Froude","tau_Nm2","Vc_ms","moving","D50_mm","D84_mm","D90_mm","Dm_mm","gs_kg_s_m","Gs_ton_h","Gs_m3_h","alpha_LL","beta_LL","z_LL","Hs_LL_m","scour_base_m","scour_adjusted_m"];
  const lines = [headers.join(",")];
  state.results.forEach(r => lines.push([
    r.id,r.distance,r.source,r.isCurve ? r.curveSide : "no",r.Q,r.S,r.n,r.Be,r.h,r.A,r.R,r.V,r.Fr,r.tau,r.Vc,r.moving,r.d50,r.d84,r.d90,r.dm,r.gs,r.GtonH,r.Gm3H,r.alpha,r.beta,r.z,r.Hs,r.scourBase,r.scour
  ].join(",")));
  downloadText(lines.join("\n"), "hidrosed_resultados.csv", "text/csv");
}

function exportJSON() { downloadText(JSON.stringify(state, null, 2), "hidrosed_proyecto.json", "application/json"); }
function importJSON(e) {
  const file = e.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const obj = JSON.parse(reader.result);
      Object.assign(state, obj);
      renderAll(); loadActiveSectionToCanvas(); calculateGradation();
      alert("Proyecto importado correctamente.");
    } catch (err) { alert("No se pudo importar el JSON: " + err.message); }
  };
  reader.readAsText(file);
}
function loadLocal() {
  const raw = localStorage.getItem("hidrosed-state");
  if (!raw) { alert("No hay proyecto guardado en este navegador."); return; }
  Object.assign(state, JSON.parse(raw));
  renderAll(); loadActiveSectionToCanvas(); calculateGradation();
}
function downloadText(text, filename, type) {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportReportHTML() {
  if (!state.results.length) runCalculations();
  const rows = state.results.map(r => `<tr><td>${r.id}</td><td>${fmt(r.distance,1)}</td><td>${fmt(r.V,3)}</td><td>${fmt(r.GtonH,2)}</td><td>${fmt(r.Hs,3)}</td><td>${fmt(r.scour,3)}</td></tr>`).join("");
  const html = `<!doctype html><meta charset="utf-8"><title>Reporte HidroSed</title><style>body{font-family:Arial;margin:32px;color:#172033}table{border-collapse:collapse;width:100%}td,th{border:1px solid #ddd;padding:8px}th{background:#eef7f6}</style><h1>Reporte HidroSed</h1><p><strong>Proyecto:</strong> ${state.projectName}</p><p>Q global: ${state.globals.q} m³/s · Tr: ${state.globals.tr} años</p><table><thead><tr><th>Sección</th><th>Distancia m</th><th>V m/s</th><th>Gs ton/h</th><th>Hs m</th><th>Socavación m</th></tr></thead><tbody>${rows}</tbody></table><p>Reporte preliminar. Requiere validación profesional.</p>`;
  downloadText(html, "hidrosed_reporte.html", "text/html");
}

init();
