// ===== Buscar trabajos + Modal clarito — v3.3.1 =====
// Fix: al enriquecer con "all" priorizamos valores NO vacíos de ALL
// (antes la fila parcial de la búsqueda podía pisar FECHA ENTREGA REAL, etc.)
// Mantiene OS/Descuentos/Pago retiro/Adjuntos/Graduación/Entrega.

const API_FALLBACK = 'https://script.google.com/macros/s/AKfycbwsUI50KmWw4OYYwD9HfNn3qPHNBFwZ7Zx2997lfwnoahy6sBCKZwd6vKr4hhsIQXKp/exec';
const API = (localStorage.getItem('OC_API') || API_FALLBACK || '').trim();

const DEBOUNCE_MS = 350;
const LIVE_MIN_CHARS = 2;

const $ = (q,root=document)=>root.querySelector(q);
const $$= (q,root=document)=>Array.from(root.querySelectorAll(q));
const S  = v => v==null ? '' : String(v);
const N  = s => S(s).replace(/[\u00A0\u200B-\u200D\uFEFF]/g,' ')
                    .normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase();
const buster = ()=>'_t='+Date.now();
const money = v => (Number(S(v).replace(/[^\d.-]/g,''))||0)
  .toLocaleString('es-AR',{style:'currency',currency:'ARS',maximumFractionDigits:0});
function debounce(fn, delay = 300) { let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a),delay); }; }
const normKey = k => S(k).trim().toLowerCase();
const coalesce = (...xs)=> xs.find(x => x!=null && String(x).trim()!=='') ?? '—';
const isURL = v => /^https?:\/\//i.test(S(v));
const parseMoneyLike = x => Number(S(x).replace(/[^\d.-]/g,''))||0;

function phoneLinks(raw){
  const s = S(raw).replace(/[^\d+]/g,'').trim();
  if(!s) return '—';
  let num = s.replace(/^0+/, '').replace(/^15/, '');
  if(!num.startsWith('+54') && !num.startsWith('54')) num = '54'+num.replace(/^\+/, '');
  const telHref = `tel:+${num.replace(/^(\+?)/,'')}`;
  const waHref  = `https://wa.me/${num.replace(/^\+/, '')}`;
  return `<a href="${telHref}">${s}</a> · <a href="${waHref}" target="_blank" rel="noopener">WhatsApp</a>`;
}

let COLS=[], ROWS=[], ALL_HEADERS=null, ALL_ROWS=null;
let ALL_INDEX_BY_NUM = null;
let SORT = { key:null, asc:true }, lastSearchId = 0;

// ===== Mapeo de columnas =====
const MAP = {
  estado: ['listo','estado'],
  fecha: ['fecha','fecha que encarga','fecha encarga'],
  fechaRetira: ['fecha retira','fecha que retira','fecha retiro','fecha (estimada)'],
  modalidad: ['modalidad de entrega','modalidad','entrega'],
  numero: ['numero trabajo','número trabajo','n trabajo','n° trabajo','num trabajo'],
  dni: ['documento','dni'],
  nombre: ['apellido y nombre','apellido','nombre y apellido','paciente'],
  telefono: ['telefono','teléfono','celular'],
  localidad: ['localidad','ciudad','barrio'],

  cristal: ['cristal','tipo de cristal'],
  precioCristal: ['precio cristal'],
  nAnteojo: ['n anteojo','nº anteojo','n armazon','nº armazón','armazon n','numero armazon'],
  precioArmazon: ['precio armazon','precio armazón'],
  detArmazon: ['detalle armazon','detalle armazón','modelo / marca','marca / modelo','detalle','detalle armazon (marca y modelo)'],

  otro: ['otro concepto','concepto','concepto negativo'],
  precioOtro: ['precio otro','monto otro'],
  descuento: ['descuento','descuento efectivo'],

  vendedor: ['vendedor'],
  formaPago: ['forma de pago','pago','fp'],
  sena: ['seña','sena'],

  // Graduación
  od_esf: ['od esf','od esf.','od esf (lejos)','od esf (dist)'],
  od_cil: ['od cil','od cil.'],
  od_eje: ['od eje'],
  oi_esf: ['oi esf','oi esf.'],
  oi_cil: ['oi cil','oi cil.'],
  oi_eje: ['oi eje'],
  dnp_od: ['dnp (od)','dnp od'],
  dnp_oi: ['dnp (oi)','dnp oi'],
  add: ['add'],
  distFocal: ['distancia focal (obligatorio)','distancia focal','distancia focal (df)'],
  dnp_oculta: ['dnp (oculta)','dnp oculta'],

  // Obra social / pagos
  obraSocial: ['obra social','plan'],
  precioObraSocial: ['precio obra social','monto obra social','descuento obra social','importe obra social'],
  pagoRetiro: ['pago retiro','pago al retirar','saldo pagado','pago final','pago entrega','pago restante'],

  // Entrega (ojo: incluye “Fecha entrega real”)
  entregadoPor: ['entregado por','entrego','entregó'],
  fechaEntrega: ['fecha y hora','fecha entrega real','fecha entrega'],

  // Adjuntos
  fotos: ['pdf','link pdf','url pdf','fotos drive','link drive','fotos','imagenes drive','galeria','carpeta fotos','url fotos']
};

// ===== API =====
async function apiColumns(){
  if(!API) throw new Error('Sin API');
  const r = await fetch(`${API}?action=columns&${buster()}`, {cache:'no-store'});
  const j = await r.json();
  if(!j?.ok) throw new Error(j?.error || 'Error columns');
  return j.columns.map(c=>c.name);
}
async function apiSearch(by, q, exact){
  if(!API) throw new Error('Sin API');
  const p = new URLSearchParams({ action:'search', q });
  if (by && by!=='__ALL__') p.set('by', by);
  if (exact) p.set('exact','1');
  const r = await fetch(`${API}?${p.toString()}&${buster()}`, {cache:'no-store'});
  const j = await r.json();
  if(!j?.ok) throw new Error(j?.error || 'Error search');
  return { headers: j.headers || COLS, rows: j.rows || [] };
}
async function apiAll(){
  if(!API) return null;
  const r = await fetch(`${API}?action=all&${buster()}`, {cache:'no-store'});
  const j = await r.json();
  if(!j?.ok) return null;
  return { headers: j.headers, rows: j.rows };
}

// ===== Índice por número para enriquecer =====
function buildAllIndex(){
  if(!ALL_HEADERS || !ALL_ROWS) { ALL_INDEX_BY_NUM=null; return; }
  const numVariants = MAP.numero.map(normKey);
  let numIdx = -1;
  ALL_HEADERS.forEach((h,i)=>{ if(numVariants.includes(normKey(h))) numIdx = i; });
  if(numIdx<0){ ALL_INDEX_BY_NUM=null; return; }

  const map = new Map();
  for(const arr of ALL_ROWS){
    const num = S(arr[numIdx]).trim();
    if(!num) continue;
    const obj = {};
    ALL_HEADERS.forEach((h,i)=>{ obj[h]=arr[i]; });
    map.set(num, obj);
  }
  ALL_INDEX_BY_NUM = map;
}

// ===== Tabla =====
function setCols(cols){
  COLS = cols.slice();
  const by = $('#by');
  by.innerHTML = `<option value="__ALL__">— Todas —</option>` + COLS.map(c=>`<option>${c}</option>`).join('');
  $('#thead').innerHTML = `<tr>${COLS.map(c=>`<th data-key="${c}">${c}</th>`).join('')}</tr>`;
  $$('#thead th').forEach(th=>{
    th.addEventListener('click', ()=>{
      const k = th.dataset.key;
      if(SORT.key===k) SORT.asc=!SORT.asc; else { SORT.key=k; SORT.asc=true; }
      applySortClasses(); renderBody();
    });
  });
  applySortClasses();
}
function applySortClasses(){
  $$('#thead th').forEach(th=>{
    th.classList.remove('sort-asc','sort-desc');
    if (SORT.key===th.dataset.key) th.classList.add(SORT.asc?'sort-asc':'sort-desc');
  });
}
function renderBody(){
  if(!ROWS.length){
    $('#tbody').innerHTML = `<tr><td colspan="${COLS.length}" class="muted">Sin resultados</td></tr>`;
    $('#count').textContent = '0'; return;
  }
  const f = N($('#filter').value);
  let rows = ROWS;
  if(f) rows = rows.filter(r=>Object.values(r).some(v=>N(v).includes(f)));
  if(SORT.key){
    const k=SORT.key, dir=SORT.asc?1:-1;
    rows = rows.slice().sort((a,b)=> (S(a[k])>S(b[k])?1:-1)*dir);
  }
  const longCols=/CRISTAL|DETALLE|CONCEPTO|OBS|LOCALIDAD|APELLIDO|NOMBRE/i;
  const numCols=/N.?TRABAJO|NUMERO|DOCUMENTO|DNI|TOTAL|SEÑA|SALDO|PRECIO|ANTEOJO|TEL|OD|OI|EJE|ADD|DNP/i;

  $('#tbody').innerHTML = rows.map(r=>{
    const tds = COLS.map(h=>{
      const val = S(r[h] ?? r[h?.toLowerCase()] ?? '');
      const cls = longCols.test(h)?'wraptext' : numCols.test(h)?'num right' : 'truncate';
      return `<td class="${cls}" title="${val}">${val||'—'}</td>`;
    }).join('');
    return `<tr>${tds}</tr>`;
  }).join('');

  $$('#tbody tr').forEach((tr,i)=> tr.addEventListener('click', ()=>openPretty(rows[i])) );
  $('#count').textContent = String(rows.length);
}

// ===== Utils modal =====
function classifyEstado(s){
  s = S(s).toLowerCase();
  if(s.includes('listo') || s.includes('entregado')) return 'ok';
  if(s.includes('falta') || s.includes('demora')) return 'warn';
  if(s.includes('anula') || s.includes('cancel')) return 'bad';
  return '';
}
function g(row, canon){
  const keys = MAP[canon]||[];
  for(const k of keys){
    for(const kk of Object.keys(row)){
      if(normKey(kk)===normKey(k)) return row[kk];
    }
  }
  return undefined;
}

// ---- Merge que prioriza valores “rellenos” de ALL ----
function mergePreferFilled(partialRow, allRow){
  if(!allRow) return {...partialRow};
  const out = {...partialRow};
  for(const k of Object.keys(allRow)){
    const vAll = allRow[k];
    const vPar = out[k];
    const filledAll = !(vAll==null || S(vAll).trim()==='');
    if(filledAll) out[k] = vAll; // si ALL tiene algo, gana
    // si ALL viene vacío, queda lo que ya tenía la fila parcial
  }
  return out;
}

// ===== Modal =====
function openPretty(rowIn){
  // Enriquecer con ALL por número de trabajo (prioriza valores NO vacíos de ALL)
  let merged = rowIn;
  const numeroTemp = coalesce(g(rowIn,'numero'), rowIn['NUMERO TRABAJO'], rowIn['Número trabajo']);
  if(ALL_INDEX_BY_NUM && numeroTemp && ALL_INDEX_BY_NUM.has(numeroTemp)){
    const full = ALL_INDEX_BY_NUM.get(numeroTemp);
    merged = mergePreferFilled(rowIn, full);
  }
  const row = merged;

  // Core
  const estado       = coalesce(g(row,'estado'), row['LISTO'], row['Estado']);
  const fecha        = coalesce(g(row,'fecha'));
  const fechaRetira  = coalesce(g(row,'fechaRetira'));
  const numero       = coalesce(g(row,'numero'), numeroTemp);
  const dni          = coalesce(g(row,'dni'));
  const nombre       = coalesce(g(row,'nombre'));
  const telefono     = coalesce(g(row,'telefono'));
  const localidad    = coalesce(g(row,'localidad'));
  const modalidad    = coalesce(g(row,'modalidad'));

  const cristal       = coalesce(g(row,'cristal'));
  const precioCristal = parseMoneyLike(coalesce(g(row,'precioCristal'),0));
  const nAnteojo      = coalesce(g(row,'nAnteojo'));
  const precioArmazon = parseMoneyLike(coalesce(g(row,'precioArmazon'),0));
  const detArmazon    = coalesce(g(row,'detArmazon'));
  const otro          = S(coalesce(g(row,'otro'),'')).trim();
  const precioOtro    = parseMoneyLike(coalesce(g(row,'precioOtro'),0));
  const descuento     = parseMoneyLike(coalesce(g(row,'descuento'),0));
  const sena          = parseMoneyLike(coalesce(g(row,'sena'),0));

  // OS / Pago retiro
  const obraSocial    = coalesce(g(row,'obraSocial'));
  const precioOS      = parseMoneyLike(coalesce(g(row,'precioObraSocial'),0));
  const pagoRetiro    = parseMoneyLike(coalesce(g(row,'pagoRetiro'),0));

  // Graduación
  const od_esf = coalesce(g(row,'od_esf'));
  const od_cil = coalesce(g(row,'od_cil'));
  const od_eje = coalesce(g(row,'od_eje'));
  const oi_esf = coalesce(g(row,'oi_esf'));
  const oi_cil = coalesce(g(row,'oi_cil'));
  const oi_eje = coalesce(g(row,'oi_eje'));
  const dnp_od = coalesce(g(row,'dnp_od'));
  const dnp_oi = coalesce(g(row,'dnp_oi'));
  const add    = coalesce(g(row,'add'));
  const distF  = coalesce(g(row,'distFocal'));
  const dnpOcc = coalesce(g(row,'dnp_oculta'));

  // Entrega
  const entregadoPor  = coalesce(g(row,'entregadoPor'));
  const fechaEntrega  = coalesce(g(row,'fechaEntrega')); // incluye "Fecha entrega real"

  // Adjuntos → botón
  const fotosRaw  = coalesce(g(row,'fotos'));
  const fotosBtn  = $('#kvFotosBtn');
  const fotosNone = $('#kvFotosNone');
  if (fotosBtn && fotosNone) {
    const url = S(fotosRaw).trim();
    if (url && isURL(url)) { fotosBtn.href = url; fotosBtn.style.display = 'inline-block'; fotosNone.style.display = 'none'; }
    else { fotosBtn.style.display = 'none'; fotosNone.style.display = 'inline'; }
  }

  // Otro monto embebido
  let otroMonto = 0;
  if(!precioOtro && /\$|\d/.test(otro)){
    const m = otro.match(/(-?\d[\d.]*)/g);
    if(m) otroMonto = Number(m.at(-1).replace(/[^\d.-]/g,''))||0;
  }

  // Cálculos
  const subtotal = (precioCristal + precioArmazon + (precioOtro||otroMonto));
  const saldo = Math.max(subtotal - (descuento||0) - (precioOS||0) - (sena||0) - (pagoRetiro||0), 0);

  // Header
  $('#estadoBadge').textContent = S(estado||'—').toUpperCase();
  $('#estadoBadge').className = 'badge '+classifyEstado(estado);
  $('#noTrabajo').textContent = `Nº ${numero}`;

  // Fechas / Paciente
  $('#kvFecha').textContent         = fecha;
  $('#kvFechaRetira').textContent   = fechaRetira;
  $('#kvDni').textContent           = dni;
  $('#kvNombre').textContent        = nombre;

  // Lentes
  $('#kvCristal').textContent       = cristal;
  $('#kvPrecioCristal').textContent = money(precioCristal);
  $('#kvNA').textContent            = nAnteojo;
  $('#kvPrecioArmazon').textContent = money(precioArmazon);
  $('#kvDetArmazon').textContent    = detArmazon;

  // Otros
  $('#kvOtro').textContent          = otro || '—';
  $('#kvSena').textContent          = money(sena);
  $('#kvPrecioOtro').textContent    = precioOtro ? money(precioOtro) : (otroMonto? money(otroMonto) : '—');
  $('#kvDescuento').textContent     = descuento ? `– ${money(descuento)}` : '—';
  $('#kvVendedor').textContent      = coalesce(g(row,'vendedor'));
  $('#kvFormaPago').textContent     = coalesce(g(row,'formaPago'));

  // OS + Pago retiro + Entrega
  $('#kvObraSocial').textContent    = obraSocial || '—';
  $('#kvPrecioOS').textContent      = precioOS ? `– ${money(precioOS)}` : '—';
  $('#kvPagoRetiro').textContent    = pagoRetiro ? `– ${money(pagoRetiro)}` : '—';
  $('#kvEntregadoPor').textContent  = entregadoPor || '—';
  $('#kvFechaEntrega').textContent  = fechaEntrega || '—';

  // Teléfono, localidad, modalidad
  const telNode = $('#kvTelefono'); if(telNode) telNode.innerHTML = phoneLinks(telefono);
  $('#kvLocalidad').textContent = localidad || '—';
  $('#kvModalidad').textContent = modalidad || '—';

  // Graduación
  const set = (id,val)=>{ const n=$(id); if(n) n.textContent = S(val)||'—'; };
  set('#od_esf', od_esf); set('#od_cil', od_cil); set('#od_eje', od_eje);
  set('#oi_esf', oi_esf); set('#oi_cil', oi_cil); set('#oi_eje', oi_eje);
  set('#dnp_od', dnp_od); set('#dnp_oi', dnp_oi); set('#add', add);
  set('#dist_f', distF);  set('#dnp_occ', dnpOcc);

  // Totales
  $('#totSubtotal').textContent  = money(subtotal);
  $('#totDesc').textContent      = descuento ? `– ${money(descuento)}` : '—';
  $('#totOS').textContent        = precioOS ? `– ${money(precioOS)}` : '—';
  $('#totSena').textContent      = money(sena);
  $('#totPagoRetiro').textContent= pagoRetiro ? `– ${money(pagoRetiro)}` : '—';
  $('#totSaldo').textContent     = money(saldo);

  // Títulos
  $('#modalTitle').textContent = `Trabajo ${numero||''}`.trim();
  $('#modalSubtitle').textContent = nombre ? `Cliente: ${nombre}` : 'Vista de solo lectura';
  $('#overlay').setAttribute('aria-hidden','false');
}
function cerrarModal(){ $('#overlay').setAttribute('aria-hidden','true'); }

// ===== Búsqueda (con cache local opcional) =====
function localFilter(by, q, exact){
  if(!ALL_ROWS || !ALL_HEADERS) return null;
  const Q = N(q);
  const headers = ALL_HEADERS.slice();
  let idxs;
  if(by && by!=='__ALL__'){
    const i = headers.findIndex(h => N(h)===N(by));
    if(i<0) return null;
    idxs = [i];
  } else {
    idxs = headers.map((_,i)=>i);
  }
  const rows = ALL_ROWS.filter(rowArr=>{
    if(!rowArr) return false;
    return idxs.some(i=>{
      const v = rowArr[i]==null ? '' : String(rowArr[i]);
      return exact ? N(v)===Q : N(v).includes(Q);
    });
  }).map(rowArr=>{
    const obj = {}; headers.forEach((h,i)=> obj[h]= rowArr[i]); return obj;
  });
  return { headers, rows };
}

async function buscar({silent=false} = {}){
  const by = $('#by').value;
  const q  = S($('#q').value).trim();
  const exact = $('#exact').checked;

  if(!q){
    if(!silent){ $('#status').textContent='Escribí un dato para buscar.'; ROWS=[]; renderBody(); }
    return;
  }
  if(!API){ $('#status').textContent='Pegá la URL de Apps Script (arriba) y presioná Enter.'; return; }
  if(!exact && q.length < LIVE_MIN_CHARS){
    if(!silent) $('#status').textContent = `Escribí al menos ${LIVE_MIN_CHARS} letras…`;
    ROWS = []; renderBody(); return;
  }

  const myId = ++lastSearchId;
  if(!silent) $('#status').textContent='Buscando…';

  try{
    let headers, rows;
    const local = (!exact && by==='__ALL__') ? localFilter(by, q, exact) : null;
    if(local && local.rows.length){ headers=local.headers; rows=local.rows; }
    else {
      const res = await apiSearch(by, q, exact);
      headers = res.headers && res.headers.length ? res.headers : COLS;
      rows    = res.rows || [];
    }
    if(myId !== lastSearchId) return;

    COLS = headers; setCols(COLS);
    ROWS = rows; renderBody();
    $('#status').textContent = `Resultados: ${ROWS.length}`;
  }catch(e){
    console.error(e);
    if(myId !== lastSearchId) return;
    $('#status').textContent='Error al buscar (revisá el endpoint).';
  }
}

const buscarDebounced = debounce(()=>buscar({silent:true}), DEBOUNCE_MS);

// ===== Arranque =====
window.addEventListener('DOMContentLoaded', async ()=>{
  const apiUrl = $('#apiUrl');
  if(apiUrl){
    apiUrl.value = API;
    apiUrl.addEventListener('keydown', e=>{
      if(e.key==='Enter'){
        localStorage.setItem('OC_API', apiUrl.value.trim());
        $('#status').textContent='Guardado el endpoint de Apps Script.';
      }
    });
  }

  $('#btnSearch').addEventListener('click', () => buscar({silent:false}));
  $('#btnClear').addEventListener('click', ()=>{
    $('#q').value=''; $('#filter').value=''; ROWS=[]; $('#tbody').innerHTML=''; $('#count').textContent='0'; $('#status').textContent='Listo.';
  });
  $('#filter').addEventListener('input', renderBody);
  $('#modalClose').addEventListener('click', cerrarModal);
  $('#overlay').addEventListener('click', e=>{ if(e.target.id==='overlay') cerrarModal(); });

  const qInput = $('#q');
  qInput.addEventListener('input', ()=>{
    const v = qInput.value.trim();
    if(!v){ ROWS=[]; renderBody(); $('#status').textContent='Listo.'; return; }
    buscarDebounced();
  });
  qInput.addEventListener('keydown', (e)=>{ if(e.key==='Enter'){ e.preventDefault(); buscar({silent:false}); } });
  $('#by').addEventListener('change', buscarDebounced);
  $('#exact').addEventListener('change', buscarDebounced);

  try{
    if(API){
      const cols = await apiColumns();
      setCols(cols);
      const all = await apiAll();
      if(all?.rows?.length){
        ALL_HEADERS = all.headers;
        ALL_ROWS    = all.rows;
        buildAllIndex();
      }
      $('#status').textContent='Listo.';
    }else{
      setCols(['LISTO','FECHA','FECHA RETIRA','NUMERO TRABAJO','DOCUMENTO','APELLIDO Y NOMBRE','CRISTAL']);
      $('#status').textContent='Pegá la URL de Apps Script (arriba) y Enter.';
    }
  }catch(err){
    console.error(err);
    $('#status').textContent='No pude cargar columnas (revisá la URL del API).';
  }
});
