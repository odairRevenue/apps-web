import { useState, useMemo, useEffect, useRef } from "react";

// ─── AUTH — TEMPORAL ⚠️ ────────────────────────────────────────────────────
// Credenciales hardcodeadas para uso interno. Migrar a Supabase Auth en la
// siguiente fase. NO subir contraseñas reales a un repo público.
const ADMIN_USER = "admin";
const ADMIN_PASS = "dspacios2026"; // ← Cambiar aquí

// ─── CONSTANTS ─────────────────────────────────────────────────────────────
const SMMLV = 1750905;    // Decreto 1469 del 29-dic-2025 ✅ vigente 2026
const SUBSIDIO_T = 249095; // Decreto 1470 del 29-dic-2025 ✅ vigente 2026
const ARL_OPTS = [
  { label: "Clase I – Riesgo Mínimo (oficinas)", rate: 0.522 },
  { label: "Clase II – Riesgo Bajo", rate: 1.044 },
  { label: "Clase III – Riesgo Medio", rate: 2.436 },
  { label: "Clase IV – Riesgo Alto", rate: 4.350 },
  { label: "Clase V – Riesgo Máximo", rate: 6.960 },
];
const TABS = [
  { id: "empleados", label: "Empleados", icon: "👥" },
  { id: "presupuesto", label: "Presupuestos", icon: "📊" },
  { id: "breakeven", label: "Punto de Equilibrio", icon: "⚖️" },
  { id: "comisiones", label: "Comisiones", icon: "💰" },
  { id: "simulador", label: "Simulador", icon: "🧮" },
  { id: "exportar", label: "Exportar", icon: "📤" },
];

// ─── HELPERS ───────────────────────────────────────────────────────────────
const fmtCOP = n => new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(n || 0);
const fmtPct = n => `${(+n || 0).toFixed(2)}%`;
const uid = () => Math.random().toString(36).slice(2, 9);

function ls(key, def) {
  try { const v = localStorage.getItem(key); return v !== null ? JSON.parse(v) : def; }
  catch { return def; }
}

function calcCostos(salario, arlRate, subsidio, categoria = "empleado") {
  const s = +salario || 0;
  if (categoria === "prestacion") {
    return { rubros: [], totalRubros: 0, costoTotal: s, porcCarga: 0, ext: 0 };
  }
  const mas10 = s > SMMLV * 10;
  const rubros = [
    { cat: "Parafiscal", nombre: "Salud Empleador", pct: 8.5 },
    { cat: "Parafiscal", nombre: "Pensión Empleador", pct: 12 },
    { cat: "Parafiscal", nombre: `ARL (${ARL_OPTS.find(a => a.rate === (+arlRate || 0.522))?.label?.split("–")[0]?.trim() || "Clase I"})`, pct: +arlRate || 0.522 },
    { cat: "Parafiscal", nombre: "Caja de Compensación Familiar", pct: 4 },
    ...(mas10 ? [{ cat: "Parafiscal", nombre: "SENA", pct: 2 }, { cat: "Parafiscal", nombre: "ICBF", pct: 3 }] : []),
    { cat: "Prestación", nombre: "Prima de Servicios", pct: 8.33 },
    { cat: "Prestación", nombre: "Cesantías", pct: 8.33 },
    { cat: "Prestación", nombre: "Intereses s/ Cesantías", pct: 1 },
    { cat: "Prestación", nombre: "Vacaciones", pct: 4.17 },
  ].map(r => ({ ...r, valor: s * r.pct / 100 }));
  const ext = subsidio ? SUBSIDIO_T : 0;
  const totalRubros = rubros.reduce((a, r) => a + r.valor, 0);
  const costoTotal = s + totalRubros + ext;
  const porcCarga = s > 0 ? (totalRubros / s) * 100 : 0;
  return { rubros, totalRubros, costoTotal, porcCarga, ext };
}

function calcComision(ventas, schema, tipo = "por_tramo") {
  if (!schema || !schema.length || !ventas || +ventas <= 0) return 0;
  const v = +ventas;
  const sorted = [...schema].sort((a, b) => (+a.desde || 0) - (+b.desde || 0));
  if (tipo === "por_tramo") {
    for (const t of sorted) {
      const desde = +t.desde || 0;
      const hasta = t.hasta === "" || t.hasta == null ? Infinity : +t.hasta;
      if (v >= desde && v < hasta) return v * ((+t.pct || 0) / 100);
    }
    const last = [...sorted].reverse().find(t => v >= (+t.desde || 0));
    return last ? v * ((+last.pct || 0) / 100) : 0;
  }
  let total = 0;
  for (const t of sorted) {
    const desde = +t.desde || 0;
    const hasta = t.hasta === "" || t.hasta == null ? Infinity : +t.hasta;
    if (v <= desde) break;
    total += (Math.min(v, hasta) - desde) * ((+t.pct || 0) / 100);
  }
  return total;
}

function toXML(employees) {
  const rows = employees.map(emp => {
    const { costoTotal, rubros } = calcCostos(emp.salario, emp.arlRate, emp.subsidio, emp.categoria);
    const rb = rubros.map(r => `      <Rubro nombre="${r.nombre}" categoria="${r.cat}" porcentaje="${r.pct}" valor="${Math.round(r.valor)}"/>`).join("\n");
    return `  <Empleado id="${emp.id}" nombre="${emp.nombre}" cargo="${emp.cargo || ""}">\n    <SalarioBase>${emp.salario}</SalarioBase>\n    <CostoTotal>${Math.round(costoTotal)}</CostoTotal>\n    <Rubros>\n${rb}\n    </Rubros>\n  </Empleado>`;
  }).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<Empleados fecha="${new Date().toISOString()}">\n${rows}\n</Empleados>`;
}

function toCSV(employees) {
  const hd = ["ID", "Nombre", "Cargo", "Salario Base", "ARL%", "Subsidio", "Carga Social", "Costo Total Empresa"];
  const rows = employees.map(e => {
    const { totalRubros, costoTotal } = calcCostos(e.salario, e.arlRate, e.subsidio, e.categoria);
    return [e.id, e.nombre, e.cargo || "", e.salario, e.arlRate, e.subsidio ? "Sí" : "No", Math.round(totalRubros), Math.round(costoTotal)].join(",");
  });
  return [hd.join(","), ...rows].join("\n");
}

function dlFile(content, name, type) {
  const b = new Blob([content], { type });
  const u = URL.createObjectURL(b);
  const a = document.createElement("a");
  a.href = u; a.download = name; a.click();
  URL.revokeObjectURL(u);
}

// ─── CSS ───────────────────────────────────────────────────────────────────
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap');
*{box-sizing:border-box;margin:0;padding:0;}
:root{
  --bg:#05080f;--surf:#0b1220;--surf2:#111b2e;--surf3:#162035;
  --border:#1c2d47;--accent:#f59e0b;--gold:#fbbf24;--green:#10b981;
  --red:#ef4444;--blue:#60a5fa;--purple:#a78bfa;
  --text:#dde6f0;--muted:#536175;
  --font:'Syne',sans-serif;--mono:'JetBrains Mono',monospace;
}
body{background:var(--bg);color:var(--text);font-family:var(--font);}
.app{min-height:100vh;background:var(--bg);}
.hdr{background:var(--surf);border-bottom:1px solid var(--border);padding:14px 24px;display:flex;align-items:center;gap:12px;}
.hdr-logo{width:38px;height:38px;background:linear-gradient(135deg,#f59e0b,#d97706);border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0;}
.hdr-title{font-size:19px;font-weight:800;letter-spacing:-0.5px;}
.hdr-sub{font-size:11px;color:var(--muted);font-family:var(--mono);}
.hdr-stats{margin-left:auto;display:flex;gap:16px;align-items:center;}
.hdr-stat{text-align:right;}
.hdr-stat-v{font-family:var(--mono);font-size:14px;font-weight:600;color:var(--accent);}
.hdr-stat-l{font-size:10px;color:var(--muted);}
.nav{display:flex;gap:2px;padding:10px 20px 0;background:var(--surf);border-bottom:1px solid var(--border);overflow-x:auto;}
.nav-btn{padding:8px 14px;border:none;background:transparent;color:var(--muted);font-family:var(--font);font-size:12px;font-weight:700;cursor:pointer;border-bottom:2px solid transparent;white-space:nowrap;transition:all .15s;letter-spacing:.2px;}
.nav-btn:hover{color:var(--text);}
.nav-btn.active{color:var(--accent);border-bottom-color:var(--accent);}
.main{padding:22px;max-width:1280px;margin:0 auto;}
.sec-title{font-size:20px;font-weight:800;display:flex;align-items:center;gap:8px;margin-bottom:18px;}
.card{background:var(--surf);border:1px solid var(--border);border-radius:12px;padding:18px;margin-bottom:14px;}
.card-title{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:var(--muted);margin-bottom:14px;}
.g2{display:grid;grid-template-columns:1fr 1fr;gap:14px;}
.g3{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;}
.g4{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;}
@media(max-width:800px){.g2,.g3,.g4,.panel-split{grid-template-columns:1fr!important;}}
.stat{background:var(--surf2);border:1px solid var(--border);border-radius:8px;padding:14px;}
.stat-l{font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:5px;}
.stat-v{font-family:var(--mono);font-size:18px;font-weight:600;color:var(--accent);}
.stat-v.g{color:var(--green);}
.stat-v.r{color:var(--red);}
.stat-v.b{color:var(--blue);}
.stat-s{font-size:10px;color:var(--muted);margin-top:3px;font-family:var(--mono);}
.btn{padding:8px 16px;border:none;border-radius:7px;font-family:var(--font);font-size:12px;font-weight:700;cursor:pointer;transition:all .15s;letter-spacing:.2px;}
.btn-p{background:var(--accent);color:#000;}
.btn-p:hover{background:var(--gold);}
.btn-p:disabled{opacity:.4;cursor:default;}
.btn-g{background:var(--surf2);color:var(--text);border:1px solid var(--border);}
.btn-g:hover{border-color:var(--accent);color:var(--accent);}
.btn-g:disabled{opacity:.4;cursor:default;}
.btn-d{background:transparent;color:var(--red);border:1px solid var(--red);}
.btn-d:hover{background:var(--red);color:#fff;}
.btn-grn{background:var(--green);color:#000;}
.btn-grn:hover{opacity:.85;}
.btn-grn:disabled{opacity:.4;cursor:default;}
.btn-edit{background:transparent;color:var(--blue);border:1px solid var(--blue);}
.btn-edit:hover{background:var(--blue);color:#000;}
.btn-sm{padding:4px 9px;font-size:11px;}
.ig{margin-bottom:12px;}
.il{font-size:11px;color:var(--muted);margin-bottom:5px;display:block;font-weight:700;}
.inp{width:100%;background:var(--surf2);border:1px solid var(--border);border-radius:6px;padding:7px 11px;color:var(--text);font-family:var(--mono);font-size:12px;outline:none;transition:border-color .15s;}
.inp:focus{border-color:var(--accent);}
.sel{width:100%;background:var(--surf2);border:1px solid var(--border);border-radius:6px;padding:7px 11px;color:var(--text);font-family:var(--mono);font-size:12px;outline:none;}
.sel:focus{border-color:var(--accent);}
.ck-row{display:flex;align-items:center;gap:8px;font-size:12px;color:var(--muted);cursor:pointer;margin-bottom:10px;}
.ck-row input{accent-color:var(--accent);}
.ec{background:var(--surf2);border:1px solid var(--border);border-radius:8px;padding:12px 14px;cursor:pointer;transition:all .15s;display:flex;align-items:center;gap:11px;margin-bottom:7px;}
.ec:hover{border-color:var(--accent);}
.ec.sel-{border-color:var(--accent);background:rgba(245,158,11,.06);}
.av{width:38px;height:38px;border-radius:50%;background:linear-gradient(135deg,#f59e0b,#b45309);display:flex;align-items:center;justify-content:center;font-weight:800;font-size:15px;color:#000;flex-shrink:0;}
.en{font-weight:700;font-size:14px;}
.ec-{font-size:11px;color:var(--muted);}
.ecost{font-family:var(--mono);color:var(--accent);font-weight:600;font-size:13px;text-align:right;}
.rr{display:flex;align-items:center;padding:7px 0;border-bottom:1px solid var(--border);font-size:12px;}
.rr:last-child{border-bottom:none;}
.rc{font-size:9px;padding:2px 5px;border-radius:3px;margin-right:8px;font-weight:700;text-transform:uppercase;letter-spacing:.3px;flex-shrink:0;}
.rc-P{background:rgba(96,165,250,.12);color:var(--blue);}
.rc-R{background:rgba(16,185,129,.12);color:var(--green);}
.rn{flex:1;color:var(--text);}
.rpct{font-family:var(--mono);font-size:11px;color:var(--muted);width:60px;text-align:right;}
.rval{font-family:var(--mono);font-weight:600;color:var(--accent);width:120px;text-align:right;}
.tr{display:flex;align-items:center;gap:6px;margin-bottom:6px;}
.tr .inp{font-size:11px;padding:5px 9px;}
.pb{background:var(--surf2);border-radius:99px;height:5px;overflow:hidden;margin-top:5px;}
.pf{height:100%;border-radius:99px;background:var(--accent);transition:width .4s;}
.bdg{display:inline-flex;align-items:center;padding:2px 7px;border-radius:4px;font-size:10px;font-weight:700;}
.bdg-a{background:rgba(245,158,11,.12);color:var(--accent);}
.bdg-g{background:rgba(16,185,129,.12);color:var(--green);}
.bdg-r{background:rgba(239,68,68,.12);color:var(--red);}
.bdg-b{background:rgba(96,165,250,.12);color:var(--blue);}
.tot{display:flex;justify-content:space-between;align-items:center;padding:10px 0 0;border-top:1px solid var(--border);margin-top:6px;font-weight:700;}
.div{border:none;border-top:1px solid var(--border);margin:14px 0;}
.empty{text-align:center;padding:48px 24px;color:var(--muted);}
.empty-i{font-size:44px;margin-bottom:10px;}
.empty-t{font-size:15px;font-weight:700;margin-bottom:5px;color:var(--text);}
.hbox{background:rgba(245,158,11,.06);border:1px solid rgba(245,158,11,.22);border-radius:8px;padding:14px;margin-bottom:14px;}
.infobox{background:rgba(96,165,250,.06);border:1px solid rgba(96,165,250,.2);border-radius:8px;padding:12px;margin-bottom:14px;font-size:12px;color:var(--muted);line-height:1.6;}
.flex{display:flex;}
.fb{display:flex;justify-content:space-between;align-items:center;}
.g8{gap:8px;}
.g12{gap:12px;}
.mb8{margin-bottom:8px;}
.mb14{margin-bottom:14px;}
.mt14{margin-top:14px;}
.mt8{margin-top:8px;}
.muted{color:var(--muted);font-size:12px;}
.mono{font-family:var(--mono);}
.acc{color:var(--accent);}
.grn{color:var(--green);}
.red{color:var(--red);}
.blu{color:var(--blue);}
.sm{font-size:11px;}
.panel-split{display:grid;grid-template-columns:300px 1fr;gap:18px;}
.overlay{position:fixed;inset:0;background:rgba(0,0,0,.75);display:flex;align-items:center;justify-content:center;z-index:200;padding:20px;}
.modal{background:var(--surf);border:1px solid var(--border);border-radius:14px;padding:22px;width:100%;max-width:480px;max-height:88vh;overflow-y:auto;}
.modal-t{font-size:17px;font-weight:800;margin-bottom:18px;}
.big-num{font-family:var(--mono);font-size:30px;font-weight:700;}
.pe-box{border-radius:10px;padding:18px;margin-bottom:10px;}
.toggle-row{display:flex;background:var(--surf2);border:1px solid var(--border);border-radius:8px;overflow:hidden;margin-bottom:14px;}
.toggle-btn{flex:1;padding:8px;border:none;background:transparent;color:var(--muted);font-family:var(--font);font-size:11px;font-weight:700;cursor:pointer;transition:all .15s;}
.toggle-btn.on{background:var(--accent);color:#000;}
table{width:100%;border-collapse:collapse;}
th{padding:8px 10px;text-align:left;font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;font-weight:700;border-bottom:2px solid var(--border);}
td{padding:10px;font-size:12px;border-bottom:1px solid var(--border);}
tr:last-child td{border-bottom:none;}
pre{font-size:10px;color:var(--muted);overflow:auto;max-height:180px;background:var(--surf2);padding:10px;border-radius:6px;font-family:var(--mono);white-space:pre-wrap;}

/* ── LOGIN ── */
.login-wrap{min-height:100vh;background:var(--bg);display:flex;align-items:center;justify-content:center;padding:20px;background-image:radial-gradient(ellipse 80% 60% at 50% -10%,rgba(245,158,11,.08),transparent);}
.login-card{background:var(--surf);border:1px solid var(--border);border-radius:18px;padding:36px;width:100%;max-width:380px;box-shadow:0 0 60px rgba(0,0,0,.5);}
.login-logo{width:60px;height:60px;background:linear-gradient(135deg,#f59e0b,#d97706);border-radius:16px;display:inline-flex;align-items:center;justify-content:center;font-size:30px;margin-bottom:14px;box-shadow:0 4px 20px rgba(245,158,11,.3);}
.login-err{color:var(--red);font-size:12px;margin-bottom:12px;text-align:center;padding:8px 12px;background:rgba(239,68,68,.08);border:1px solid rgba(239,68,68,.2);border-radius:6px;}
.login-footer{font-size:11px;color:var(--muted);text-align:center;margin-top:16px;}

/* ── COSTOS FIJOS ── */
.costo-item{display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid var(--border);}
.costo-item:last-child{border-bottom:none;}
.costo-nombre{flex:1;font-size:12px;}
.costo-valor{font-family:var(--mono);font-weight:600;color:var(--accent);font-size:12px;}

/* ── GOOGLE SHEETS BADGE ── */
.src-badge{display:inline-flex;align-items:center;gap:3px;padding:2px 7px;border-radius:4px;font-size:9px;font-weight:700;margin-left:6px;vertical-align:middle;}
.src-sheets{background:rgba(16,185,129,.15);color:var(--green);border:1px solid rgba(16,185,129,.25);}
.src-calc{background:rgba(96,165,250,.12);color:var(--blue);border:1px solid rgba(96,165,250,.2);}

/* ── MARGEN ERROR ── */
.margen-err{background:rgba(239,68,68,.06);border:1px solid rgba(239,68,68,.25);border-radius:8px;padding:12px 14px;font-size:12px;color:var(--red);line-height:1.6;margin-top:8px;}

/* ── GS STATUS ── */
.gs-status{margin-top:10px;padding:9px 12px;background:var(--surf2);border-radius:6px;font-size:12px;text-align:center;border:1px solid var(--border);}
.gs-connected{border-color:rgba(16,185,129,.3);background:rgba(16,185,129,.06);}

/* ── LOGOUT CHIP ── */
.user-chip{display:flex;align-items:center;gap:8px;padding:5px 10px;background:var(--surf2);border:1px solid var(--border);border-radius:20px;font-size:11px;}
.user-chip-name{font-weight:700;color:var(--text);}
.logout-btn{background:none;border:none;color:var(--muted);cursor:pointer;font-size:11px;font-family:var(--font);padding:0;transition:color .15s;}
.logout-btn:hover{color:var(--red);}
`;

// ─── LOGIN SCREEN ──────────────────────────────────────────────────────────
function LoginScreen({ onLogin }) {
  const [user, setUser] = useState("");
  const [pass, setPass] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  const handle = () => {
    if (!user || !pass) return;
    setLoading(true);
    setTimeout(() => {
      if (user.trim() === ADMIN_USER && pass === ADMIN_PASS) {
        localStorage.setItem("sf_auth", "true");
        onLogin();
      } else {
        setErr("Usuario o contraseña incorrectos");
        setLoading(false);
      }
    }, 450);
  };

  return (
    <div className="login-wrap">
      <div className="login-card">
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div className="login-logo">⚡</div>
          <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: -0.5 }}>Dspacios Finanzas</div>
          <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 5, fontFamily: "var(--mono)" }}>
            Panel de Administración
          </div>
        </div>
        <div className="ig">
          <label className="il">Usuario</label>
          <input className="inp" value={user}
            onChange={e => { setUser(e.target.value); setErr(""); }}
            placeholder="admin"
            onKeyDown={e => e.key === "Enter" && handle()}
            autoFocus />
        </div>
        <div className="ig">
          <label className="il">Contraseña</label>
          <input className="inp" type="password" value={pass}
            onChange={e => { setPass(e.target.value); setErr(""); }}
            placeholder="••••••••"
            onKeyDown={e => e.key === "Enter" && handle()} />
        </div>
        {err && <div className="login-err">⚠️ {err}</div>}
        <button className="btn btn-p" style={{ width: "100%", padding: "11px 0", fontSize: 14, marginTop: 4 }}
          onClick={handle} disabled={loading || !user || !pass}>
          {loading ? "Verificando..." : "Ingresar →"}
        </button>
        <div className="login-footer">🔒 Acceso restringido · Solo administradores</div>
      </div>
    </div>
  );
}

// ─── EMP DETALLE ───────────────────────────────────────────────────────────
function EmpDetalle({ emp }) {
  const { rubros, totalRubros, costoTotal, porcCarga, ext } = calcCostos(emp.salario, emp.arlRate, emp.subsidio, emp.categoria);
  const esPrestacion = emp.categoria === "prestacion";

  if (esPrestacion) {
    return (
      <>
        <div className="card mb14">
          <div className="card-title">Prestación de Servicios — {emp.nombre}</div>
          <div className="infobox" style={{ marginBottom: 14 }}>
            🤝 Contrato de prestación de servicios: la empresa paga únicamente el honorario pactado. <strong>Sin carga parafiscal ni prestacional.</strong> El contratista asume sus propios aportes a salud y pensión como independiente.
          </div>
          <div className="g3">
            <div className="stat"><div className="stat-l">Honorario / Tarifa</div><div className="stat-v b">{fmtCOP(emp.salario)}</div></div>
            <div className="stat"><div className="stat-l">Carga Social Empresa</div><div className="stat-v g">$0</div><div className="stat-s">0% — no aplica</div></div>
            <div className="stat"><div className="stat-l">Costo Total Empresa</div><div className="stat-v acc">{fmtCOP(costoTotal)}</div><div className="stat-s">solo el honorario</div></div>
          </div>
        </div>
        <div className="card">
          <div className="card-title">Desglose</div>
          <div className="rr"><span className="rn" style={{ fontWeight: 700 }}>Honorario pactado</span><span className="rval">{fmtCOP(emp.salario)}</span></div>
          <div className="rr">
            <span style={{ flex: 1, color: "var(--muted)" }}>
              Aportes independiente (responsabilidad del contratista)
              <div className="sm muted">Salud 12.5% + Pensión 16% sobre el 40% del ingreso</div>
            </span>
            <span className="mono muted" style={{ fontSize: 11 }}>Cuenta propia</span>
          </div>
          <div className="tot"><span>COSTO PARA LA EMPRESA</span><span className="mono acc" style={{ fontSize: 18, fontWeight: 700 }}>{fmtCOP(costoTotal)}</span></div>
          {emp.comisiones && <div className="infobox mt8">💰 Comisiones en prestación: <strong>no generan carga social</strong> para la empresa. Se pagan como honorario variable.</div>}
        </div>
      </>
    );
  }

  const descEmp = emp.salario * 0.08;
  const netoCop = emp.salario - descEmp;
  return (
    <>
      <div className="card mb14">
        <div className="card-title">Resumen — {emp.nombre}</div>
        <div className="g4">
          <div className="stat"><div className="stat-l">Salario Base</div><div className="stat-v b">{fmtCOP(emp.salario)}</div></div>
          <div className="stat"><div className="stat-l">Carga Social</div><div className="stat-v">{fmtCOP(totalRubros)}</div><div className="stat-s">{fmtPct(porcCarga)} del salario</div></div>
          {ext > 0 && <div className="stat"><div className="stat-l">Subsidio Transp.</div><div className="stat-v g">{fmtCOP(ext)}</div></div>}
          <div className="stat"><div className="stat-l">Costo Total Empresa</div><div className="stat-v r">{fmtCOP(costoTotal)}</div><div className="stat-s">+{fmtPct((costoTotal / emp.salario - 1) * 100)} sobre salario</div></div>
        </div>
      </div>
      <div className="card">
        <div className="card-title">Desglose rubro a rubro</div>
        <div className="rr" style={{ borderBottom: "2px solid var(--border)", paddingBottom: 8, marginBottom: 4 }}>
          <span className="rn" style={{ fontWeight: 700 }}>SALARIO BASE</span><span className="rval">{fmtCOP(emp.salario)}</span>
        </div>
        <div style={{ marginBottom: 8, marginTop: 6 }}>
          <div className="muted sm mb8" style={{ fontWeight: 700 }}>→ APORTES PATRONALES</div>
          {rubros.filter(r => r.cat === "Parafiscal").map((r, i) => (
            <div key={i} className="rr"><span className="rc rc-P">Paraf</span><span className="rn">{r.nombre}</span><span className="rpct">{fmtPct(r.pct)}</span><span className="rval">{fmtCOP(r.valor)}</span></div>
          ))}
        </div>
        <div style={{ marginBottom: 8 }}>
          <div className="muted sm mb8" style={{ fontWeight: 700 }}>→ PRESTACIONES SOCIALES</div>
          {rubros.filter(r => r.cat === "Prestación").map((r, i) => (
            <div key={i} className="rr"><span className="rc rc-R">Prest</span><span className="rn">{r.nombre}</span><span className="rpct">{fmtPct(r.pct)}</span><span className="rval">{fmtCOP(r.valor)}</span></div>
          ))}
        </div>
        {ext > 0 && <div className="rr"><span className="rc" style={{ background: "rgba(96,165,250,.12)", color: "var(--blue)" }}>Extra</span><span className="rn">Subsidio de Transporte</span><span className="rpct">Fijo</span><span className="rval">{fmtCOP(ext)}</span></div>}
        <div className="tot"><span>COSTO TOTAL EMPRESA / MES</span><span className="mono acc" style={{ fontSize: 18, fontWeight: 700 }}>{fmtCOP(costoTotal)}</span></div>
        <div className="div" />
        <div className="muted sm mb8">Lo que recibe el empleado (sin comisiones):</div>
        <div style={{ display: "flex", gap: 8 }}>
          <div className="stat" style={{ flex: 1 }}><div className="stat-l">Salario Bruto</div><div className="stat-v b">{fmtCOP(emp.salario)}</div></div>
          <div className="stat" style={{ flex: 1 }}><div className="stat-l">Aportes empleado (8%)</div><div className="stat-v r">-{fmtCOP(descEmp)}</div><div className="stat-s">salud 4% + pensión 4%</div></div>
          <div className="stat" style={{ flex: 1 }}><div className="stat-l">Salario Neto base</div><div className="stat-v g">{fmtCOP(netoCop)}</div></div>
        </div>
        {emp.comisiones && <div className="infobox mt8">⚖️ <strong>Comisiones (Art. 127 CST):</strong> son factor salarial — generan carga adicional. Ver detalle en el Simulador.</div>}
      </div>
    </>
  );
}

// ─── ADD/EDIT FORM ─────────────────────────────────────────────────────────
function AddForm({ form, setForm, onSave, onCancel, isEdit }) {
  const set = k => e => setForm(p => ({ ...p, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));
  const esPrestacion = form.categoria === "prestacion";
  return (
    <div>
      <div className="ig">
        <label className="il">Tipo de Vinculación *</label>
        <div className="toggle-row">
          <button type="button" className={`toggle-btn${!esPrestacion ? " on" : ""}`} onClick={() => setForm(p => ({ ...p, categoria: "empleado" }))}>👤 Empleado</button>
          <button type="button" className={`toggle-btn${esPrestacion ? " on" : ""}`} onClick={() => setForm(p => ({ ...p, categoria: "prestacion" }))}>🤝 Prestación de Servicios</button>
        </div>
        {esPrestacion && <div className="sm muted" style={{ marginTop: 4 }}>Sin carga parafiscal ni prestacional. Solo se paga el honorario pactado.</div>}
      </div>
      <div className="ig"><label className="il">Nombre completo *</label><input className="inp" value={form.nombre} onChange={set("nombre")} placeholder="Ej: María Torres" /></div>
      <div className="ig"><label className="il">Cargo / Rol</label><input className="inp" value={form.cargo} onChange={set("cargo")} placeholder="Ej: Asesor Comercial" /></div>
      <div className="ig"><label className="il">{esPrestacion ? "Honorario / Tarifa (COP) *" : "Salario Base (COP) *"}</label><input className="inp" type="number" value={form.salario} onChange={set("salario")} placeholder="1750905" /></div>
      {!esPrestacion && <>
        <div className="ig">
          <label className="il">Clase de Riesgo ARL</label>
          <select className="sel" value={form.arlRate} onChange={set("arlRate")}>
            {ARL_OPTS.map(o => <option key={o.rate} value={o.rate}>{o.label} — {o.rate}%</option>)}
          </select>
        </div>
        <label className="ck-row"><input type="checkbox" checked={form.subsidio} onChange={set("subsidio")} />Aplica Subsidio de Transporte (salario ≤ 2 SMMLV)</label>
      </>}
      <label className="ck-row"><input type="checkbox" checked={form.comisiones} onChange={set("comisiones")} />Tiene comisiones por ventas{esPrestacion ? " (sin carga social)" : ""}</label>
      {form.comisiones && <label className="ck-row"><input type="checkbox" checked={form.schemaPropio} onChange={set("schemaPropio")} />Usar esquema de comisiones propio (diferente al global)</label>}
      <div className="flex g8 mt14">
        <button className="btn btn-p" style={{ flex: 1 }} onClick={onSave} disabled={!form.nombre || !form.salario}>{isEdit ? "💾 Guardar Cambios" : "➕ Agregar"}</button>
        <button className="btn btn-g" onClick={onCancel}>Cancelar</button>
      </div>
    </div>
  );
}

// ─── EMPLEADOS TAB ─────────────────────────────────────────────────────────
function EmpleadosTab({ employees, selEmpId, setSelEmpId, setShowAdd, deleteEmployee, openEdit }) {
  const totalNomina = employees.reduce((s, e) => s + calcCostos(e.salario, e.arlRate, e.subsidio, e.categoria).costoTotal, 0);
  return (
    <div>
      <div className="fb mb14">
        <div className="sec-title" style={{ margin: 0 }}>👥 Empleados</div>
        <button className="btn btn-p" onClick={() => setShowAdd(true)}>+ Agregar Empleado</button>
      </div>
      {employees.length > 0 && (
        <div className="g3 mb14">
          <div className="stat"><div className="stat-l">Total empleados</div><div className="stat-v">{employees.length}</div></div>
          <div className="stat"><div className="stat-l">Nómina total / mes</div><div className="stat-v r">{fmtCOP(totalNomina)}</div></div>
          <div className="stat"><div className="stat-l">Promedio costo/empleado</div><div className="stat-v">{fmtCOP(employees.length ? totalNomina / employees.length : 0)}</div></div>
        </div>
      )}
      {!employees.length ? (
        <div className="empty"><div className="empty-i">👥</div><div className="empty-t">Sin empleados</div><div className="muted">Agrega tu primer empleado para comenzar</div></div>
      ) : (
        <div className="panel-split">
          <div>
            <div className="card-title">Listado ({employees.length})</div>
            {employees.map(emp => {
              const { costoTotal } = calcCostos(emp.salario, emp.arlRate, emp.subsidio, emp.categoria);
              return (
                <div key={emp.id} className={`ec${selEmpId === emp.id ? " sel-" : ""}`} onClick={() => setSelEmpId(emp.id)}>
                  <div className="av">{emp.nombre[0].toUpperCase()}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="en">{emp.nombre}</div>
                    <div className="ec-">{emp.cargo || "Sin cargo"}</div>
                    <div style={{ display: "flex", gap: 4, marginTop: 3, flexWrap: "wrap" }}>
                      {emp.categoria === "prestacion" ? <span className="bdg bdg-b">🤝 Prestación</span> : <span className="bdg" style={{ background: "rgba(167,139,250,.12)", color: "var(--purple)" }}>👤 Empleado</span>}
                      {emp.comisiones && <span className="bdg bdg-a">Comisiones</span>}
                      {emp.schemaPropio && <span className="bdg bdg-b">Schema propio</span>}
                    </div>
                  </div>
                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    <div className="ecost">{fmtCOP(costoTotal)}</div>
                    <div style={{ fontSize: 9, color: "var(--muted)" }}>empresa/mes</div>
                  </div>
                  <button className="btn btn-edit btn-sm" onClick={e => { e.stopPropagation(); openEdit(emp); }}>✏️</button>
                  <button className="btn btn-d btn-sm" onClick={e => { e.stopPropagation(); deleteEmployee(emp.id); }}>✕</button>
                </div>
              );
            })}
          </div>
          <div>
            {selEmpId && employees.find(e => e.id === selEmpId)
              ? <EmpDetalle emp={employees.find(e => e.id === selEmpId)} />
              : <div className="card"><div className="empty" style={{ padding: "32px 0" }}><div className="empty-i">👈</div><div className="empty-t">Selecciona un empleado</div><div className="muted">para ver el desglose completo</div></div></div>
            }
          </div>
        </div>
      )}
    </div>
  );
}

// ─── PRESUPUESTO TAB ────────────────────────────────────────────────────────
function PresupuestoTab({ employees, beParams, gSheetConfig }) {
  const pv = +beParams.precioVenta || 0, cv = +beParams.costoVariable || 0;
  const mc = pv - cv;
  const mcPctCalc = pv > 0 ? mc / pv : 0;
  // Use imported margin from Sheets if available, else calculated
  const mcPct = gSheetConfig?.importedMcPct != null ? +gSheetConfig.importedMcPct / 100 : mcPctCalc;
  const totalNomina = employees.reduce((s, e) => s + calcCostos(e.salario, e.arlRate, e.subsidio, e.categoria).costoTotal, 0);

  if (!employees.length) return <div className="empty"><div className="empty-i">📊</div><div className="empty-t">Sin empleados</div><div className="muted">Agrega empleados primero</div></div>;
  return (
    <div>
      <div className="sec-title">📊 Presupuesto de Ventas por Empleado</div>
      {(!mcPct) && (
        <div className="hbox mb14">
          ⚠️ Configura <strong>Precio de Venta</strong> y <strong>Costo Variable</strong> en "Punto de Equilibrio" o importa el margen desde <strong>Google Sheets</strong> para ver los presupuestos exactos.
        </div>
      )}
      {gSheetConfig?.importedMcPct != null && (
        <div className="infobox mb14">
          📊 Usando margen de contribución importado desde Google Sheets: <strong style={{ color: "var(--green)" }}>{fmtPct(+gSheetConfig.importedMcPct)}</strong>
        </div>
      )}
      <div className="card mb14">
        <div className="g3">
          <div className="stat"><div className="stat-l">Costo Nómina Total</div><div className="stat-v r">{fmtCOP(totalNomina)}</div><div className="stat-s">/mes</div></div>
          <div className="stat"><div className="stat-l">Margen de Contribución</div><div className="stat-v g">{mcPct > 0 ? fmtPct(mcPct * 100) : "—"}</div><div className="stat-s">{pv > 0 ? `${fmtCOP(mc)} / unidad` : gSheetConfig?.importedMcPct != null ? "Desde Google Sheets" : "Configura PE primero"}</div></div>
          <div className="stat"><div className="stat-l">Presupuesto Global Req.</div><div className="stat-v">{mcPct > 0 ? fmtCOP(totalNomina / mcPct) : "—"}</div><div className="stat-s">para cubrir toda la nómina</div></div>
        </div>
      </div>
      <div className="card" style={{ overflowX: "auto" }}>
        <table>
          <thead><tr><th>Empleado</th><th>Cargo</th><th style={{ textAlign: "right" }}>Salario Base</th><th style={{ textAlign: "right" }}>Costo Empresa</th><th style={{ textAlign: "right" }}>Margen Contrib.</th><th style={{ textAlign: "right" }}>Presupuesto Ventas</th><th style={{ textAlign: "right" }}>Multiplicador</th></tr></thead>
          <tbody>
            {employees.map(emp => {
              const { costoTotal } = calcCostos(emp.salario, emp.arlRate, emp.subsidio, emp.categoria);
              const presupuesto = mcPct > 0 ? costoTotal / mcPct : null;
              return (
                <tr key={emp.id}>
                  <td><strong>{emp.nombre}</strong></td>
                  <td style={{ color: "var(--muted)" }}>{emp.cargo || "—"}</td>
                  <td style={{ textAlign: "right", fontFamily: "var(--mono)" }}>{fmtCOP(emp.salario)}</td>
                  <td style={{ textAlign: "right", fontFamily: "var(--mono)", color: "var(--red)" }}>{fmtCOP(costoTotal)}</td>
                  <td style={{ textAlign: "right", fontFamily: "var(--mono)", color: "var(--muted)" }}>{mcPct > 0 ? fmtPct(mcPct * 100) : "—"}</td>
                  <td style={{ textAlign: "right", fontFamily: "var(--mono)", color: "var(--accent)", fontWeight: 700 }}>{presupuesto ? fmtCOP(presupuesto) : "—"}</td>
                  <td style={{ textAlign: "right", fontFamily: "var(--mono)", color: "var(--green)" }}>{presupuesto ? `${(presupuesto / costoTotal).toFixed(1)}×` : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── BREAKEVEN TAB ─────────────────────────────────────────────────────────
function BreakevenTab({ beParams, setBeParams, costosFijos, setCostosFijos, totalNomina, gSheetConfig, setGSheetConfig }) {
  const [newCosto, setNewCosto] = useState({ nombre: "", valor: "" });
  const [gsStatus, setGsStatus] = useState("");
  const [importing, setImporting] = useState(false);
  const [showGsHelp, setShowGsHelp] = useState(false);

  // Load Google Identity Services script once
  useEffect(() => {
    if (document.getElementById("gis-script")) return;
    const s = document.createElement("script");
    s.id = "gis-script";
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    document.body.appendChild(s);
  }, []);

  const set = k => e => setBeParams(p => ({ ...p, [k]: e.target.value }));
  const gsc = k => e => setGSheetConfig(p => ({ ...p, [k]: e.target.value }));

  // ── Calculations ──────────────────────────────────────────────────────────
  const pv = +beParams.precioVenta || 0;
  const cv = +beParams.costoVariable || 0;
  const mcUnit = pv - cv;
  const mcPctCalc = pv > 0 ? mcUnit / pv : 0;
  // Imported margin takes priority over calculated
  const importedMcPct = gSheetConfig.importedMcPct != null ? +gSheetConfig.importedMcPct / 100 : null;
  const mcPct = importedMcPct !== null ? importedMcPct : mcPctCalc;

  const sumCostos = costosFijos.reduce((s, c) => s + (+c.valor || 0), 0);
  const cf = totalNomina + sumCostos;

  const peU = mcUnit > 0 ? cf / mcUnit : null;
  const peI = mcPct > 0 ? cf / mcPct : null;

  // Meta de rentabilidad — independiente del MC calculado/importado
  // Fórmula: CF / % deseado → "¿cuánto tengo que vender para que X% de mis ventas cubra los CF?"
  const mgDeseado = +beParams.margenDeseado || 0;
  const peIConRent = mgDeseado > 0 ? cf / (mgDeseado / 100) : null;

  // ── Fixed costs management ────────────────────────────────────────────────
  const addCosto = () => {
    if (!newCosto.nombre.trim() || !newCosto.valor) return;
    setCostosFijos(p => [...p, { id: uid(), nombre: newCosto.nombre.trim(), valor: +newCosto.valor }]);
    setNewCosto({ nombre: "", valor: "" });
  };

  // ── Google Sheets OAuth ───────────────────────────────────────────────────
  const connectGoogle = () => {
    if (!gSheetConfig.clientId.trim()) {
      setGsStatus("⚠️ Ingresa tu Client ID de Google OAuth");
      return;
    }
    if (!window.google?.accounts?.oauth2) {
      setGsStatus("⚠️ Google Identity Services no ha cargado. Espera unos segundos e intenta de nuevo.");
      return;
    }
    window.google.accounts.oauth2.initTokenClient({
      client_id: gSheetConfig.clientId.trim(),
      scope: "https://www.googleapis.com/auth/spreadsheets.readonly",
      callback: resp => {
        if (resp.access_token) {
          setGSheetConfig(p => ({ ...p, accessToken: resp.access_token }));
          setGsStatus("✅ Conectado con Google — ahora puedes importar el margen");
        } else {
          setGsStatus("❌ Error al autenticar: " + (resp.error || "acceso denegado"));
        }
      },
    }).requestAccessToken();
  };

  const importMargin = async () => {
    if (!gSheetConfig.accessToken) { setGsStatus("⚠️ Conecta con Google primero"); return; }
    if (!gSheetConfig.spreadsheetId.trim()) { setGsStatus("⚠️ Ingresa el ID del Spreadsheet"); return; }
    if (!gSheetConfig.range.trim()) { setGsStatus("⚠️ Ingresa el rango (ej: Hoja1!B5)"); return; }
    setImporting(true);
    setGsStatus("⏳ Importando...");
    try {
      const url = `https://sheets.googleapis.com/v4/spreadsheets/${gSheetConfig.spreadsheetId.trim()}/values/${encodeURIComponent(gSheetConfig.range.trim())}`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${gSheetConfig.accessToken}` } });
      if (res.status === 401) {
        setGSheetConfig(p => ({ ...p, accessToken: null }));
        setGsStatus("❌ Sesión de Google expirada — vuelve a conectar");
        setImporting(false); return;
      }
      const data = await res.json();
      const cell = data.values?.[0]?.[0];
      if (!cell) { setGsStatus("⚠️ Celda vacía o rango incorrecto"); setImporting(false); return; }

      // Parse: handles "45.3%", "45,3%", "0.453", "45.3"
      const raw = String(cell).replace(/\s/g, "").replace(",", ".");
      let num = parseFloat(raw.replace("%", ""));
      if (isNaN(num)) { setGsStatus("⚠️ El valor de la celda no es un número válido"); setImporting(false); return; }
      if (!raw.includes("%") && num > 0 && num <= 1) num = num * 100; // 0.453 → 45.3%

      setGSheetConfig(p => ({ ...p, importedMcPct: +num.toFixed(4) }));
      setGsStatus(`✅ Margen importado correctamente: ${num.toFixed(2)}%`);
    } catch (e) {
      setGsStatus(`❌ ${e.message}`);
    }
    setImporting(false);
  };

  const clearImported = () => {
    setGSheetConfig(p => ({ ...p, importedMcPct: null }));
    setGsStatus("Margen importado eliminado — usando cálculo por precio/costo");
  };

  const isConnected = !!gSheetConfig.accessToken;

  return (
    <div>
      <div className="sec-title">⚖️ Punto de Equilibrio</div>
      <div className="g2">

        {/* ── LEFT COLUMN ── */}
        <div>

          {/* COSTOS FIJOS DINÁMICOS */}
          <div className="card mb14">
            <div className="card-title">Costos Fijos</div>

            {/* Nómina auto */}
            <div style={{ background: "rgba(245,158,11,.06)", border: "1px solid rgba(245,158,11,.2)", borderRadius: 8, padding: "10px 14px", marginBottom: 16 }}>
              <div style={{ fontSize: 10, color: "var(--muted)", textTransform: "uppercase", letterSpacing: .5, marginBottom: 4 }}>Nómina (auto — suma empleados)</div>
              <div style={{ fontFamily: "var(--mono)", fontSize: 20, fontWeight: 700, color: "var(--accent)" }}>{fmtCOP(totalNomina)}</div>
            </div>

            <div className="card-title">Otros Costos Fijos</div>

            {/* Add form */}
            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              <input className="inp" style={{ flex: 2 }}
                value={newCosto.nombre}
                onChange={e => setNewCosto(p => ({ ...p, nombre: e.target.value }))}
                placeholder="Nombre (ej: Arriendo)"
                onKeyDown={e => e.key === "Enter" && addCosto()} />
              <input className="inp" style={{ flex: 1 }}
                type="number"
                value={newCosto.valor}
                onChange={e => setNewCosto(p => ({ ...p, valor: e.target.value }))}
                placeholder="Valor $"
                onKeyDown={e => e.key === "Enter" && addCosto()} />
              <button className="btn btn-p btn-sm" onClick={addCosto}
                disabled={!newCosto.nombre.trim() || !newCosto.valor}>
                + Add
              </button>
            </div>

            {/* List */}
            {costosFijos.length === 0
              ? <div className="muted sm" style={{ textAlign: "center", padding: "10px 0", borderTop: "1px solid var(--border)" }}>Sin costos adicionales — agrega arriendo, servicios, etc.</div>
              : <>
                {costosFijos.map(c => (
                  <div key={c.id} className="costo-item">
                    <span className="costo-nombre">{c.nombre}</span>
                    <span className="costo-valor">{fmtCOP(+c.valor)}</span>
                    <button className="btn btn-d btn-sm" onClick={() => setCostosFijos(p => p.filter(x => x.id !== c.id))}>✕</button>
                  </div>
                ))}
                <div className="fb" style={{ paddingTop: 10, marginTop: 4 }}>
                  <span className="sm muted">Subtotal otros costos</span>
                  <span className="mono acc" style={{ fontWeight: 700 }}>{fmtCOP(sumCostos)}</span>
                </div>
              </>
            }

            <div className="div" />
            <div className="fb">
              <span style={{ fontWeight: 700, fontSize: 13 }}>TOTAL COSTOS FIJOS</span>
              <span className="mono" style={{ fontSize: 22, fontWeight: 700, color: "var(--red)" }}>{fmtCOP(cf)}</span>
            </div>
          </div>

          {/* PRECIO & MARGEN */}
          <div className="card mb14">
            <div className="card-title">
              Precio & Margen de Contribución
              {importedMcPct !== null && <span className="src-badge src-sheets">📊 Sheets activo</span>}
              {importedMcPct === null && mcPct > 0 && <span className="src-badge src-calc">Calculado</span>}
            </div>
            <div className="ig">
              <label className="il">Precio de Venta Unitario (COP)</label>
              <input className="inp" type="number" value={beParams.precioVenta} onChange={set("precioVenta")} placeholder="150000" />
            </div>
            <div className="ig">
              <label className="il">Costo Variable Unitario (COP)</label>
              <input className="inp" type="number" value={beParams.costoVariable} onChange={set("costoVariable")} placeholder="80000" />
            </div>
            {pv > 0 && cv > 0 && (
              <div className="g2">
                <div className="stat"><div className="stat-l">MC Unitario</div><div className="stat-v g">{fmtCOP(mcUnit)}</div></div>
                <div className="stat">
                  <div className="stat-l">MC %</div>
                  <div className="stat-v g">{fmtPct(mcPct * 100)}</div>
                  {importedMcPct !== null && (
                    <div className="stat-s">Calculado: {fmtPct(mcPctCalc * 100)} · <span style={{ cursor: "pointer", color: "var(--red)" }} onClick={clearImported}>✕ usar calculado</span></div>
                  )}
                </div>
              </div>
            )}
            {importedMcPct !== null && !(pv > 0 && cv > 0) && (
              <div className="stat">
                <div className="stat-l">Margen importado desde Sheets</div>
                <div className="stat-v g">{fmtPct(mcPct * 100)}</div>
                <div className="stat-s"><span style={{ cursor: "pointer", color: "var(--red)" }} onClick={clearImported}>✕ limpiar importado</span></div>
              </div>
            )}
            {importedMcPct === null && !mcPct && (
              <div className="muted sm">Ingresa precio y costo, o importa el margen desde Google Sheets →</div>
            )}
          </div>

          {/* META DE RENTABILIDAD — INDEPENDIENTE */}
          <div className="card">
            <div className="card-title">🎯 Meta de Rentabilidad — Cálculo Independiente</div>
            <div className="infobox" style={{ marginBottom: 12 }}>
              ¿Qué % de ganancia quieres lograr sobre las ventas? Este cálculo es <strong>independiente</strong>: usa el margen disponible y los costos fijos para decirte cuánto debes vender.
            </div>
            <div className="ig">
              <label className="il">Rentabilidad deseada sobre ventas (%)</label>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input className="inp" type="number" value={beParams.margenDeseado}
                  onChange={set("margenDeseado")} placeholder="ej: 15" />
                <span className="muted mono" style={{ fontSize: 16, whiteSpace: "nowrap" }}>%</span>
              </div>
            </div>

            {peIConRent && (
              <div className="stat mt8">
                <div className="stat-l">Ventas requeridas para {fmtPct(mgDeseado)} de rentabilidad</div>
                <div className="stat-v blu">{fmtCOP(peIConRent)}</div>
                <div className="stat-s">
                  {fmtCOP(cf)} ÷ {fmtPct(mgDeseado)} — para que el {fmtPct(mgDeseado)} de las ventas cubra todos los costos fijos
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── RIGHT COLUMN ── */}
        <div>

          {/* PE RESULTS */}
          <div className="pe-box" style={{ background: "linear-gradient(135deg,rgba(245,158,11,.1),rgba(245,158,11,.03))", border: "1px solid rgba(245,158,11,.3)" }}>
            <div className="sm muted" style={{ textTransform: "uppercase", letterSpacing: .5, marginBottom: 6 }}>⚖️ Punto de Equilibrio — Unidades</div>
            <div className="big-num acc">{peU ? Math.ceil(peU).toLocaleString("es-CO") : "—"}</div>
            <div className="sm muted mt8">unidades / mes para cubrir todos los costos fijos</div>
            {!peU && !pv && <div className="sm muted" style={{ marginTop: 6 }}>Requiere precio de venta y costo variable</div>}
          </div>

          <div className="pe-box" style={{ background: "linear-gradient(135deg,rgba(16,185,129,.1),rgba(16,185,129,.03))", border: "1px solid rgba(16,185,129,.3)" }}>
            <div className="sm muted" style={{ textTransform: "uppercase", letterSpacing: .5, marginBottom: 6 }}>💰 Punto de Equilibrio — Ingresos</div>
            <div className="big-num grn">{peI ? fmtCOP(peI) : "—"}</div>
            <div className="sm muted mt8">en ventas / mes para no perder ni ganar</div>
          </div>

          {/* VERIFICACIÓN */}
          {peU && (
            <div className="card mb14">
              <div className="card-title">Verificación en el PE</div>
              {[
                ["Ingresos totales", fmtCOP(Math.ceil(peU) * pv), "var(--accent)"],
                ["Costos variables", fmtCOP(Math.ceil(peU) * cv), "var(--red)"],
                ["Costos fijos", fmtCOP(cf), "var(--red)"],
              ].map(([l, v, c]) => (
                <div key={l} className="rr"><span style={{ flex: 1 }}>{l}</span><span className="mono" style={{ color: c }}>{v}</span></div>
              ))}
              <div className="tot">
                <span>Utilidad en PE</span>
                <span className="mono grn" style={{ fontSize: 15 }}>{fmtCOP(Math.ceil(peU) * pv - Math.ceil(peU) * cv - cf)}</span>
              </div>
            </div>
          )}

          {/* GOOGLE SHEETS */}
          <div className="card">
            <div className="fb mb14">
              <div className="card-title" style={{ margin: 0 }}>🔗 Importar Margen desde Google Sheets</div>
              <button className="btn btn-g btn-sm" onClick={() => setShowGsHelp(p => !p)}>
                {showGsHelp ? "Ocultar" : "¿Cómo configurar?"}
              </button>
            </div>

            {showGsHelp && (
              <div className="infobox">
                <strong>Pasos para conectar Google Sheets:</strong>
                <ol style={{ paddingLeft: 18, marginTop: 8, lineHeight: 2.2 }}>
                  <li>Ir a <a href="https://console.cloud.google.com" target="_blank" rel="noreferrer" style={{ color: "var(--blue)" }}>console.cloud.google.com</a></li>
                  <li>Crear un proyecto → Habilitar <strong>Google Sheets API</strong></li>
                  <li>Crear credencial → <strong>OAuth 2.0 Client ID</strong> (tipo: Web application)</li>
                  <li>En "Orígenes de JavaScript autorizados" agregar:
                    <code style={{ display: "block", background: "var(--surf3)", padding: "4px 8px", borderRadius: 4, marginTop: 4, fontSize: 11 }}>
                      https://tu-app.vercel.app<br />http://localhost:5173
                    </code>
                  </li>
                  <li>Copiar el <strong>Client ID</strong> y pegarlo abajo</li>
                </ol>
              </div>
            )}

            <div className="ig">
              <label className="il">Client ID de Google OAuth</label>
              <input className="inp" value={gSheetConfig.clientId}
                onChange={gsc("clientId")}
                placeholder="xxxxxxx.apps.googleusercontent.com" />
            </div>

            <button className="btn btn-grn" style={{ width: "100%", marginBottom: 14 }}
              onClick={connectGoogle} disabled={!gSheetConfig.clientId.trim()}>
              {isConnected ? "🔄 Reconectar con Google" : "🔐 Conectar con Google"}
            </button>

            {isConnected && (
              <div style={{ borderTop: "1px solid var(--border)", paddingTop: 14 }}>
                <div className="ig">
                  <label className="il">ID del Spreadsheet</label>
                  <input className="inp" value={gSheetConfig.spreadsheetId}
                    onChange={gsc("spreadsheetId")}
                    placeholder="1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74..." />
                </div>
                <div className="ig">
                  <label className="il">Celda con el margen de contribución</label>
                  <input className="inp" value={gSheetConfig.range}
                    onChange={gsc("range")}
                    placeholder="Hoja1!B5" />
                </div>
                <button className="btn btn-p" style={{ width: "100%" }}
                  onClick={importMargin}
                  disabled={importing || !gSheetConfig.spreadsheetId.trim()}>
                  {importing ? "⏳ Importando..." : "📥 Importar Margen"}
                </button>
              </div>
            )}

            {gsStatus && (
              <div className={`gs-status${isConnected && gsStatus.startsWith("✅") ? " gs-connected" : ""}`}>
                {gsStatus}
              </div>
            )}

            {gSheetConfig.importedMcPct != null && (
              <div className="stat mt8">
                <div className="stat-l">🟢 Margen importado activo</div>
                <div className="stat-v g">{fmtPct(+gSheetConfig.importedMcPct)}</div>
                <div className="stat-s">
                  Usado en todos los cálculos de PE ·{" "}
                  <span style={{ cursor: "pointer", color: "var(--red)" }} onClick={clearImported}>
                    ✕ limpiar
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── QUICK SIM ─────────────────────────────────────────────────────────────
function QuickSim({ schema, tipoEsquema }) {
  const [v, setV] = useState("");
  const c = v ? calcComision(+v, schema, tipoEsquema) : 0;
  return (
    <div>
      <div className="ig" style={{ marginBottom: 8 }}><label className="il">Ventas período (COP)</label><input className="inp" type="number" value={v} onChange={e => setV(e.target.value)} placeholder="8000000" /></div>
      {v && <div className="fb" style={{ paddingTop: 8, borderTop: "1px solid var(--border)" }}><span className="muted sm">Comisión calculada</span><span className="mono grn" style={{ fontSize: 18, fontWeight: 700 }}>{fmtCOP(c)}</span></div>}
    </div>
  );
}

// ─── COMISIONES TAB ────────────────────────────────────────────────────────
function ComisionesTab({ globalSchema, setGlobalSchema, schemas, setSchemas, employees, tipoEsquema, setTipoEsquema }) {
  const [selId, setSelId] = useState("global");
  const empCon = employees.filter(e => e.schemaPropio);
  const cur = selId === "global" ? globalSchema : (schemas[selId] || globalSchema);
  const setCur = fn => selId === "global" ? setGlobalSchema(fn) : setSchemas(p => ({ ...p, [selId]: fn(p[selId] || [...globalSchema]) }));
  const addT = () => setCur(p => [...p, { id: uid(), desde: 0, hasta: "", pct: 0 }]);
  const removeT = id => setCur(p => p.filter(t => t.id !== id));
  const updT = (id, k, v) => setCur(p => p.map(t => t.id === id ? { ...t, [k]: v } : t));
  return (
    <div>
      <div className="sec-title">💰 Esquema de Comisiones</div>
      <div className="card mb14">
        <div className="card-title">Modelo de Cálculo de Comisión</div>
        <div className="toggle-row">
          <button className={`toggle-btn${tipoEsquema === "por_tramo" ? " on" : ""}`} onClick={() => setTipoEsquema("por_tramo")}>📊 Por Tramo (% sobre ventas totales)</button>
          <button className={`toggle-btn${tipoEsquema === "marginal" ? " on" : ""}`} onClick={() => setTipoEsquema("marginal")}>📈 Marginal (% solo sobre el tramo incremental)</button>
        </div>
        <div className="infobox" style={{ marginBottom: 0 }}>
          {tipoEsquema === "por_tramo"
            ? '✅ Por Tramo: si vendes $200M y tu tramo es 10M–∞ al 1%, la comisión es $200M × 1% = $2.000.000.'
            : '📈 Marginal: la comisión se calcula por cada "pedazo" de ventas dentro de su tramo. Cada tramo acumula su parte.'}
        </div>
      </div>
      <div className="g2">
        <div>
          <div className="card mb14">
            <div className="card-title">Esquema a Editar</div>
            <div className="ig"><select className="sel" value={selId} onChange={e => setSelId(e.target.value)}>
              <option value="global">🌐 Esquema Global (predeterminado)</option>
              {empCon.map(e => <option key={e.id} value={e.id}>👤 {e.nombre} – Personalizado</option>)}
            </select></div>
            <div className="card-title">Tramos Escalonados</div>
            {[...cur].sort((a, b) => (+a.desde || 0) - (+b.desde || 0)).map((t, i) => (
              <div key={t.id} className="tr">
                <div className="muted sm" style={{ width: 18 }}>#{i + 1}</div>
                <div style={{ flex: 1 }}><input className="inp" type="number" value={t.desde} onChange={e => updT(t.id, "desde", e.target.value)} placeholder="Desde" /></div>
                <div className="muted sm" style={{ padding: "0 3px" }}>→</div>
                <div style={{ flex: 1 }}><input className="inp" type="number" value={t.hasta} onChange={e => updT(t.id, "hasta", e.target.value)} placeholder="Hasta (∞)" /></div>
                <div style={{ width: 70 }}><input className="inp" type="number" value={t.pct} onChange={e => updT(t.id, "pct", e.target.value)} placeholder="%" /></div>
                <button className="btn btn-d btn-sm" onClick={() => removeT(t.id)}>✕</button>
              </div>
            ))}
            <button className="btn btn-g btn-sm mt8" onClick={addT}>+ Agregar Tramo</button>
          </div>
        </div>
        <div>
          <div className="card mb14">
            <div className="card-title">Tabla del Esquema</div>
            <table>
              <thead><tr><th>#</th><th style={{ textAlign: "right" }}>Desde</th><th style={{ textAlign: "right" }}>Hasta</th><th style={{ textAlign: "right" }}>Comisión</th></tr></thead>
              <tbody>
                {[...cur].sort((a, b) => (+a.desde || 0) - (+b.desde || 0)).map((t, i) => (
                  <tr key={t.id}>
                    <td style={{ color: "var(--accent)", fontWeight: 700 }}>#{i + 1}</td>
                    <td style={{ textAlign: "right", fontFamily: "var(--mono)" }}>{fmtCOP(+t.desde || 0)}</td>
                    <td style={{ textAlign: "right", fontFamily: "var(--mono)", color: "var(--muted)" }}>{t.hasta ? fmtCOP(+t.hasta) : "Sin límite ∞"}</td>
                    <td style={{ textAlign: "right", fontFamily: "var(--mono)", color: "var(--green)", fontWeight: 700 }}>{fmtPct(+t.pct || 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="card">
            <div className="card-title">Simulación rápida</div>
            <QuickSim schema={cur} tipoEsquema={tipoEsquema} />
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── SIMULADOR TAB ─────────────────────────────────────────────────────────
function SimuladorTab({ employees, beParams, schemas, globalSchema, tipoEsquema, simEmpId, setSimEmpId, simVentas, setSimVentas, gSheetConfig }) {
  const ventas = simVentas, setVentas = setSimVentas;
  const emp = employees.find(e => e.id === simEmpId);

  const calc = useMemo(() => {
    if (!emp) return null;
    const v = +ventas || 0;
    const schema = emp.schemaPropio ? (schemas[emp.id] || globalSchema) : globalSchema;
    const comision = emp.comisiones ? calcComision(v, schema, tipoEsquema) : 0;
    const { costoTotal, rubros, ext, porcCarga } = calcCostos(emp.salario, emp.arlRate, emp.subsidio, emp.categoria);

    const esPrestacion = emp.categoria === "prestacion";
    const cargaEmpresaComision = (!esPrestacion && emp.comisiones) ? comision * (porcCarga / 100) : 0;
    const descEmpleado = esPrestacion ? 0 : (emp.salario + comision) * 0.08;
    const salarioNeto = (emp.salario + comision) - descEmpleado;
    const costoEmpresa = costoTotal + comision + cargaEmpresaComision;

    const pv = +beParams.precioVenta || 0, cv_ = +beParams.costoVariable || 0;
    const mcPctCalc = pv > 0 ? (pv - cv_) / pv : 0;
    const mcPct = gSheetConfig?.importedMcPct != null ? +gSheetConfig.importedMcPct / 100 : mcPctCalc;
    const ventaRequerida = mcPct > 0 ? costoEmpresa / mcPct : null;
    const progreso = ventaRequerida && v > 0 ? v / ventaRequerida : 0;
    return { emp, v, comision, cargaEmpresaComision, costoEmpresa, salarioNeto, descEmpleado, costoTotal, rubros, ext, porcCarga, ventaRequerida, mcPct, progreso };
  }, [emp, ventas, schemas, globalSchema, tipoEsquema, beParams, gSheetConfig]);

  return (
    <div>
      <div className="sec-title">🧮 Simulador de Liquidación</div>
      <div className="g2">
        <div className="card">
          <div className="card-title">Parámetros</div>
          <div className="ig"><label className="il">Empleado</label>
            <select className="sel" value={simEmpId} onChange={e => setSimEmpId(e.target.value)}>
              <option value="">Seleccionar empleado...</option>
              {employees.map(e => <option key={e.id} value={e.id}>{e.nombre} — {e.cargo || "Sin cargo"}</option>)}
            </select>
          </div>
          {calc && <>
            <div className="ig"><label className="il">Ventas del período (COP)</label><input className="inp" type="number" value={ventas} onChange={e => setVentas(e.target.value)} placeholder="0" /></div>
            <div className="stat mt8">
              <div className="stat-l">Esquema / Modelo</div>
              <div style={{ fontSize: 12, color: "var(--text)", marginTop: 3 }}>{emp.comisiones ? (emp.schemaPropio ? "Personalizado" : "Global") + " · " + tipoEsquema : "Sin comisiones"}</div>
            </div>
            {gSheetConfig?.importedMcPct != null && (
              <div className="infobox mt8">📊 Margen desde Sheets: <strong style={{ color: "var(--green)" }}>{fmtPct(+gSheetConfig.importedMcPct)}</strong></div>
            )}
            {!beParams.precioVenta && !gSheetConfig?.importedMcPct && <div className="sm muted mt8">⚠️ Configura el Punto de Equilibrio para ver el presupuesto individual</div>}
          </>}
          {!employees.length && <div className="muted">Agrega empleados primero en la pestaña Empleados</div>}
        </div>

        {calc ? (
          <div>
            <div className="card mb14">
              <div className="card-title">Resumen del Período</div>
              <div className="g2">
                <div className="stat"><div className="stat-l">Ventas realizadas</div><div className="stat-v b">{fmtCOP(calc.v)}</div></div>
                <div className="stat"><div className="stat-l">Comisión generada</div><div className="stat-v g">{fmtCOP(calc.comision)}</div></div>
              </div>
            </div>

            <div className="card mb14">
              <div className="card-title">✅ Lo que recibe el empleado</div>
              <div className="rr"><span style={{ flex: 1 }}>Salario base</span><span className="mono">{fmtCOP(emp.salario)}</span></div>
              {calc.comision > 0 && <div className="rr"><span style={{ flex: 1, color: "var(--green)" }}>Comisión por ventas (factor salarial)</span><span className="mono grn">+{fmtCOP(calc.comision)}</span></div>}
              <div className="rr"><span style={{ flex: 1 }}>Base {calc.emp.categoria === "prestacion" ? "honorario" : "salarial"} total</span><span className="mono">{fmtCOP(emp.salario + calc.comision)}</span></div>
              {calc.descEmpleado > 0
                ? <div className="rr"><span style={{ flex: 1, color: "var(--red)" }}>(-) Aportes empleado salud + pensión (8% sobre base total)</span><span className="mono red">-{fmtCOP(calc.descEmpleado)}</span></div>
                : <div className="rr"><span style={{ flex: 1, color: "var(--muted)" }}>Aportes independiente (por cuenta del contratista)</span><span className="mono muted" style={{ fontSize: 11 }}>Cuenta propia</span></div>
              }
              <div className="tot"><span>{calc.emp.categoria === "prestacion" ? "HONORARIO NETO" : "SALARIO NETO EMPLEADO"}</span><span className="mono grn" style={{ fontSize: 18, fontWeight: 700 }}>{fmtCOP(calc.salarioNeto)}</span></div>
            </div>

            <div className="card mb14">
              <div className="card-title">🏢 Lo que paga la empresa</div>
              <div className="rr"><span style={{ flex: 1 }}>Costo fijo nómina (salario + cargas)</span><span className="mono">{fmtCOP(calc.costoTotal)}</span></div>
              {calc.comision > 0 && <>
                <div className="rr"><span style={{ flex: 1, color: "var(--accent)" }}>Comisión / honorario variable</span><span className="mono acc">+{fmtCOP(calc.comision)}</span></div>
                {calc.cargaEmpresaComision > 0 && (
                  <div className="rr" style={{ background: "rgba(239,68,68,.04)" }}>
                    <span style={{ flex: 1, color: "var(--red)" }}>
                      Carga prestacional + parafiscal sobre comisión ({fmtPct(calc.porcCarga)})
                      <div className="sm muted">Art. 127 CST: comisiones son factor salarial</div>
                    </span>
                    <span className="mono red">+{fmtCOP(calc.cargaEmpresaComision)}</span>
                  </div>
                )}
                {calc.emp.categoria === "prestacion" && <div className="rr"><span style={{ flex: 1, color: "var(--green)" }}>Sin carga social sobre comisión (prestación de servicios)</span><span className="mono grn">$0</span></div>}
              </>}
              <div className="tot"><span>COSTO TOTAL EMPRESA</span><span className="mono red" style={{ fontSize: 18, fontWeight: 700 }}>{fmtCOP(calc.costoEmpresa)}</span></div>
            </div>

            {calc.ventaRequerida && (
              <div className="card">
                <div className="card-title">🎯 Venta Requerida para Cubrir Costo Total</div>
                <div className="infobox" style={{ marginBottom: 12 }}>
                  Costo total empresa <strong style={{ color: "var(--red)" }}>{fmtCOP(calc.costoEmpresa)}</strong> ÷ margen de contribución <strong style={{ color: "var(--green)" }}>{fmtPct(calc.mcPct * 100)}</strong>
                </div>
                <div className="stat mb14">
                  <div className="stat-l">Venta mínima requerida</div>
                  <div className="stat-v">{fmtCOP(calc.ventaRequerida)}</div>
                  <div className="stat-s">cubre salario + cargas + comisión + carga sobre comisión</div>
                </div>
                {calc.v > 0 && <>
                  <div className="fb mb8 sm muted">
                    <span>Progreso vs venta requerida</span>
                    <span style={{ color: calc.v >= calc.ventaRequerida ? "var(--green)" : "var(--accent)", fontWeight: 700 }}>{fmtPct(Math.min(calc.progreso * 100, 100))}</span>
                  </div>
                  <div className="pb"><div className="pf" style={{ width: `${Math.min(calc.progreso * 100, 100)}%`, background: calc.v >= calc.ventaRequerida ? "var(--green)" : "var(--accent)" }} /></div>
                  <div className="sm mt8" style={{ color: calc.v >= calc.ventaRequerida ? "var(--green)" : "var(--accent)" }}>
                    {calc.v >= calc.ventaRequerida ? `✅ Superó por ${fmtCOP(calc.v - calc.ventaRequerida)}` : `⚠️ Falta ${fmtCOP(calc.ventaRequerida - calc.v)} para cubrir el costo total`}
                  </div>
                </>}
              </div>
            )}
          </div>
        ) : (
          <div className="card"><div className="empty" style={{ padding: "32px 0" }}><div className="empty-i">🧮</div><div className="empty-t">Selecciona un empleado</div><div className="muted">para simular su liquidación</div></div></div>
        )}
      </div>
    </div>
  );
}

// ─── EXPORTAR TAB ──────────────────────────────────────────────────────────
function ExportarTab({ employees, onXML, onCSV }) {
  const [gsId, setGsId] = useState("");
  const [gsKey, setGsKey] = useState("");
  const [gsRange, setGsRange] = useState("Sheet1!A1");
  const [gsStatus, setGsStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const exportSheets = async () => {
    if (!gsId || !gsKey) { setGsStatus("⚠️ Ingresa el ID del Spreadsheet y tu API Key"); return; }
    setLoading(true); setGsStatus("⏳ Enviando...");
    const values = [["ID", "Nombre", "Cargo", "Salario Base", "ARL%", "Subsidio", "Carga Social", "Costo Total Empresa"], ...employees.map(e => { const { totalRubros, costoTotal } = calcCostos(e.salario, e.arlRate, e.subsidio, e.categoria); return [e.id, e.nombre, e.cargo || "", e.salario, e.arlRate, e.subsidio ? "Sí" : "No", Math.round(totalRubros), Math.round(costoTotal)]; })];
    try {
      const url = `https://sheets.googleapis.com/v4/spreadsheets/${gsId}/values/${encodeURIComponent(gsRange)}:append?valueInputOption=RAW&key=${gsKey}`;
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ values }) });
      const data = await res.json();
      if (data.error) throw new Error(data.error.message);
      setGsStatus("✅ Datos enviados correctamente!");
    } catch (e) { setGsStatus(`❌ Error: ${e.message}`); }
    setLoading(false);
  };
  return (
    <div>
      <div className="sec-title">📤 Exportar Datos</div>
      <div className="g2">
        <div>
          <div className="card mb14">
            <div className="card-title">Exportación Local</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <button className="btn btn-p" onClick={onXML} disabled={!employees.length}>📄 Descargar XML</button>
              <button className="btn btn-g" onClick={onCSV} disabled={!employees.length}>📊 Descargar CSV</button>
              {!employees.length && <div className="muted sm">Agrega empleados primero</div>}
            </div>
          </div>
          <div className="card">
            <div className="card-title">Vista previa XML</div>
            <pre>{employees.length ? toXML(employees.slice(0, 1)) : "<!-- Agrega empleados para ver preview -->"}</pre>
          </div>
        </div>
        <div className="card">
          <div className="card-title">🔗 Exportar a Google Sheets</div>
          <div className="infobox">ℹ️ Necesitas una <strong style={{ color: "var(--blue)" }}>API Key</strong> con permisos de escritura desde <a href="https://console.cloud.google.com" target="_blank" rel="noreferrer" style={{ color: "var(--blue)" }}>Google Cloud Console</a>. Si prefieres algo más simple, descarga el CSV e impórtalo en Sheets.</div>
          <div className="ig"><label className="il">ID del Spreadsheet</label><input className="inp" value={gsId} onChange={e => setGsId(e.target.value)} placeholder="1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74..." /></div>
          <div className="ig"><label className="il">Google API Key</label><input className="inp" type="password" value={gsKey} onChange={e => setGsKey(e.target.value)} placeholder="AIza..." /></div>
          <div className="ig"><label className="il">Rango destino</label><input className="inp" value={gsRange} onChange={e => setGsRange(e.target.value)} /></div>
          <button className="btn btn-grn" style={{ width: "100%" }} onClick={exportSheets} disabled={!employees.length || loading}>{loading ? "Enviando..." : "🚀 Enviar a Google Sheets"}</button>
          {gsStatus && <div style={{ marginTop: 10, padding: 10, background: "var(--surf2)", borderRadius: 6, fontSize: 12, textAlign: "center" }}>{gsStatus}</div>}
          <div className="div" />
          <button className="btn btn-g" style={{ width: "100%" }} onClick={onCSV} disabled={!employees.length}>📊 Descargar CSV para importar a Sheets</button>
        </div>
      </div>
    </div>
  );
}

// ─── APP ROOT ──────────────────────────────────────────────────────────────
export default function App() {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const [isLoggedIn, setIsLoggedIn] = useState(() => localStorage.getItem("sf_auth") === "true");

  // ── Core state ────────────────────────────────────────────────────────────
  const [tab, setTab] = useState("empleados");
  const [employees, setEmployees] = useState(() => ls("sf_emp", []));
  const [selEmpId, setSelEmpId] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [editEmpId, setEditEmpId] = useState(null);
  const [globalSchema, setGlobalSchema] = useState(() => ls("sf_schema", [
    { id: uid(), desde: 0, hasta: 5000000, pct: 3 },
    { id: uid(), desde: 5000000, hasta: 10000000, pct: 5 },
    { id: uid(), desde: 10000000, hasta: "", pct: 8 },
  ]));
  const [schemas, setSchemas] = useState(() => ls("sf_schemas", {}));
  const [tipoEsquema, setTipoEsquema] = useState(() => ls("sf_tipo", "por_tramo"));

  // ── Breakeven state (migrates old keys) ───────────────────────────────────
  const [beParams, setBeParams] = useState(() => {
    const saved = ls("sf_be", null);
    return {
      precioVenta: saved?.precioVenta || "",
      costoVariable: saved?.costoVariable || "",
      margenDeseado: saved?.margenDeseado || saved?.margenRentabilidad || "",
    };
  });

  // ── Dynamic fixed costs (new) ─────────────────────────────────────────────
  const [costosFijos, setCostosFijos] = useState(() => ls("sf_costos", []));

  // ── Google Sheets config (accessToken NOT persisted) ──────────────────────
  const [gSheetConfig, setGSheetConfig] = useState(() => ({
    accessToken: null, // never persist tokens
    ...ls("sf_gsheet", { clientId: "", spreadsheetId: "", range: "Hoja1!A1", importedMcPct: null }),
  }));

  // ── Simulator state ───────────────────────────────────────────────────────
  const [simEmpId, setSimEmpId] = useState(() => ls("sf_simEmpId", ""));
  const [simVentas, setSimVentas] = useState(() => ls("sf_simVentas", ""));

  const EMPTY_FORM = { nombre: "", cargo: "", salario: "", arlRate: "0.522", subsidio: false, comisiones: false, schemaPropio: false, categoria: "empleado" };
  const [addForm, setAddForm] = useState(EMPTY_FORM);

  // ── Persistence effects ───────────────────────────────────────────────────
  useEffect(() => { localStorage.setItem("sf_emp", JSON.stringify(employees)); }, [employees]);
  useEffect(() => { localStorage.setItem("sf_schemas", JSON.stringify(schemas)); }, [schemas]);
  useEffect(() => { localStorage.setItem("sf_schema", JSON.stringify(globalSchema)); }, [globalSchema]);
  useEffect(() => { localStorage.setItem("sf_tipo", JSON.stringify(tipoEsquema)); }, [tipoEsquema]);
  useEffect(() => { localStorage.setItem("sf_be", JSON.stringify(beParams)); }, [beParams]);
  useEffect(() => { localStorage.setItem("sf_costos", JSON.stringify(costosFijos)); }, [costosFijos]);
  useEffect(() => { localStorage.setItem("sf_simEmpId", JSON.stringify(simEmpId)); }, [simEmpId]);
  useEffect(() => { localStorage.setItem("sf_simVentas", JSON.stringify(simVentas)); }, [simVentas]);
  useEffect(() => {
    // Persist gSheetConfig WITHOUT the accessToken (security)
    const { accessToken, ...toSave } = gSheetConfig;
    localStorage.setItem("sf_gsheet", JSON.stringify(toSave));
  }, [gSheetConfig]);

  // ── Derived state ─────────────────────────────────────────────────────────
  const totalNomina = useMemo(() =>
    employees.reduce((s, e) => s + calcCostos(e.salario, e.arlRate, e.subsidio, e.categoria).costoTotal, 0),
    [employees]
  );

  // ── Employee actions ──────────────────────────────────────────────────────
  const openEdit = emp => {
    setAddForm({ nombre: emp.nombre, cargo: emp.cargo || "", salario: emp.salario.toString(), arlRate: emp.arlRate.toString(), subsidio: emp.subsidio, comisiones: emp.comisiones, schemaPropio: emp.schemaPropio, categoria: emp.categoria || "empleado" });
    setEditEmpId(emp.id);
    setShowAdd(true);
  };

  const saveEmployee = () => {
    if (!addForm.nombre || !addForm.salario) return;
    if (editEmpId) {
      setEmployees(p => p.map(e => e.id === editEmpId ? { ...e, nombre: addForm.nombre, cargo: addForm.cargo, salario: +addForm.salario, arlRate: +addForm.arlRate, subsidio: addForm.subsidio, comisiones: addForm.comisiones, schemaPropio: addForm.schemaPropio, categoria: addForm.categoria || "empleado" } : e));
      setEditEmpId(null);
    } else {
      const emp = { id: uid(), nombre: addForm.nombre, cargo: addForm.cargo, salario: +addForm.salario, arlRate: +addForm.arlRate, subsidio: addForm.subsidio, comisiones: addForm.comisiones, schemaPropio: addForm.schemaPropio, categoria: addForm.categoria || "empleado" };
      setEmployees(p => [...p, emp]);
      if (emp.schemaPropio) setSchemas(p => ({ ...p, [emp.id]: globalSchema.map(t => ({ ...t, id: uid() })) }));
      setSelEmpId(emp.id);
    }
    setAddForm(EMPTY_FORM);
    setShowAdd(false);
  };

  const deleteEmployee = id => {
    setEmployees(p => p.filter(e => e.id !== id));
    if (selEmpId === id) setSelEmpId(null);
  };

  const closeModal = () => { setShowAdd(false); setEditEmpId(null); setAddForm(EMPTY_FORM); };

  const logout = () => {
    localStorage.removeItem("sf_auth");
    setIsLoggedIn(false);
  };

  // ── Render ────────────────────────────────────────────────────────────────
  if (!isLoggedIn) return (
    <>
      <style>{CSS}</style>
      <LoginScreen onLogin={() => setIsLoggedIn(true)} />
    </>
  );

  return (
    <>
      <style>{CSS}</style>
      <div className="app">
        <div className="hdr">
          <div className="hdr-logo">⚡</div>
          <div>
            <div className="hdr-title">Dspacios Finanzas</div>
            <div className="hdr-sub">Costos Laborales · Punto de Equilibrio · Comisiones</div>
          </div>
          <div className="hdr-stats">
            <div className="hdr-stat">
              <div className="hdr-stat-v">{employees.length}</div>
              <div className="hdr-stat-l">empleados</div>
            </div>
            <div className="hdr-stat">
              <div className="hdr-stat-v">{fmtCOP(totalNomina)}</div>
              <div className="hdr-stat-l">nómina/mes</div>
            </div>
            <div className="user-chip">
              <span className="user-chip-name">👤 {ADMIN_USER}</span>
              <span style={{ color: "var(--border)" }}>|</span>
              <button className="logout-btn" onClick={logout}>Salir →</button>
            </div>
          </div>
        </div>

        <div className="nav">
          {TABS.map(t => (
            <button key={t.id} className={`nav-btn${tab === t.id ? " active" : ""}`} onClick={() => setTab(t.id)}>
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        <div className="main">
          {tab === "empleados" && <EmpleadosTab employees={employees} selEmpId={selEmpId} setSelEmpId={setSelEmpId} setShowAdd={setShowAdd} deleteEmployee={deleteEmployee} openEdit={openEdit} />}
          {tab === "presupuesto" && <PresupuestoTab employees={employees} beParams={beParams} gSheetConfig={gSheetConfig} />}
          {tab === "breakeven" && <BreakevenTab beParams={beParams} setBeParams={setBeParams} costosFijos={costosFijos} setCostosFijos={setCostosFijos} totalNomina={totalNomina} gSheetConfig={gSheetConfig} setGSheetConfig={setGSheetConfig} />}
          {tab === "comisiones" && <ComisionesTab globalSchema={globalSchema} setGlobalSchema={setGlobalSchema} schemas={schemas} setSchemas={setSchemas} employees={employees} tipoEsquema={tipoEsquema} setTipoEsquema={setTipoEsquema} />}
          {tab === "simulador" && <SimuladorTab employees={employees} beParams={beParams} schemas={schemas} globalSchema={globalSchema} tipoEsquema={tipoEsquema} simEmpId={simEmpId} setSimEmpId={setSimEmpId} simVentas={simVentas} setSimVentas={setSimVentas} gSheetConfig={gSheetConfig} />}
          {tab === "exportar" && <ExportarTab employees={employees} onXML={() => dlFile(toXML(employees), "empleados.xml", "application/xml")} onCSV={() => dlFile(toCSV(employees), "empleados.csv", "text/csv")} />}
        </div>
      </div>

      {showAdd && (
        <div className="overlay" onClick={closeModal}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-t">{editEmpId ? "✏️ Editar Empleado" : "➕ Nuevo Empleado"}</div>
            <AddForm form={addForm} setForm={setAddForm} onSave={saveEmployee} onCancel={closeModal} isEdit={!!editEmpId} />
          </div>
        </div>
      )}
    </>
  );
}