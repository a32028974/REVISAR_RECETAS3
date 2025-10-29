// ===== Buscar trabajos + Modal clarito =====
// Poné tu URL de Apps Script acá o guardala desde el input de la UI:
const API_URL = 'https://script.google.com/macros/s/AKfycbwsUI50KmWw4OYYwD9HfNn3qPHNBFwZ7Zx2997lfwnoahy6sBCKZwd6vKr4hhsIQXKp/exec';

// === Utilidades ===
const $ = (q,root=document)=>root.querySelector(q);
const $$= (q,root=document)=>Array.from(root.querySelectorAll(q));
const fmtMoney = v => {
  const n = Number(String(v).replace(/[^\d.-]/g,'')) || 0;
  return n.toLocaleString('es-AR',{style:'currency',currency:'ARS',maximumFractionDigits:0});
};
const coalesce = (...xs) => xs.find(x => x!==undefined && x!==null && String(x).trim()!=='') ?? '—';
const normKey = k => String(k||'').trim().toLowerCase();

// Mapeos de posibles nombres de columna -> clave "canónica"
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

// === Estado ===
let COLS = [];   // columnas visibles en tabla
let ROWS = [];   // datos crudos (array de objetos por fila)

// === Inicio ===
window.addEventListener('DOMContentLoaded', () => {
  // guardar API por la UI (opcional)
  const apiUrl = $('#apiUrl');
  if (apiUrl){
    apiUrl.value = API;
    apiUrl.addEventListener('keydown', e=>{
      if(e.key==='Enter'){
        localStorage.setItem('OC_API', apiUrl.value.trim());
        $('#status').textContent = 'Guardado el endpoint de Apps Script.';
      }
    });
  }

  // listeners UI
  $('#btnSearch').addEventListener('click', buscar);
  $('#btnClear').addEventListener('click', limpiar);
  $('#filter').addEventListener('input', filtrarTabla);
  $('#modalClose').addEventListener('click', cerrarModal);
  $('#overlay').addEventListener('click', e=>{ if(e.target.id==='overlay') cerrarModal(); });

  // columnas de ejemplo por si no hay datos aún
  setCols([
    'LISTO','FECHA','FECHA RETIRA','NUMERO TRABAJO','DOCUMENTO','APELLIDO Y NOMBRE',
    'CRISTAL','PRECIO CRISTAL','N ANTEOJO','PRECIO ARMAZON','DETALLE ARMAZON','OTRO CONCEPTO','SEÑA'
  ]);

  // si querés, dispará una demo inicial
  // demo();
});

// === Búsqueda ===
async function buscar(){
  const bySel = $('#by'); const q = $('#q').value.trim(); const exact = $('#exact').checked;
  const by = bySel.value || '';

  $('#status').textContent = 'Buscando…';
  try{
    let data;

    if(API){
      // Ajustá los nombres de parámetros a tu Apps Script si fueran distintos
      const p = new URLSearchParams({ action:'buscar', by, q, exact: String(exact) });
      const res = await fetch(`${API}?${p.toString()}`, { method:'GET' });
      if(!res.ok) throw new Error(`HTTP ${res.status}`);
      data = await res.json(); // esperar { columns:[], rows:[{...}] } ó array de objetos
    }else{
      // Modo demo (sin endpoint) para que puedas ver el modal clarito
      data = demoData(q);
    }

    // Normalizo formatos: permito {columns, rows} o array de objetos
    let rows = [];
    if(Array.isArray(data)){
      rows = data;
      // deduzco columnas del primer row
      const cols = Object.keys(rows[0]||{});
      setCols(cols);
    }else if(data && Array.isArray(data.rows)){
      rows = data.rows;
      if(Array.isArray(data.columns) && data.columns.length) setCols(data.columns);
      else setCols(Object.keys(rows[0]||{}));
    }else{
      throw new Error('Formato de respuesta no reconocido');
    }

    ROWS = rows;
    renderTable(rows);
    $('#status').textContent = 'Listo.';
  }catch(err){
    console.error(err);
    $('#status').textContent = 'Error al buscar. Revisá la URL del Apps Script o la respuesta.';
    ROWS = [];
    renderTable([]);
  }
}

function limpiar(){
  $('#q').value = '';
  $('#filter').value = '';
  renderTable([]);
  $('#count').textContent = '0';
  $('#status').textContent = 'Listo.';
}

function setCols(cols){
  COLS = cols.slice();
  // llenar <select id="by">
  const by = $('#by');
  by.innerHTML = '';
  COLS.forEach(c=>{
    const opt = document.createElement('option');
    opt.value = c; opt.textContent = c;
    by.appendChild(opt);
  });
  // render thead
  const thead = $('#thead');
  thead.innerHTML = '<tr>'+COLS.map(c=>`<th>${c}</th>`).join('')+'</tr>';
}

function renderTable(rows){
  const tbody = $('#tbody');
  tbody.innerHTML = '';

  rows.forEach((r, idx)=>{
    const tr = document.createElement('tr');
    tr.dataset.idx = idx;
    tr.innerHTML = COLS.map(c=>{
      const v = r[c] ?? r[c.toLowerCase()] ?? r[c.toUpperCase()] ?? '';
      return `<td title="${escapeHtml(String(v))}">${escapeHtml(String(v))}</td>`;
    }).join('');
    tr.addEventListener('click', ()=>openPretty(r));
    tbody.appendChild(tr);
  });

  $('#count').textContent = String(rows.length);
}

function filtrarTabla(e){
  const val = e.target.value.toLowerCase();
  $$('#tbody tr').forEach(tr=>{
    const txt = tr.textContent.toLowerCase();
    tr.style.display = txt.includes(val) ? '' : 'none';
  });
}

function escapeHtml(s){ return s.replace(/[&<>"']/g, m=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m])); }

// === Modal "clarito" ===
function openPretty(rowRaw){
  // Creo un objeto canónico (independiente de cómo venga nombrada la columna)
  const get = (canon) => {
    const keys = MAP[canon] || [];
    for(const k of keys){
      // matcheo insensible a mayus/minus
      for(const kk of Object.keys(rowRaw)){
        if(normKey(kk) === normKey(k)) return rowRaw[kk];
      }
    }
    return undefined;
  };

  const estado = coalesce(get('estado'), rowRaw['LISTO'], rowRaw['Estado']);
  const fecha = coalesce(get('fecha'));
  const fechaRetira = coalesce(get('fechaRetira'));
  const numero = coalesce(get('numero'));
  const dni = coalesce(get('dni'));
  const nombre = coalesce(get('nombre'));
  const cristal = coalesce(get('cristal'));
  const precioCristal = Number(String(coalesce(get('precioCristal'),0)).replace(/[^\d.-]/g,''))||0;
  const nAnteojo = coalesce(get('nAnteojo'));
  const precioArmazon = Number(String(coalesce(get('precioArmazon'),0)).replace(/[^\d.-]/g,''))||0;
  const detArmazon = coalesce(get('detArmazon'));
  const otro = String(coalesce(get('otro'),'')).trim();
  const sena = Number(String(coalesce(get('sena'),0)).replace(/[^\d.-]/g,''))||0;

  // Intento extraer importes del campo "Otro concepto" si viniera con $…
  let otroMonto = 0;
  if(/\$|\d/.test(otro)){
    const m = otro.match(/(-?\d[\d.]*)/g);
    if(m){ otroMonto = Number(m.at(-1).replace(/[^\d.-]/g,''))||0; }
  }

  const subtotal = precioCristal + precioArmazon + (otroMonto||0);
  const saldo = Math.max(subtotal - sena, 0);

  // Pongo textos
  $('#estadoBadge').textContent = String(estado||'—').toUpperCase();
  $('#estadoBadge').className = 'badge ' + classifyEstado(String(estado||''));
  $('#noTrabajo').textContent = `Nº ${numero}`;

  $('#kvFecha').textContent = fecha;
  $('#kvFechaRetira').textContent = fechaRetira;
  $('#kvDni').textContent = dni;
  $('#kvNombre').textContent = nombre;

  $('#kvCristal').textContent = cristal;
  $('#kvPrecioCristal').textContent = fmtMoney(precioCristal);
  $('#kvNA').textContent = nAnteojo;
  $('#kvPrecioArmazon').textContent = fmtMoney(precioArmazon);
  $('#kvDetArmazon').textContent = detArmazon;

  $('#kvOtro').textContent = otro || '—';
  $('#kvSena').textContent = fmtMoney(sena);

  $('#totSubtotal').textContent = fmtMoney(subtotal);
  $('#totSena').textContent = fmtMoney(sena);
  $('#totSaldo').textContent = fmtMoney(saldo);

  // Título
  $('#modalTitle').textContent = `Trabajo ${numero || ''}`.trim();
  $('#modalSubtitle').textContent = nombre ? `Cliente: ${nombre}` : 'Vista de solo lectura';

  // Abrir
  $('#overlay').setAttribute('aria-hidden','false');
}

function cerrarModal(){
  $('#overlay').setAttribute('aria-hidden','true');
}

function classifyEstado(s){
  s = s.toLowerCase();
  if(s.includes('listo') || s.includes('entregado')) return 'ok';
  if(s.includes('falta') || s.includes('demora')) return 'warn';
  if(s.includes('anula') || s.includes('cancel')) return 'bad';
  return '';
}

// ====== DEMO local (sin endpoint) ======
function demoData(q=''){
  const base = [
    {
      'LISTO':'LISTO','FECHA':'24/10/2025','FECHA RETIRA':'31/10/2025','NUMERO TRABAJO':'52410122852','DOCUMENTO':'7837989',
      'APELLIDO Y NOMBRE':'ELIAS HECTOR','CRISTAL':'ORGANICO BLANCO RANGO EXTENDIDO + COLOR','PRECIO CRISTAL':'—',
      'N ANTEOJO':'—','PRECIO ARMAZON':'—','DETALLE ARMAZON':'DE SU PROP AVIADOR DORADO RAYBAN','OTRO CONCEPTO':'COLOR G15','SEÑA':'20000'
    },
    {
      'LISTO':'—','FECHA':'18/10/2025','FECHA RETIRA':'25/10/2025','NUMERO TRABAJO':'51810122852','DOCUMENTO':'7837989',
      'APELLIDO Y NOMBRE':'ELIAS HECTOR','CRISTAL':'ORGÁNICO BLUE CON ANTIREFLEJO','PRECIO CRISTAL':'62000',
      'N ANTEOJO':'—','PRECIO ARMAZON':'45000','DETALLE ARMAZON':'USUAL GRIS','OTRO CONCEPTO':'','SEÑA':'0'
    }
  ];
  if(!q) return base;
  const qq = q.toLowerCase();
  return base.filter(r => Object.values(r).some(v => String(v).toLowerCase().includes(qq)));
}

function demo(){
  setCols([
    'LISTO','FECHA','FECHA RETIRA','NUMERO TRABAJO','DOCUMENTO','APELLIDO Y NOMBRE',
    'CRISTAL','PRECIO CRISTAL','N ANTEOJO','PRECIO ARMAZON','DETALLE ARMAZON','OTRO CONCEPTO','SEÑA'
  ]);
  const rows = demoData();
  ROWS = rows;
  renderTable(rows);
}
