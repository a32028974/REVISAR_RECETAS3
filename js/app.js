// ===== Buscar trabajos + Modal clarito — v2 (compatible con actions: columns/search/all) =====

// 1) Pegá 1 vez tu URL /exec en la caja "Pegar URL de Apps Script" y Enter,
//    o hardcodeala acá en API_FALLBACK:
const API_FALLBACK = 'https://script.google.com/macros/s/AKfycbwsUI50KmWw4OYYwD9HfNn3qPHNBFwZ7Zx2997lfwnoahy6sBCKZwd6vKr4hhsIQXKp/exec'; // ej: 'https://script.google.com/macros/s/AKfycb.../exec'
const API = (localStorage.getItem('OC_API') || API_FALLBACK || '').trim();

// === Config búsqueda en vivo
const DEBOUNCE_MS = 350;       // espera desde la última tecla
const LIVE_MIN_CHARS = 2;      // mínimo de letras para buscar si NO es "Exacto"

// === Helpers
const $ = (q,root=document)=>root.querySelector(q);
const $$= (q,root=document)=>Array.from(root.querySelectorAll(q));
const S  = v => v==null ? '' : String(v);
const N  = s => S(s).replace(/[\u00A0\u200B-\u200D\uFEFF]/g,' ')
                    .normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase();
const buster = ()=>'_t='+Date.now();
const money = v => (Number(S(v).replace(/[^\d.-]/g,''))||0)
  .toLocaleString('es-AR',{style:'currency',currency:'ARS',maximumFractionDigits:0});

// Debounce
function debounce(fn, delay = 300) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn.apply(null, args), delay);
  };
}

// === Estado
let COLS = [];
let ROWS = [];
let ALL_HEADERS = null;
let ALL_ROWS = null;
let SORT = { key:null, asc:true };
let lastSearchId = 0; // para descartar respuestas viejas

// === Mapeo flexible para el modal
const MAP = {
  estado: ['listo','estado'],
  fecha: ['fecha'],
  fechaRetira: ['fecha retira','fecha que retira','fecha retiro'],
  numero: ['numero trabajo','número trabajo','n trabajo','n° trabajo','num trabajo'],
  dni: ['documento','dni'],
  nombre: ['apellido y nombre','apellido','nombre y apellido','paciente'],
  cristal: ['cristal','tipo de cristal'],
  precioCristal: ['precio cristal'],
  nAnteojo: ['n anteojo','nº anteojo','n armazon','nº armazón','armazon n'],
  precioArmazon: ['precio armazon','precio armazón'],
  detArmazon: ['detalle armazon','detalle armazón','modelo / marca','marca / modelo','detalle'],
  otro: ['otro concepto','concepto','concepto negativo'],
  sena: ['seña','sena']
};
const normKey = k => S(k).trim().toLowerCase();
const coalesce = (...xs)=> xs.find(x => x!=null && String(x).trim()!=='') ?? '—';

// === API (igual a tu contrato anterior)
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

// === UI base
function setCols(cols){
  COLS = cols.slice();
  const by = $('#by');
  by.innerHTML = `<option value="__ALL__">— Todas —</option>` + COLS.map(c=>`<option>${c}</option>`).join('');
  $('#thead').innerHTML = `<tr>${COLS.map(c=>`<th data-key="${c}">${c}</th>`).join('')}</tr>`;
  // ordenar por click
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

  // abrir modal clarito
  $$('#tbody tr').forEach((tr,i)=> tr.addEventListener('click', ()=>openPretty(rows[i])) );

  $('#count').textContent = String(rows.length);
}

// === Modal claro
function classifyEstado(s){
  s = S(s).toLowerCase();
  if(s.includes('listo') || s.includes('entregado')) return 'ok';
  if(s.includes('falta') || s.includes('demora')) return 'warn';
  if(s.includes('anula') || s.includes('cancel')) return 'bad';
  return '';
}
function openPretty(row){
  const get = (canon) => {
    const keys = MAP[canon]||[];
    for(const k of keys){
      for(const kk of Object.keys(row)){
        if(normKey(kk)===normKey(k)) return row[kk];
      }
    }
    return undefined;
  };
  const estado = coalesce(get('estado'), row['LISTO'], row['Estado']);
  const fecha = coalesce(get('fecha'));
  const fechaRetira = coalesce(get('fechaRetira'));
  const numero = coalesce(get('numero'));
  const dni = coalesce(get('dni'));
  const nombre = coalesce(get('nombre'));
  const cristal = coalesce(get('cristal'));
  const precioCristal = Number(S(coalesce(get('precioCristal'),0)).replace(/[^\d.-]/g,''))||0;
  const nAnteojo = coalesce(get('nAnteojo'));
  const precioArmazon = Number(S(coalesce(get('precioArmazon'),0)).replace(/[^\d.-]/g,''))||0;
  const detArmazon = coalesce(get('detArmazon'));
  const otro = S(coalesce(get('otro'),'')).trim();
  const sena = Number(S(coalesce(get('sena'),0)).replace(/[^\d.-]/g,''))||0;

  let otroMonto = 0;
  if(/\$|\d/.test(otro)){
    const m = otro.match(/(-?\d[\d.]*)/g);
    if(m) otroMonto = Number(m.at(-1).replace(/[^\d.-]/g,''))||0;
  }
  const subtotal = precioCristal + precioArmazon + (otroMonto||0);
  const saldo = Math.max(subtotal - sena, 0);

  $('#estadoBadge').textContent = S(estado||'—').toUpperCase();
  $('#estadoBadge').className = 'badge '+classifyEstado(estado);
  $('#noTrabajo').textContent = `Nº ${numero}`;

  $('#kvFecha').textContent = fecha;
  $('#kvFechaRetira').textContent = fechaRetira;
  $('#kvDni').textContent = dni;
  $('#kvNombre').textContent = nombre;

  $('#kvCristal').textContent = cristal;
  $('#kvPrecioCristal').textContent = money(precioCristal);
  $('#kvNA').textContent = nAnteojo;
  $('#kvPrecioArmazon').textContent = money(precioArmazon);
  $('#kvDetArmazon').textContent = detArmazon;

  $('#kvOtro').textContent = otro || '—';
  $('#kvSena').textContent = money(sena);

  $('#totSubtotal').textContent = money(subtotal);
  $('#totSena').textContent = money(sena);
  $('#totSaldo').textContent = money(saldo);

  $('#modalTitle').textContent = `Trabajo ${numero||''}`.trim();
  $('#modalSubtitle').textContent = nombre ? `Cliente: ${nombre}` : 'Vista de solo lectura';
  $('#overlay').setAttribute('aria-hidden','false');
}
function cerrarModal(){ $('#overlay').setAttribute('aria-hidden','true'); }

// === Búsqueda (con soporte local si hay ALL cargado)
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
    // a objeto por header para reusar renderBody/openPretty
    const obj = {};
    headers.forEach((h,i)=> obj[h]= rowArr[i]);
    return obj;
  });
  return { headers, rows };
}

async function buscar({silent=false} = {}){
  const by = $('#by').value;
  const q  = S($('#q').value).trim();
  const exact = $('#exact').checked;

  if(!q){
    if(!silent){
      $('#status').textContent='Escribí un dato para buscar.';
      ROWS = []; renderBody();
    }
    return;
  }
  if(!API){
    $('#status').textContent='Pegá la URL de Apps Script (arriba) y presioná Enter.';
    return;
  }

  // umbral de caracteres cuando NO es "Exacto"
  if(!exact && q.length < LIVE_MIN_CHARS){
    if(!silent) $('#status').textContent = `Escribí al menos ${LIVE_MIN_CHARS} letras…`;
    ROWS = []; renderBody();
    return;
  }

  const myId = ++lastSearchId;
  if(!silent) $('#status').textContent='Buscando…';

  try{
    // 1) intento local si tenemos cache de "all" y búsqueda amplia
    let headers, rows;
    const local = (!exact && by==='__ALL__') ? localFilter(by, q, exact) : null;

    if(local && local.rows.length){
      headers = local.headers;
      rows    = local.rows;
    } else {
      // 2) voy al API
      const res = await apiSearch(by, q, exact);
      headers = res.headers && res.headers.length ? res.headers : COLS;
      rows    = res.rows || [];
    }

    // descarta si llegó una respuesta vieja
    if(myId !== lastSearchId) return;

    COLS = headers;
    setCols(COLS);
    ROWS = rows;
    renderBody();
    $('#status').textContent = `Resultados: ${ROWS.length}`;
  }catch(e){
    console.error(e);
    if(myId !== lastSearchId) return;
    $('#status').textContent='Error al buscar (revisá el endpoint).';
  }
}

// versión debounced para búsqueda en vivo
const buscarDebounced = debounce(() => buscar({silent:true}), DEBOUNCE_MS);

// === Eventos y arranque
window.addEventListener('DOMContentLoaded', async ()=>{
  // Guardar / leer endpoint desde UI
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

  // Botones clásicos
  $('#btnSearch').addEventListener('click', () => buscar({silent:false}));
  $('#btnClear').addEventListener('click', ()=>{
    $('#q').value=''; $('#filter').value='';
    ROWS = []; $('#tbody').innerHTML=''; $('#count').textContent='0';
    $('#status').textContent='Listo.';
  });
  $('#filter').addEventListener('input', renderBody);
  $('#modalClose').addEventListener('click', cerrarModal);
  $('#overlay').addEventListener('click', e=>{ if(e.target.id==='overlay') cerrarModal(); });

  // Búsqueda en vivo mientras escribís
  const qInput = $('#q');
  qInput.addEventListener('input', ()=>{
    const v = qInput.value.trim();
    if(!v){
      ROWS = []; renderBody();
      $('#status').textContent='Listo.';
      return;
    }
    buscarDebounced();
  });
  // Enter = buscar inmediato
  qInput.addEventListener('keydown', (e)=>{
    if(e.key==='Enter'){
      e.preventDefault();
      buscar({silent:false});
    }
  });
  // Cambios de filtros re-disparan búsqueda (debounced)
  $('#by').addEventListener('change', buscarDebounced);
  $('#exact').addEventListener('change', buscarDebounced);

  // Cargar columnas del server y (si existe) precargar "all" para búsquedas locales rápidas
  try{
    if(API){
      const cols = await apiColumns(); // ← action=columns
      setCols(cols);
      const all = await apiAll();      // ← action=all (opcional si lo tenés)
      if(all?.rows?.length){
        ALL_HEADERS = all.headers; ALL_ROWS = all.rows;
      }
      $('#status').textContent='Listo.';
    }else{
      // sin API: columnas mínimas de arranque
      setCols(['LISTO','FECHA','FECHA RETIRA','NUMERO TRABAJO','DOCUMENTO','APELLIDO Y NOMBRE','CRISTAL']);
      $('#status').textContent='Pegá la URL de Apps Script (arriba) y Enter.';
    }
  }catch(err){
    console.error(err);
    $('#status').textContent='No pude cargar columnas (revisá la URL del API).';
  }
});
