/* =========================================================================
 * Buscar trabajos + Modal (PRO) — v4.1
 * Endpoint: tu Apps Script (usa `action=search&texto=...`)
 * - No modifica tu Apps Script.
 * - Mapeo por encabezado (ignora acentos y mayúsculas).
 * - "Precio otro" => 0/— si está vacío (adiós $15 fantasma).
 * - Fallbacks: intenta search → all → columns.
 * - Auto-focus en el input #buscar al cargar.
 * ========================================================================= */

///// CONFIG /////////////////////////////////////////////////////////////////
const API = (localStorage.getItem('OC_API') || '').trim()
  || 'https://script.google.com/macros/s/AKfycbwsUI50KmWw4OYYwD9HfNn3qPHNBFwZ7Zx2997lfwnoahy6sBCKZwd6vKr4hhsIQXKp/exec';

///// DOM HELPERS ////////////////////////////////////////////////////////////
const $ = (s, p=document) => p.querySelector(s);
const $$ = (s, p=document) => Array.from(p.querySelectorAll(s));
const on = (el, ev, fn) => el && el.addEventListener(ev, fn);
const setText = (sel, txt) => { const n=$(sel); if(n) n.textContent = txt; };
const setHref = (sel, url) => { const a=$(sel); if(a){ a.href=url; a.removeAttribute('hidden'); } };
const show = sel => { const n=$(sel); if(n) n.removeAttribute('hidden'); };
const hide = sel => { const n=$(sel); if(n) n.setAttribute('hidden',''); };

function uiMsg(msg, cls='muted'){
  const box = $('#resultados') || $('#lista') || $('#output') || $('#result');
  if (box) box.innerHTML = `<p class="${cls}">${msg}</p>`;
}

///// DATA HELPERS ///////////////////////////////////////////////////////////
const norm = s => (s||'')
  .toString().trim().toLowerCase()
  .normalize('NFD').replace(/\p{Diacritic}/gu,'');

function col(headers, ...aliases){
  const H = headers.map(norm);
  for (const a of aliases.map(norm)) {
    const i = H.indexOf(a);
    if (i !== -1) return i;
  }
  return -1;
}

// "$ 15", "", "—", null → 0   |  "12.345,67" → 12345.67
function toMoney(v){
  if (v == null) return 0;
  const s = String(v).trim();
  if (!s || s === '—' || s === '-') return 0;
  const n = Number(
    s.replace(/[^\d\-.,]/g,'')       // deja dígitos, punto, coma y signo
     .replace(/\.(?=.*\.)/g,'')      // quita puntos de miles dejando el último
     .replace(',', '.')              // coma decimal → punto
  );
  return Number.isFinite(n) ? n : 0;
}

function money(n){ try { return n.toLocaleString('es-AR'); } catch { return String(n); } }

///// API ////////////////////////////////////////////////////////////////////
async function fetchJSON(url){
  const r = await fetch(url, { cache: 'no-store' });
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
  return r.json();
}

async function apiSearch(term){
  // 1) search con parámetro correcto `texto`
  try {
const u = `${API}?action=search&texto=${encodeURIComponent(term||'')}`;
    const j = await fetchJSON(u);
    const headers = j.headers || j.columns || j.encabezados || [];
    const rows    = j.rows    || j.items   || j.data        || [];
    if (headers.length && rows.length) return { headers, rows };
  } catch {}
  // 2) all
  try {
    const j = await fetchJSON(`${API}?action=all`);
    const headers = j.headers || j.columns || j.encabezados || [];
    const rows    = j.rows    || j.items   || j.data        || [];
    if (headers.length && rows.length) return { headers, rows };
  } catch {}
  // 3) columns
  try {
    const j = await fetchJSON(`${API}?action=columns`);
    const headers = j.headers || j.columns || j.encabezados || [];
    return { headers, rows: [] };
  } catch {}
  throw new Error('No se pudo obtener datos de la API');
}

///// MAPEO DE TÍTULOS (tu hoja actual) //////////////////////////////////////
function buildIdx(headers){
  return {
    estado:            col(headers, 'listo','estado'),
    fecha:             col(headers, 'fecha'),
    fechaRetira:       col(headers, 'fecha retira','retira (estimada)'),
    nTrabajo:          col(headers, 'numero trabajo','n trabajo','n° trabajo'),
    documento:         col(headers, 'documento','dni','doc'),
    nombre:            col(headers, 'apellido y nombre','paciente'),

    cristal:           col(headers, 'cristal'),
    precioCristal:     col(headers, 'precio cristal'),
    nAnteojo:          col(headers, 'n anteojo','n° anteojo','numero anteojo','n armazon','n° armazon'),
    precioArmazon:     col(headers, 'precio armazon'),
    detalleArmazon:    col(headers, 'detalle armazon'),

    otroConcepto:      col(headers, 'otro concepto'),
    precioOtro:        col(headers, 'precio otro','importe otro','monto otro'),

    entregaModo:       col(headers, 'entrega'),

    odEsf:             col(headers, 'od esf'),
    odCil:             col(headers, 'od cil'),
    odEje:             col(headers, 'od eje'),
    oiEsf:             col(headers, 'oi esf'),
    oiCil:             col(headers, 'oi cil'),
    oiEje:             col(headers, 'oi eje'),
    add:               col(headers, 'add'),
    dnp:               col(headers, 'dnp'),
    distFocal:         col(headers, 'distancia focal'),

    obraSocialTxt:     col(headers, 'obra social'),
    precioObraSoc:     col(headers, 'precio obra social'),

    total:             col(headers, 'total'),
    senia:             col(headers, 'seña','senia'),
    saldo:             col(headers, 'saldo'),
    formaPago:         col(headers, 'forma de pago'),
    oculista:          col(headers, 'oculista'),

    pdfUrl:            col(headers, 'pdf','carpeta','vinculo'),
    vendedor:          col(headers, 'vendedor'),
    telefono:          col(headers, 'telefono','teléfono'),
    localidad:         col(headers, 'localidad'),

    entregadoPor:      col(headers, 'entregado por'),
    cancelo:           col(headers, 'cancelo'),
    fdp:               col(headers, 'fdp'),
    fechaHora:         col(headers, 'fecha y hora'),
    fechaEntregaReal:  col(headers, 'fecha entrega real'),
  };
}

function rowToData(headers, row){
  const idx = buildIdx(headers);
  const g = i => (i>=0 ? (row[i] ?? '') : '');
  const m = i => (i>=0 ? toMoney(row[i]) : 0);

  const data = {
    estado:        g(idx.estado),
    fecha:         g(idx.fecha),
    fechaRetira:   g(idx.fechaRetira),
    nTrabajo:      g(idx.nTrabajo),
    documento:     g(idx.documento),
    nombre:        g(idx.nombre),

    cristal:       g(idx.cristal),
    precioCristal: m(idx.precioCristal),
    nAnteojo:      g(idx.nAnteojo),
    precioArmazon: m(idx.precioArmazon),
    detalleArmazon:g(idx.detalleArmazon),

    otroConcepto:  g(idx.otroConcepto),
    // Clave: si la celda está vacía/guion/— → 0
    precioOtro:    m(idx.precioOtro),

    entregaModo:   g(idx.entregaModo),

    od: { esf:g(idx.odEsf), cil:g(idx.odCil), eje:g(idx.odEje) },
    oi: { esf:g(idx.oiEsf), cil:g(idx.oiCil), eje:g(idx.oiEje) },
    add:           g(idx.add),
    dnp:           g(idx.dnp),
    distFocal:     g(idx.distFocal),

    obraSocialTxt: g(idx.obraSocialTxt),
    precioObraSoc: m(idx.precioObraSoc),

    totalSheet:    m(idx.total),
    senia:         m(idx.senia),
    saldoSheet:    m(idx.saldo),
    formaPago:     g(idx.formaPago),
    oculista:      g(idx.oculista),

    pdfUrl:        g(idx.pdfUrl),
    vendedor:      g(idx.vendedor),
    telefono:      g(idx.telefono),
    telLink:       g(idx.telefono) ? `https://wa.me/54${String(g(idx.telefono)).replace(/\D/g,'')}` : '',
    localidad:     g(idx.localidad),

    entregadoPor:  g(idx.entregadoPor),
    cancelo:       g(idx.cancelo),
    fdp:           g(idx.fdp),
    fechaHora:     g(idx.fechaHora),
    fechaEntregaReal: g(idx.fechaEntregaReal),
  };

  // Totales consistentes
  const subtotal = data.precioCristal + data.precioArmazon + data.precioOtro;
  const totalCalc = Math.max(0, subtotal - data.precioObraSoc);
  data.subtotal = subtotal;
  data.total    = data.totalSheet || totalCalc;
  data.saldo    = data.saldoSheet || Math.max(0, data.total - data.senia);

  return data;
}

///// RENDER LISTA + MODAL ///////////////////////////////////////////////////
function renderList(headers, rows){
  const cont = $('#resultados') || $('#lista') || $('#output') || $('#result');
  if (!cont) return;

  if (!rows?.length){
    cont.innerHTML = '<p class="muted">Sin resultados</p>';
    const info = $('#result-info'); if (info) info.textContent = 'Resultados: 0';
    return;
  }

  const idx = buildIdx(headers);
  cont.innerHTML = '';

  for (const r of rows){
    const btn = document.createElement('button');
    btn.className = 'resultado';
    const nTrabajo = (idx.nTrabajo>=0 ? r[idx.nTrabajo] : '');
    const nombre   = (idx.nombre>=0 ? r[idx.nombre] : '');
    const fecha    = (idx.fecha>=0 ? r[idx.fecha] : '');
    btn.innerHTML = `
      <span class="r-id">#${nTrabajo||'-'}</span>
      <span class="r-nombre">${nombre||'-'}</span>
      <span class="r-fecha">${fecha||''}</span>
    `;
    btn.addEventListener('click', ()=> openModal(headers, r));
    cont.appendChild(btn);
  }
  const info = $('#result-info');
  if (info) info.textContent = `Resultados: ${rows.length}`;
}

function openModal(headers, row){
  const d = rowToData(headers, row);

  // Cabecera
  setText('#estado-chip', d.estado || '—');
  setText('#numero-trabajo', d.nTrabajo || '—');
  setText('#cliente', d.nombre || '—');

  // Fechas
  setText('#fecha-encargo', d.fecha || '—');
  setText('#fecha-retira', d.fechaRetira || '—');

  // Paciente / contacto
  setText('#documento', d.documento || '—');
  setText('#telefono', d.telefono || '—');
  if (d.telLink) setHref('#whatsapp', d.telLink);
  setText('#localidad', d.localidad || '—');

  // Lentes / armazón
  setText('#cristal', d.cristal || '—');
  setText('#precio-cristal', d.precioCristal ? `$ ${money(d.precioCristal)}` : '—');
  setText('#n-armazon', d.nAnteojo || '—');
  setText('#precio-armazon', d.precioArmazon ? `$ ${money(d.precioArmazon)}` : '—');
  setText('#detalle-armazon', d.detalleArmazon || '—');

  // Otros
  setText('#otro-concepto', d.otroConcepto || '—');
  setText('#precio-otro', d.precioOtro ? `$ ${money(d.precioOtro)}` : '—');

  // Graduación
  setText('#od-esf', d.od.esf || '—');
  setText('#od-cil', d.od.cil || '—');
  setText('#od-eje', d.od.eje || '—');
  setText('#oi-esf', d.oi.esf || '—');
  setText('#oi-cil', d.oi.cil || '—');
  setText('#oi-eje', d.oi.eje || '—');
  setText('#add', d.add || '—');
  setText('#dnp', d.dnp || '—');
  setText('#dist-focal', d.distFocal || '—');

  // Obra social / totales
  setText('#obra-social-txt', d.obraSocialTxt || '—');
  setText('#obra-social-importe', d.precioObraSoc ? `- $ ${money(d.precioObraSoc)}` : '—');
  setText('#subtotal', `$ ${money(d.subtotal)}`);
  setText('#total', `$ ${money(d.total)}`);
  setText('#senia', d.senia ? `$ ${money(d.senia)}` : '—');
  setText('#saldo', `$ ${money(d.saldo)}`);

  // Entrega real y metadatos
  setText('#entregado-por', d.entregadoPor || '—');
  setText('#fecha-entrega-real', d.fechaEntregaReal || '—');
  if (d.pdfUrl) setHref('#pdf-link', d.pdfUrl);
  setText('#vendedor', d.vendedor || '—');
  setText('#forma-pago', d.formaPago || '—');
  setText('#oculista', d.oculista || '—');

  // Abrir modal
  const modal = $('#modal');
  if (modal){
    show('#modal');
    modal.classList.add('open');
  }
}

function closeModal(){
  const m = $('#modal');
  if (m){ m.classList.remove('open'); hide('#modal'); }
}

///// WIRE-UP ////////////////////////////////////////////////////////////////
function getUI(){
  const form = $('#form-buscar') || $('form[action="#"]') || $('form');
  // 👇 intenta en orden: #q, #buscar, o el primer input de texto dentro del form
  const input =
    $('#q') ||
    $('#buscar') ||
    (form && form.querySelector('input[type="search"], input[type="text"], input')) ||
    $('input[type="search"]') ||
    $('input[type="text"]') ||
    $('input');

  const btn  = $('#btn-buscar') || $('#btnSearch') || $$('button').find(b=>/buscar/i.test(b.textContent));
  return { form, input, btn };
}


async function doSearch(q){
  uiMsg('Buscando…');
  const { headers, rows } = await apiSearch(q);

  // Si la API devolvió "all", filtramos localmente por nombre o toda la fila
  let filtered = rows;
  if (rows.length && q){
    const idxNombre = buildIdx(headers).nombre;
    const needle = norm(q);
    filtered = rows.filter(r=>{
      if (idxNombre >= 0) return norm(r[idxNombre]).includes(needle);
      return r.some(cell => norm(cell).includes(needle));
    });
  }
  renderList(headers, filtered);
}

function bindUI(){
  const { form, input, btn } = getUI();

  // Buscar (submit o click)
if (form){
  on(form, 'submit', e=>{
    e.preventDefault();
    const q = (input?.value || '').trim();
    console.log('DEBUG → input.id=', input?.id, 'value=', q); // 👈
    doSearch(q).catch(err=>{
      console.error(err);
      uiMsg('No se pudo buscar', 'error');
    });
  });
}
if (btn){
  on(btn, 'click', e=>{
    e.preventDefault();
    const q = (input?.value || '').trim();
    console.log('DEBUG → input.id=', input?.id, 'value=', q); // 👈
    doSearch(q).catch(err=>{
      console.error(err);
      uiMsg('No se pudo buscar', 'error');
    });
  });
}


  // Cerrar modal
  on($('#modal-close'), 'click', closeModal);
  on($('#modal'), 'click', e=>{ if(e.target.id==='modal') closeModal(); });

  uiMsg('Listo.');

  // Auto-focus + seleccionar texto
  input?.focus();
  input?.select();
}

document.addEventListener('DOMContentLoaded', bindUI);
