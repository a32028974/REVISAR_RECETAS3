// ===== Buscar trabajos + Modal clarito — v3 (sin tocar Apps Script) =====
// - Toma la URL de tu Apps Script desde localStorage("OC_API") o usa el fallback.
// - Lee encabezados por nombre (case/acentos indiferentes).
// - "Precio otro" ahora es 0/— cuando está vacío (nunca más $15 fantasma).
// - Muestra: PDF, vendedor, teléfono + link WhatsApp, localidad,
//   entregado por, fecha entrega real, totales coherentes.

// -------- Config --------
const API_FALLBACK = 'https://script.google.com/macros/s/AKfycbwsUI50KmWw4OYYwD9HfNn3qPHNBFwZ7Zx2997lfwnoahy6sBCKZwd6vKr4hhsIQXKp/exec';
const API = (localStorage.getItem('OC_API') || '').trim() || API_FALLBACK;

// -------- Helpers DOM --------
const $  = (sel, p=document) => p.querySelector(sel);
const $$ = (sel, p=document) => Array.from(p.querySelectorAll(sel));
const setText = (sel, txt) => { const n=$(sel); if(n) n.textContent = txt; };
const setHref = (sel, href) => { const a=$(sel); if(a){ a.href = href; a.removeAttribute('hidden'); }};

// -------- Helpers de datos --------
const norm = s => (s||'').toString().trim().toLowerCase()
  .normalize('NFD').replace(/\p{Diacritic}/gu,''); // quita acentos

function col(headers, ...aliases){
  const H = headers.map(norm);
  for (const a of aliases.map(norm)){
    const i = H.indexOf(a);
    if (i !== -1) return i;
  }
  return -1;
}

function toMoney(v){
  if (v == null) return 0;
  const n = Number(String(v).replace(/[^\d\-.,]/g,'').replace('.','').replace(',','.'));
  return Number.isFinite(n) ? n : 0;
}

function moneyFmt(n){
  try { return n.toLocaleString('es-AR'); }
  catch { return String(Math.round(n)); }
}

// -------- API --------
// Espera que tu Apps Script soporte: ?action=search&term=... y devuelva {headers, rows}
// (Si se llama distinto, también aceptamos {columns, items}).
async function apiSearch(term){
  const url = `${API}?action=search&term=${encodeURIComponent(term||'')}`;
  const r = await fetch(url, { cache: 'no-store' });
  if (!r.ok) throw new Error('Error consultando API');
  const j = await r.json();
  // normalizamos formato
  const headers = j.headers || j.columns || j.encabezados || [];
  const rows    = j.rows    || j.items   || j.data        || [];
  return { headers, rows };
}

// -------- Mapeo según TUS títulos (de la captura) --------
function buildIdx(headers){
  return {
    estado:            col(headers, 'listo'),
    fecha:             col(headers, 'fecha'),
    fechaRetira:       col(headers, 'fecha retira'),
    nTrabajo:          col(headers, 'numero trabajo'),
    documento:         col(headers, 'documento'),
    nombre:            col(headers, 'apellido y nombre'),

    cristal:           col(headers, 'cristal'),
    precioCristal:     col(headers, 'precio cristal'),
    nAnteojo:          col(headers, 'n anteojo','n° anteojo','numero anteojo'),
    precioArmazon:     col(headers, 'precio armazon'),
    detalleArmazon:    col(headers, 'detalle armazon'),

    otroConcepto:      col(headers, 'otro concepto'),
    precioOtro:        col(headers, 'precio otro'),
    entregaModo:       col(headers, 'entrega'),            // stock/urgente/laboratorio

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

    pdfUrl:            col(headers, 'pdf'),
    vendedor:          col(headers, 'vendedor'),
    telefono:          col(headers, 'telefono'),
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
    precioOtro:    m(idx.precioOtro),           // <- si está vacío o “—” => 0

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

// -------- Render de lista y modal --------
function renderList(headers, rows){
  const cont = $('#resultados');
  if (!cont) return;

  cont.innerHTML = '';
  if (!rows?.length){
    cont.innerHTML = '<p class="muted">Sin resultados</p>';
    return;
  }

  const idx = buildIdx(headers);
  for (const r of rows){
    const item = document.createElement('button');
    item.className = 'resultado';
    const nTrabajo = (idx.nTrabajo>=0 ? r[idx.nTrabajo] : '');
    const nombre   = (idx.nombre>=0 ? r[idx.nombre] : '');
    const fecha    = (idx.fecha>=0 ? r[idx.fecha] : '');
    item.innerHTML = `
      <span class="r-id">#${nTrabajo||'-'}</span>
      <span class="r-nombre">${nombre||'-'}</span>
      <span class="r-fecha">${fecha||''}</span>
    `;
    item.addEventListener('click', ()=> openModal(headers, r));
    cont.appendChild(item);
  }
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
  setText('#precio-cristal', d.precioCristal ? `$ ${moneyFmt(d.precioCristal)}` : '—');
  setText('#n-armazon', d.nAnteojo || '—');
  setText('#precio-armazon', d.precioArmazon ? `$ ${moneyFmt(d.precioArmazon)}` : '—');
  setText('#detalle-armazon', d.detalleArmazon || '—');

  // Otros/extra
  setText('#otro-concepto', d.otroConcepto || '—');
  setText('#precio-otro', d.precioOtro ? `$ ${moneyFmt(d.precioOtro)}` : '—');
  setText('#entrega-modo', d.entregaModo || '—');

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
  setText('#obra-social-importe', d.precioObraSoc ? `- $ ${moneyFmt(d.precioObraSoc)}` : '—');
  setText('#subtotal', `$ ${moneyFmt(d.subtotal)}`);
  setText('#total', `$ ${moneyFmt(d.total)}`);
  setText('#senia', d.senia ? `$ ${moneyFmt(d.senia)}` : '—');
  setText('#saldo', `$ ${moneyFmt(d.saldo)}`);

  // Entrega real
  setText('#entregado-por', d.entregadoPor || '—');
  setText('#fecha-entrega-real', d.fechaEntregaReal || '—');

  // PDF y vendedor
  if (d.pdfUrl) setHref('#pdf-link', d.pdfUrl);
  setText('#vendedor', d.vendedor || '—');
  setText('#forma-pago', d.formaPago || '—');
  setText('#oculista', d.oculista || '—');

  // Mostrar modal
  const modal = $('#modal');
  if (modal){
    modal.removeAttribute('hidden');
    modal.classList.add('open');
  }
}

function closeModal(){
  const modal = $('#modal');
  if (modal){
    modal.classList.remove('open');
    modal.setAttribute('hidden','');
  }
}

// -------- Wire-up --------
function bindUI(){
  const input = $('#buscar');
  const form  = $('#form-buscar');
  const btnX  = $('#modal-close');

  if (form){
    form.addEventListener('submit', async (e)=>{
      e.preventDefault();
      const term = (input?.value || '').trim();
      try{
        $('#resultados').innerHTML = '<p class="muted">Buscando…</p>';
        const { headers, rows } = await apiSearch(term);
        renderList(headers, rows);
      }catch(err){
        console.error(err);
        $('#resultados').innerHTML = '<p class="error">No se pudo buscar</p>';
      }
    });
  }
  if (btnX) btnX.addEventListener('click', closeModal);
  $('#modal')?.addEventListener('click', (e)=>{ if(e.target.id==='modal') closeModal(); });
}

// init
document.addEventListener('DOMContentLoaded', bindUI);
