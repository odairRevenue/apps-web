import { useState, useMemo } from "react";

// ─── CONSTANTS ─────────────────────────────────────────────────────────────
const SMMLV = 1300000;
const SUBSIDIO_T = 162000;
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

function calcCostos(salario, arlRate, subsidio) {
  const s = +salario || 0;
  const mas10 = s > SMMLV * 10;
  const rubros = [
    { cat: "Parafiscal", nombre: "Salud Empleador", pct: 8.5 },
    { cat: "Parafiscal", nombre: "Pensión Empleador", pct: 12 },
    { cat: "Parafiscal", nombre: `ARL (${ARL_OPTS.find(a => a.rate === (+arlRate || 0.522))?.label || "Clase I"})`, pct: +arlRate || 0.522 },
    { cat: "Parafiscal", nombre: "Caja de Compensación Familiar", pct: 4 },
    ...(mas10 ? [
      { cat: "Parafiscal", nombre: "SENA", pct: 2 },
      { cat: "Parafiscal", nombre: "ICBF", pct: 3 },
    ] : []),
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

function calcComision(ventas, schema) {
  if (!schema || !schema.length) return 0;
  let total = 0;
  const sorted = [...schema].sort((a, b) => (+a.desde || 0) - (+b.desde || 0));
  for (const t of sorted) {
    const desde = +t.desde || 0;
    const hasta = t.hasta === "" || t.hasta == null ? Infinity : +t.hasta;
    if (ventas <= desde) break;
    total += (Math.min(ventas, hasta) - desde) * ((+t.pct || 0) / 100);
  }
  return total;
}

function toXML(employees) {
  const rows = employees.map(emp => {
    const { costoTotal, rubros } = calcCostos(emp.salario, emp.arlRate, emp.subsidio);
    const rb = rubros.map(r => `      <Rubro nombre="${r.nombre}" categoria="${r.cat}" porcentaje="${r.pct}" valor="${Math.round(r.valor)}"/>`).join("\n");
    return `  <Empleado id="${emp.id}" nombre="${emp.nombre}" cargo="${emp.cargo || ""}">\n    <SalarioBase>${emp.salario}</SalarioBase>\n    <CostoTotal>${Math.round(costoTotal)}</CostoTotal>\n    <Rubros>\n${rb}\n    </Rubros>\n  </Empleado>`;
  }).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<Empleados fecha="${new Date().toISOString()}">\n${rows}\n</Empleados>`;
}

function toCSV(employees) {
  const hd = ["ID", "Nombre", "Cargo", "Salario Base", "ARL%", "Subsidio Transp.", "Total Carga Social", "Costo Total Empresa"];
  const rows = employees.map(e => {
    const { totalRubros, costoTotal } = calcCostos(e.salario, e.arlRate, e.subsidio);
    return [e.id, e.nombre, e.cargo || "", e.salario, e.arlRate, e.subsidio ? "Sí" : "No", Math.round(totalRubros), Math.round(costoTotal)].join(",");
  });
  return [hd.join(","), ...rows].join("\n");
}

function download(content, name, type) {
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
.ecost{font-family:var(--mono);color:var(--accent);font-weight:600;font-size:13px;margin-left:auto;text-align:right;}
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
.tot{display:flex;justify-content:space-between;align-items:center;padding:10px 0 0;border-top:1px solid var(--border);margin-top:6px;font-weight:700;}
.div{border:none;border-top:1px solid var(--border);margin:14px 0;}
.empty{text-align:center;padding:48px 24px;color:var(--muted);}
.empty-i{font-size:44px;margin-bottom:10px;}
.empty-t{font-size:15px;font-weight:700;margin-bottom:5px;color:var(--text);}
.hbox{background:rgba(245,158,11,.06);border:1px solid rgba(245,158,11,.22);border-radius:8px;padding:14px;margin-bottom:14px;}
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
.sm{font-size:11px;}
.panel-split{display:grid;grid-template-columns:300px 1fr;gap:18px;}
.overlay{position:fixed;inset:0;background:rgba(0,0,0,.72);display:flex;align-items:center;justify-content:center;z-index:200;padding:20px;}
.modal{background:var(--surf);border:1px solid var(--border);border-radius:14px;padding:22px;width:100%;max-width:460px;max-height:85vh;overflow-y:auto;}
.modal-t{font-size:17px;font-weight:800;margin-bottom:18px;}
.big-num{font-family:var(--mono);font-size:30px;font-weight:700;}
.pe-box{border-radius:10px;padding:18px;margin-bottom:10px;}
table{width:100%;border-collapse:collapse;}
th{padding:8px 10px;text-align:left;font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;font-weight:700;border-bottom:2px solid var(--border);}
td{padding:10px;font-size:12px;border-bottom:1px solid var(--border);}
tr:last-child td{border-bottom:none;}
pre{font-size:10px;color:var(--muted);overflow:auto;max-height:180px;background:var(--surf2);padding:10px;border-radius:6px;font-family:var(--mono);white-space:pre-wrap;}
`;

// ─── SUBCOMPONENTS ─────────────────────────────────────────────────────────

function EmpDetalle({ emp }) {
  const { rubros, totalRubros, costoTotal, porcCarga, ext } = calcCostos(emp.salario, emp.arlRate, emp.subsidio);
  const descEmp = emp.salario * 0.08; // 4% salud + 4% pension
  const netoCop = emp.salario - descEmp;

  return (
    <>
      <div className="card mb14">
        <div className="card-title">Resumen costos — {emp.nombre}</div>
        <div className="g4">
          <div className="stat"><div className="stat-l">Salario Base</div><div className="stat-v b">{fmtCOP(emp.salario)}</div></div>
          <div className="stat"><div className="stat-l">Carga Social</div><div className="stat-v">{fmtCOP(totalRubros)}</div><div className="stat-s">{fmtPct(porcCarga)} del salario</div></div>
          {ext > 0 && <div className="stat"><div className="stat-l">Subsidio Transporte</div><div className="stat-v g">{fmtCOP(ext)}</div></div>}
          <div className="stat"><div className="stat-l">Costo Total Empresa</div><div className="stat-v r">{fmtCOP(costoTotal)}</div><div className="stat-s">+{fmtPct((costoTotal / emp.salario - 1) * 100)} sobre salario</div></div>
        </div>
      </div>

      <div className="card">
        <div className="card-title">Desglose rubro a rubro</div>
        <div className="rr" style={{ borderBottom: "2px solid var(--border)", paddingBottom: 8, marginBottom: 4 }}>
          <span className="rn" style={{ fontWeight: 700, fontSize: 12 }}>SALARIO BASE</span>
          <span className="rval">{fmtCOP(emp.salario)}</span>
        </div>

        <div style={{ marginBottom: 8, marginTop: 6 }}>
          <div className="muted sm" style={{ marginBottom: 4, fontWeight: 700 }}>→ APORTES PATRONALES</div>
          {rubros.filter(r => r.cat === "Parafiscal").map((r, i) => (
            <div key={i} className="rr">
              <span className="rc rc-P">Paraf</span>
              <span className="rn">{r.nombre}</span>
              <span className="rpct">{fmtPct(r.pct)}</span>
              <span className="rval">{fmtCOP(r.valor)}</span>
            </div>
          ))}
        </div>

        <div style={{ marginBottom: 8 }}>
          <div className="muted sm" style={{ marginBottom: 4, fontWeight: 700 }}>→ PRESTACIONES SOCIALES</div>
          {rubros.filter(r => r.cat === "Prestación").map((r, i) => (
            <div key={i} className="rr">
              <span className="rc rc-R">Prest</span>
              <span className="rn">{r.nombre}</span>
              <span className="rpct">{fmtPct(r.pct)}</span>
              <span className="rval">{fmtCOP(r.valor)}</span>
            </div>
          ))}
        </div>

        {ext > 0 && (
          <div className="rr">
            <span className="rc" style={{ background: "rgba(96,165,250,.12)", color: "var(--blue)" }}>Extra</span>
            <span className="rn">Subsidio de Transporte</span>
            <span className="rpct">Fijo</span>
            <span className="rval">{fmtCOP(ext)}</span>
          </div>
        )}

        <div className="tot">
          <span>COSTO TOTAL EMPRESA / MES</span>
          <span className="mono acc" style={{ fontSize: 18, fontWeight: 700 }}>{fmtCOP(costoTotal)}</span>
        </div>

        <div className="div" />
        <div className="muted sm mb8">Lo que recibe el empleado (aprox.):</div>
        <div style={{ display: "flex", gap: 8 }}>
          <div className="stat" style={{ flex: 1 }}>
            <div className="stat-l">Salario bruto</div>
            <div className="stat-v b">{fmtCOP(emp.salario)}</div>
            <div className="stat-s">antes de deducciones</div>
          </div>
          <div className="stat" style={{ flex: 1 }}>
            <div className="stat-l">Aportes empleado (8%)</div>
            <div className="stat-v r">-{fmtCOP(descEmp)}</div>
            <div className="stat-s">salud 4% + pensión 4%</div>
          </div>
          <div className="stat" style={{ flex: 1 }}>
            <div className="stat-l">Salario neto base</div>
            <div className="stat-v g">{fmtCOP(netoCop)}</div>
            <div className="stat-s">sin comisiones</div>
          </div>
        </div>
      </div>
    </>
  );
}

function AddForm({ form, setForm, onSave, onCancel }) {
  const set = k => e => setForm(p => ({ ...p, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));
  return (
    <div>
      <div className="ig"><label className="il">Nombre completo *</label><input className="inp" value={form.nombre} onChange={set("nombre")} placeholder="Ej: María Torres" /></div>
      <div className="ig"><label className="il">Cargo / Rol</label><input className="inp" value={form.cargo} onChange={set("cargo")} placeholder="Ej: Asesor Comercial" /></div>
      <div className="ig"><label className="il">Salario Base (COP) *</label><input className="inp" type="number" value={form.salario} onChange={set("salario")} placeholder="1300000" /></div>
      <div className="ig">
        <label className="il">Clase de Riesgo ARL</label>
        <select className="sel" value={form.arlRate} onChange={set("arlRate")}>
          {ARL_OPTS.map(o => <option key={o.rate} value={o.rate}>{o.label} — {o.rate}%</option>)}
        </select>
      </div>
      <label className="ck-row"><input type="checkbox" checked={form.subsidio} onChange={set("subsidio")} /> Aplica Subsidio de Transporte (salario ≤ 2 SMMLV)</label>
      <label className="ck-row"><input type="checkbox" checked={form.comisiones} onChange={set("comisiones")} /> Tiene comisiones por ventas</label>
      {form.comisiones && <label className="ck-row"><input type="checkbox" checked={form.schemaPropio} onChange={set("schemaPropio")} /> Usar esquema de comisiones propio (diferente al global)</label>}
      <div className="flex g8 mt14">
        <button className="btn btn-p" style={{ flex: 1 }} onClick={onSave} disabled={!form.nombre || !form.salario}>Guardar</button>
        <button className="btn btn-g" onClick={onCancel}>Cancelar</button>
      </div>
    </div>
  );
}

function EmpleadosTab({ employees, selEmpId, setSelEmpId, setShowAdd, deleteEmployee }) {
  const totalNomina = employees.reduce((s, e) => s + calcCostos(e.salario, e.arlRate, e.subsidio).costoTotal, 0);

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

      {employees.length === 0 ? (
        <div className="empty"><div className="empty-i">👥</div><div className="empty-t">Sin empleados</div><div className="muted">Agrega tu primer empleado para comenzar</div></div>
      ) : (
        <div className="panel-split">
          <div>
            <div className="card-title">Listado ({employees.length})</div>
            {employees.map(emp => {
              const { costoTotal } = calcCostos(emp.salario, emp.arlRate, emp.subsidio);
              return (
                <div key={emp.id} className={`ec${selEmpId === emp.id ? " sel-" : ""}`} onClick={() => setSelEmpId(emp.id)}>
                  <div className="av">{emp.nombre[0].toUpperCase()}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="en">{emp.nombre}</div>
                    <div className="ec-">{emp.cargo || "Sin cargo"}</div>
                    {emp.comisiones && <span className="bdg bdg-a" style={{ marginTop: 3 }}>Comisiones</span>}
                  </div>
                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    <div className="ecost">{fmtCOP(costoTotal)}</div>
                    <div style={{ fontSize: 9, color: "var(--muted)" }}>empresa/mes</div>
                  </div>
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

function PresupuestoTab({ employees, beParams }) {
  const pv = +beParams.precioVenta || 0;
  const cv = +beParams.costoVariable || 0;
  const mc = pv - cv;
  const mcPct = pv > 0 ? mc / pv : 0;
  const totalNomina = employees.reduce((s, e) => s + calcCostos(e.salario, e.arlRate, e.subsidio).costoTotal, 0);

  if (!employees.length) return <div className="empty"><div className="empty-i">📊</div><div className="empty-t">Sin empleados</div><div className="muted">Agrega empleados primero</div></div>;

  return (
    <div>
      <div className="sec-title">📊 Presupuesto de Ventas por Empleado</div>
      {(!pv || !cv) && (
        <div className="hbox mb14">
          ⚠️ <strong>Configura el Precio de Venta y Costo Variable</strong> en la pestaña "Punto de Equilibrio" para ver los presupuestos exactos de cada empleado.
        </div>
      )}
      <div className="card mb14">
        <div className="g3">
          <div className="stat"><div className="stat-l">Costo Nómina Total</div><div className="stat-v r">{fmtCOP(totalNomina)}</div><div className="stat-s">/mes</div></div>
          <div className="stat"><div className="stat-l">Margen de Contribución</div><div className="stat-v g">{mcPct > 0 ? fmtPct(mcPct * 100) : "—"}</div><div className="stat-s">{pv > 0 ? `${fmtCOP(mc)} / unidad` : "Configura PE primero"}</div></div>
          <div className="stat"><div className="stat-l">Presupuesto Global Req.</div><div className="stat-v">{mcPct > 0 ? fmtCOP(totalNomina / mcPct) : "—"}</div><div className="stat-s">para cubrir toda la nómina</div></div>
        </div>
      </div>
      <div className="card" style={{ overflowX: "auto" }}>
        <table>
          <thead>
            <tr>
              <th>Empleado</th>
              <th>Cargo</th>
              <th style={{ textAlign: "right" }}>Salario Base</th>
              <th style={{ textAlign: "right" }}>Costo Empresa</th>
              <th style={{ textAlign: "right" }}>Margen Contrib.</th>
              <th style={{ textAlign: "right" }}>Presupuesto Ventas</th>
              <th style={{ textAlign: "right" }}>% sobre costo</th>
            </tr>
          </thead>
          <tbody>
            {employees.map(emp => {
              const { costoTotal } = calcCostos(emp.salario, emp.arlRate, emp.subsidio);
              const presupuesto = mcPct > 0 ? costoTotal / mcPct : null;
              const multip = presupuesto ? (presupuesto / costoTotal) : null;
              return (
                <tr key={emp.id}>
                  <td><strong>{emp.nombre}</strong></td>
                  <td style={{ color: "var(--muted)" }}>{emp.cargo || "—"}</td>
                  <td style={{ textAlign: "right", fontFamily: "var(--mono)" }}>{fmtCOP(emp.salario)}</td>
                  <td style={{ textAlign: "right", fontFamily: "var(--mono)", color: "var(--red)" }}>{fmtCOP(costoTotal)}</td>
                  <td style={{ textAlign: "right", fontFamily: "var(--mono)", color: "var(--muted)" }}>{mcPct > 0 ? fmtPct(mcPct * 100) : "—"}</td>
                  <td style={{ textAlign: "right", fontFamily: "var(--mono)", color: "var(--accent)", fontWeight: 700 }}>{presupuesto ? fmtCOP(presupuesto) : "—"}</td>
                  <td style={{ textAlign: "right", fontFamily: "var(--mono)", color: "var(--green)" }}>{multip ? `${multip.toFixed(1)}×` : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function BreakevenTab({ beParams, setBeParams, totalCostosFijos }) {
  const set = k => e => setBeParams(p => ({ ...p, [k]: e.target.value }));
  const pv = +beParams.precioVenta || 0;
  const cv = +beParams.costoVariable || 0;
  const otros = +beParams.otrosCostos || 0;
  const cf = totalCostosFijos + otros;
  const mc = pv - cv;
  const mcPct = pv > 0 ? mc / pv : 0;
  const peU = mc > 0 ? cf / mc : null;
  const peI = mcPct > 0 ? cf / mcPct : null;
  const mgRent = +beParams.margenRentabilidad || 0;
  const peIConRent = mcPct > 0 ? cf / (mcPct - mgRent / 100) : null;

  return (
    <div>
      <div className="sec-title">⚖️ Punto de Equilibrio</div>
      <div className="g2">
        <div>
          <div className="card">
            <div className="card-title">Costos Fijos</div>
            <div className="hbox" style={{ marginBottom: 12 }}>
              <div className="sm muted mb8">Costos de nómina (auto, de empleados)</div>
              <div className="mono acc" style={{ fontSize: 22, fontWeight: 700 }}>{fmtCOP(totalCostosFijos)}</div>
            </div>
            <div className="ig"><label className="il">Otros Costos Fijos (arrendamiento, servicios, etc.) COP</label><input className="inp" type="number" value={beParams.otrosCostos} onChange={set("otrosCostos")} placeholder="0" /></div>
            <div className="stat mb14"><div className="stat-l">Costos Fijos Totales</div><div className="stat-v">{fmtCOP(cf)}</div></div>
          </div>
          <div className="card">
            <div className="card-title">Precio y Costos Variables</div>
            <div className="ig"><label className="il">Precio de Venta Unitario (COP)</label><input className="inp" type="number" value={beParams.precioVenta} onChange={set("precioVenta")} placeholder="150000" /></div>
            <div className="ig"><label className="il">Costo Variable Unitario (COP)</label><input className="inp" type="number" value={beParams.costoVariable} onChange={set("costoVariable")} placeholder="80000" /></div>
            <div className="ig"><label className="il">Margen de Rentabilidad Deseado % (opcional)</label><input className="inp" type="number" value={beParams.margenRentabilidad} onChange={set("margenRentabilidad")} placeholder="0" /></div>
            {pv > 0 && cv > 0 && (
              <div className="g2">
                <div className="stat"><div className="stat-l">Margen contrib. unitario</div><div className="stat-v g">{fmtCOP(mc)}</div></div>
                <div className="stat"><div className="stat-l">Margen contrib. %</div><div className="stat-v g">{fmtPct(mcPct * 100)}</div></div>
              </div>
            )}
          </div>
        </div>

        <div>
          <div className="pe-box" style={{ background: "linear-gradient(135deg,rgba(245,158,11,.1),rgba(245,158,11,.03))", border: "1px solid rgba(245,158,11,.3)" }}>
            <div className="sm muted" style={{ textTransform: "uppercase", letterSpacing: .5, marginBottom: 6 }}>⚖️ Punto de Equilibrio — Unidades</div>
            <div className="big-num acc">{peU ? Math.ceil(peU).toLocaleString("es-CO") : "—"}</div>
            <div className="sm muted mt8">unidades al mes para no perder ni ganar</div>
          </div>
          <div className="pe-box" style={{ background: "linear-gradient(135deg,rgba(16,185,129,.1),rgba(16,185,129,.03))", border: "1px solid rgba(16,185,129,.3)" }}>
            <div className="sm muted" style={{ textTransform: "uppercase", letterSpacing: .5, marginBottom: 6 }}>💰 Punto de Equilibrio — Ingresos</div>
            <div className="big-num grn">{peI ? fmtCOP(peI) : "—"}</div>
            <div className="sm muted mt8">en ventas al mes para cubrir todos los costos</div>
          </div>
          {mgRent > 0 && (
            <div className="pe-box" style={{ background: "linear-gradient(135deg,rgba(96,165,250,.1),rgba(96,165,250,.03))", border: "1px solid rgba(96,165,250,.3)" }}>
              <div className="sm muted" style={{ textTransform: "uppercase", letterSpacing: .5, marginBottom: 6 }}>🎯 Meta con {fmtPct(mgRent)} Rentabilidad</div>
              <div className="big-num b">{peIConRent && peIConRent > 0 ? fmtCOP(peIConRent) : "—"}</div>
              <div className="sm muted mt8">ventas necesarias para lograr el margen deseado</div>
            </div>
          )}
          {peU && (
            <div className="card">
              <div className="card-title">Verificación en el Punto de Equilibrio</div>
              {[
                ["Ingresos totales", fmtCOP(Math.ceil(peU) * pv), "var(--accent)"],
                ["Costos variables", fmtCOP(Math.ceil(peU) * cv), "var(--red)"],
                ["Costos fijos", fmtCOP(cf), "var(--red)"],
              ].map(([l, v, c]) => (
                <div key={l} className="rr"><span style={{ flex: 1 }}>{l}</span><span className="mono" style={{ color: c }}>{v}</span></div>
              ))}
              <div className="tot"><span>Utilidad en PE</span><span className="mono grn" style={{ fontSize: 15 }}>{fmtCOP(Math.ceil(peU) * pv - Math.ceil(peU) * cv - cf)}</span></div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function QuickSim({ schema }) {
  const [v, setV] = useState("");
  const c = v ? calcComision(+v, schema) : 0;
  return (
    <div>
      <div className="ig" style={{ marginBottom: 8 }}><label className="il">Ventas período (COP)</label><input className="inp" type="number" value={v} onChange={e => setV(e.target.value)} placeholder="8000000" /></div>
      {v && <div className="fb" style={{ paddingTop: 8, borderTop: "1px solid var(--border)" }}><span className="muted sm">Comisión calculada</span><span className="mono grn" style={{ fontSize: 18, fontWeight: 700 }}>{fmtCOP(c)}</span></div>}
    </div>
  );
}

function ComisionesTab({ globalSchema, setGlobalSchema, schemas, setSchemas, employees }) {
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
      <div className="g2">
        <div>
          <div className="card mb14">
            <div className="card-title">Esquema a editar</div>
            <div className="ig"><select className="sel" value={selId} onChange={e => setSelId(e.target.value)}>
              <option value="global">🌐 Esquema Global (predeterminado)</option>
              {empCon.map(e => <option key={e.id} value={e.id}>👤 {e.nombre} – Personalizado</option>)}
            </select></div>
            <div className="card-title">Tramos Escalonados</div>
            <div className="sm muted mb8">Cada tramo aplica solo sobre las ventas dentro de ese rango</div>
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
                    <td style={{ textAlign: "right", fontFamily: "var(--mono)", color: "var(--muted)" }}>{t.hasta ? fmtCOP(+t.hasta) : "Sin límite"}</td>
                    <td style={{ textAlign: "right", fontFamily: "var(--mono)", color: "var(--green)", fontWeight: 700 }}>{fmtPct(+t.pct || 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="card">
            <div className="card-title">Simulación rápida</div>
            <QuickSim schema={cur} />
          </div>
        </div>
      </div>
    </div>
  );
}

function SimuladorTab({ employees, beParams, schemas, globalSchema }) {
  const [empId, setEmpId] = useState("");
  const [ventas, setVentas] = useState("");
  const emp = employees.find(e => e.id === empId);

  const calc = useMemo(() => {
    if (!emp) return null;
    const v = +ventas || 0;
    const schema = emp.schemaPropio ? (schemas[emp.id] || globalSchema) : globalSchema;
    const comision = emp.comisiones ? calcComision(v, schema) : 0;
    const { costoTotal, rubros, ext } = calcCostos(emp.salario, emp.arlRate, emp.subsidio);
    const descSalud = emp.salario * 0.04;
    const descPension = emp.salario * 0.04;
    const salarioNeto = emp.salario - descSalud - descPension + comision;
    const costoEmpresa = costoTotal + comision;
    const pv = +beParams.precioVenta || 0;
    const cv = +beParams.costoVariable || 0;
    const mcPct = pv > 0 ? (pv - cv) / pv : 0;
    const presupuesto = mcPct > 0 ? costoTotal / mcPct : null;
    const progreso = presupuesto && v > 0 ? Math.min(v / presupuesto, 1.5) : 0;
    return { emp, v, comision, costoEmpresa, salarioNeto, descSalud, descPension, costoTotal, rubros, ext, presupuesto, mcPct, progreso };
  }, [emp, ventas, schemas, globalSchema, beParams]);

  return (
    <div>
      <div className="sec-title">🧮 Simulador de Liquidación</div>
      <div className="g2">
        <div className="card">
          <div className="card-title">Parámetros</div>
          <div className="ig"><label className="il">Empleado</label>
            <select className="sel" value={empId} onChange={e => setEmpId(e.target.value)}>
              <option value="">Seleccionar empleado...</option>
              {employees.map(e => <option key={e.id} value={e.id}>{e.nombre} — {e.cargo || "Sin cargo"}</option>)}
            </select>
          </div>
          {calc && <>
            <div className="ig"><label className="il">Ventas del período (COP)</label><input className="inp" type="number" value={ventas} onChange={e => setVentas(e.target.value)} placeholder="0" /></div>
            <div className="stat mt8">
              <div className="stat-l">Esquema de comisiones</div>
              <div style={{ fontSize: 12, color: "var(--text)", marginTop: 3 }}>
                {emp.comisiones ? (emp.schemaPropio ? "Personalizado" : "Esquema Global") : "Sin comisiones"}
              </div>
            </div>
            {!beParams.precioVenta && <div className="sm muted mt8">⚠️ Configura el Punto de Equilibrio para ver el presupuesto individual</div>}
          </>}
          {!employees.length && <div className="muted">Agrega empleados primero</div>}
        </div>

        {calc ? (
          <div>
            <div className="card mb14">
              <div className="card-title">Resumen del período</div>
              <div className="g2">
                <div className="stat"><div className="stat-l">Ventas realizadas</div><div className="stat-v b">{fmtCOP(calc.v)}</div></div>
                <div className="stat"><div className="stat-l">Comisión generada</div><div className="stat-v g">{fmtCOP(calc.comision)}</div></div>
              </div>
            </div>

            <div className="card mb14">
              <div className="card-title">✅ Lo que recibe el empleado</div>
              {[
                ["Salario base", fmtCOP(emp.salario), "var(--text)"],
                ["(-) Salud empleado 4%", `-${fmtCOP(calc.descSalud)}`, "var(--red)"],
                ["(-) Pensión empleado 4%", `-${fmtCOP(calc.descPension)}`, "var(--red)"],
                ...(calc.comision > 0 ? [["(+) Comisiones por ventas", `+${fmtCOP(calc.comision)}`, "var(--green)"]] : []),
              ].map(([l, v, c]) => (
                <div key={l} className="rr"><span style={{ flex: 1 }}>{l}</span><span className="mono" style={{ color: c }}>{v}</span></div>
              ))}
              <div className="tot"><span>SALARIO NETO EMPLEADO</span><span className="mono grn" style={{ fontSize: 18, fontWeight: 700 }}>{fmtCOP(calc.salarioNeto)}</span></div>
            </div>

            <div className="card mb14">
              <div className="card-title">🏢 Lo que paga la empresa</div>
              {[
                ["Costo total empleado (nómina)", fmtCOP(calc.costoTotal), "var(--text)"],
                ...(calc.comision > 0 ? [["Comisiones pagadas al empleado", fmtCOP(calc.comision), "var(--accent)"]] : []),
              ].map(([l, v, c]) => (
                <div key={l} className="rr"><span style={{ flex: 1 }}>{l}</span><span className="mono" style={{ color: c }}>{v}</span></div>
              ))}
              <div className="tot"><span>COSTO TOTAL EMPRESA</span><span className="mono r" style={{ fontSize: 18, fontWeight: 700 }}>{fmtCOP(calc.costoEmpresa)}</span></div>
            </div>

            {calc.presupuesto && (
              <div className="card">
                <div className="card-title">🎯 Presupuesto de ventas</div>
                <div className="stat mb14">
                  <div className="stat-l">Debe vender mínimo para cubrir su costo</div>
                  <div className="stat-v">{fmtCOP(calc.presupuesto)}</div>
                  <div className="stat-s">con {fmtPct(calc.mcPct * 100)} de margen de contribución</div>
                </div>
                {calc.v > 0 && <>
                  <div className="fb mb8 sm muted">
                    <span>Progreso vs presupuesto</span>
                    <span style={{ color: calc.v >= calc.presupuesto ? "var(--green)" : "var(--accent)", fontWeight: 700 }}>
                      {fmtPct(Math.min((calc.v / calc.presupuesto) * 100, 100))}
                    </span>
                  </div>
                  <div className="pb">
                    <div className="pf" style={{ width: `${Math.min(calc.progreso * 100, 100)}%`, background: calc.v >= calc.presupuesto ? "var(--green)" : "var(--accent)" }} />
                  </div>
                  <div className="sm mt8" style={{ color: calc.v >= calc.presupuesto ? "var(--green)" : "var(--accent)" }}>
                    {calc.v >= calc.presupuesto
                      ? `✅ Superó por ${fmtCOP(calc.v - calc.presupuesto)}`
                      : `⚠️ Falta ${fmtCOP(calc.presupuesto - calc.v)} para cubrir su contratación`}
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

function ExportarTab({ employees, onXML, onCSV }) {
  const [gsId, setGsId] = useState("");
  const [gsKey, setGsKey] = useState("");
  const [gsRange, setGsRange] = useState("Sheet1!A1");
  const [gsStatus, setGsStatus] = useState("");
  const [loading, setLoading] = useState(false);

  const exportSheets = async () => {
    if (!gsId || !gsKey) { setGsStatus("⚠️ Ingresa el ID del Spreadsheet y tu API Key"); return; }
    setLoading(true); setGsStatus("⏳ Enviando...");
    const values = [
      ["ID", "Nombre", "Cargo", "Salario Base", "ARL%", "Subsidio", "Carga Social", "Costo Total Empresa"],
      ...employees.map(e => {
        const { totalRubros, costoTotal } = calcCostos(e.salario, e.arlRate, e.subsidio);
        return [e.id, e.nombre, e.cargo || "", e.salario, e.arlRate, e.subsidio ? "Sí" : "No", Math.round(totalRubros), Math.round(costoTotal)];
      })
    ];
    try {
      const url = `https://sheets.googleapis.com/v4/spreadsheets/${gsId}/values/${encodeURIComponent(gsRange)}:append?valueInputOption=RAW&key=${gsKey}`;
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ values }) });
      const data = await res.json();
      if (data.error) throw new Error(data.error.message);
      setGsStatus("✅ Datos enviados correctamente!");
    } catch (e) {
      setGsStatus(`❌ Error: ${e.message}`);
    }
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
          <div style={{ background: "rgba(96,165,250,.06)", border: "1px solid rgba(96,165,250,.2)", borderRadius: 8, padding: 12, marginBottom: 14, fontSize: 12, color: "var(--muted)", lineHeight: 1.6 }}>
            ℹ️ Para escritura directa necesitas una <strong style={{ color: "var(--blue)" }}>API Key</strong> con permisos en <a href="https://console.cloud.google.com" target="_blank" style={{ color: "var(--blue)" }}>Google Cloud Console</a> y el Sheet compartido como editable. Alternativamente usa la exportación CSV e impórtala en Sheets.
          </div>
          <div className="ig"><label className="il">ID del Spreadsheet</label><input className="inp" value={gsId} onChange={e => setGsId(e.target.value)} placeholder="1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74..." /></div>
          <div className="ig"><label className="il">Google API Key</label><input className="inp" type="password" value={gsKey} onChange={e => setGsKey(e.target.value)} placeholder="AIza..." /></div>
          <div className="ig"><label className="il">Rango destino</label><input className="inp" value={gsRange} onChange={e => setGsRange(e.target.value)} /></div>
          <button className="btn btn-grn" style={{ width: "100%" }} onClick={exportSheets} disabled={!employees.length || loading}>{loading ? "Enviando..." : "🚀 Enviar a Google Sheets"}</button>
          {gsStatus && <div style={{ marginTop: 10, padding: 10, background: "var(--surf2)", borderRadius: 6, fontSize: 12, textAlign: "center" }}>{gsStatus}</div>}
          <div className="div" />
          <div className="card-title">Alternativa rápida</div>
          <div className="muted sm mb8">Descarga el CSV → en Google Sheets → Archivo → Importar → Subir</div>
          <button className="btn btn-g" style={{ width: "100%" }} onClick={onCSV} disabled={!employees.length}>📊 Descargar CSV para importar</button>
        </div>
      </div>
    </div>
  );
}

// ─── APP ROOT ──────────────────────────────────────────────────────────────
export default function App() {
  const [tab, setTab] = useState("empleados");
  const [employees, setEmployees] = useState([]);
  const [selEmpId, setSelEmpId] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [globalSchema, setGlobalSchema] = useState([
    { id: uid(), desde: 0, hasta: 5000000, pct: 3 },
    { id: uid(), desde: 5000000, hasta: 10000000, pct: 5 },
    { id: uid(), desde: 10000000, hasta: "", pct: 8 },
  ]);
  const [schemas, setSchemas] = useState({});
  const [beParams, setBeParams] = useState({ precioVenta: "", costoVariable: "", otrosCostos: "", margenRentabilidad: "" });
  const [addForm, setAddForm] = useState({ nombre: "", cargo: "", salario: "", arlRate: "0.522", subsidio: false, comisiones: false, schemaPropio: false });

  const totalCostosFijos = useMemo(() =>
    employees.reduce((s, e) => s + calcCostos(e.salario, e.arlRate, e.subsidio).costoTotal, 0)
  , [employees]);

  const addEmployee = () => {
    if (!addForm.nombre || !addForm.salario) return;
    const emp = { id: uid(), nombre: addForm.nombre, cargo: addForm.cargo, salario: +addForm.salario, arlRate: +addForm.arlRate, subsidio: addForm.subsidio, comisiones: addForm.comisiones, schemaPropio: addForm.schemaPropio };
    setEmployees(p => [...p, emp]);
    if (emp.schemaPropio) setSchemas(p => ({ ...p, [emp.id]: globalSchema.map(t => ({ ...t, id: uid() })) }));
    setAddForm({ nombre: "", cargo: "", salario: "", arlRate: "0.522", subsidio: false, comisiones: false, schemaPropio: false });
    setShowAdd(false);
    setSelEmpId(emp.id);
  };

  const deleteEmployee = id => {
    setEmployees(p => p.filter(e => e.id !== id));
    if (selEmpId === id) setSelEmpId(null);
  };

  return (
    <>
      <style>{CSS}</style>
      <div className="app">
        <div className="hdr">
          <div className="hdr-logo">⚡</div>
          <div>
            <div className="hdr-title">SalesForce Pro</div>
            <div className="hdr-sub">Costos Laborales · Punto de Equilibrio · Comisiones</div>
          </div>
          <div className="hdr-stats">
            <div className="hdr-stat"><div className="hdr-stat-v">{employees.length}</div><div className="hdr-stat-l">empleados</div></div>
            <div className="hdr-stat"><div className="hdr-stat-v">{fmtCOP(totalCostosFijos)}</div><div className="hdr-stat-l">nómina/mes</div></div>
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
          {tab === "empleados" && <EmpleadosTab employees={employees} selEmpId={selEmpId} setSelEmpId={setSelEmpId} setShowAdd={setShowAdd} deleteEmployee={deleteEmployee} />}
          {tab === "presupuesto" && <PresupuestoTab employees={employees} beParams={beParams} />}
          {tab === "breakeven" && <BreakevenTab beParams={beParams} setBeParams={setBeParams} totalCostosFijos={totalCostosFijos} />}
          {tab === "comisiones" && <ComisionesTab globalSchema={globalSchema} setGlobalSchema={setGlobalSchema} schemas={schemas} setSchemas={setSchemas} employees={employees} />}
          {tab === "simulador" && <SimuladorTab employees={employees} beParams={beParams} schemas={schemas} globalSchema={globalSchema} />}
          {tab === "exportar" && <ExportarTab employees={employees} onXML={() => download(toXML(employees), "empleados.xml", "application/xml")} onCSV={() => download(toCSV(employees), "empleados.csv", "text/csv")} />}
        </div>
      </div>

      {showAdd && (
        <div className="overlay" onClick={() => setShowAdd(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-t">➕ Nuevo Empleado</div>
            <AddForm form={addForm} setForm={setAddForm} onSave={addEmployee} onCancel={() => setShowAdd(false)} />
          </div>
        </div>
      )}
    </>
  );
}
