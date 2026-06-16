#!/usr/bin/env node
/**
 * F1: golden fixture extractor — runs the ORIGINAL v34 simulator JS.
 *
 * Reads inova-cockpit-v34.html, extracts the simulator <script> core
 * (everything from `var WD=` up to the first DOM-rendering function),
 * stubs document.getElementById with per-scenario values and executes
 * compute() + subSteps() for each phase, writing one JSON per scenario
 * into backend/projects/tests/golden/.
 *
 * The JSONs are the executable spec (doc 08 §5.2): they enter the repo and
 * are NEVER edited by hand. Re-run only if the HTML simulator changes.
 *
 * Usage: node golden_extract.js [path-to-inova-cockpit-v34.html]
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const HTML_PATH = process.argv[2]
  || 'C:/Users/Wladimir/Downloads/inova-cockpit-v34.html';
const OUT_DIR = path.join(__dirname, 'golden');

// ── extract the simulator core from the HTML ────────────────────────────────
const html = fs.readFileSync(HTML_PATH, 'utf8');
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
const sim = scripts.find(s => s.includes('function compute('));
if (!sim) throw new Error('simulator <script> not found in ' + HTML_PATH);
const start = sim.indexOf('var WD=');
const end = sim.indexOf('function setpct');
if (start < 0 || end < 0) throw new Error('could not delimit simulator core');
const core = sim.slice(start, end);

const context = vm.createContext({});
vm.runInContext(
  'this.__load = function(document){\n' + core + '\nreturn {compute: compute, subSteps: subSteps};\n};',
  context,
  { filename: 'inova-cockpit-v34-core.js' }
);

// ── document stub ────────────────────────────────────────────────────────────
function makeDoc(values) {
  return {
    getElementById: function (id) {
      if (!(id in values)) throw new Error('missing stub for #' + id);
      const v = values[id];
      if (typeof v === 'boolean') return { checked: v, value: '' };
      return { value: v === null || v === undefined ? '' : String(v) };
    },
  };
}

function iso(d) {
  const p = n => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}

// ── scenarios (doc 08 §5.2 — minimum 14) ────────────────────────────────────
function base(overrides) {
  return Object.assign({
    sim_nome: 'Projeto',
    sim_prazo: 45,
    sim_mode: 'uteis',
    sim_onb: '2026-06-10',
    sim_doc: 15, sim_dev: 50, sim_aud: 8,
    sim_w_val: 5, sim_w_hom: 17, sim_w_ent: 5,
    sim_reupd: 0,
    sim_t_carn: true, sim_t_corp: true,
    sim_dt_val: '', sim_dt_apr: '', sim_dt_grad: '',
  }, overrides);
}

const SCENARIOS = [
  ['01_default', base({})],
  ['02_corridos', base({ sim_mode: 'corridos' })],
  ['03_prazo_min', base({ sim_prazo: 5 })],
  ['04_prazo_longo_dez_jan', base({ sim_prazo: 180 })],
  ['05_capped', base({ sim_doc: 30, sim_dev: 70, sim_aud: 25 })],
  ['06_reupd_cabe', base({ sim_reupd: 2 })],
  ['07_reupd_nao_cabe', base({ sim_reupd: 8 })],
  ['08_remarca_validacao', base({ sim_dt_val: '2026-06-24' })],
  ['09_remarca_apresentacao', base({ sim_dt_apr: '2026-08-07' })],
  ['10_remarca_graduacao', base({ sim_dt_grad: '2026-08-18' })],
  ['11_remarca_todas', base({
    sim_dt_val: '2026-06-24', sim_dt_apr: '2026-08-10', sim_dt_grad: '2026-08-21',
  })],
  ['12_remarca_data_anterior', base({ sim_dt_val: '2026-06-15' })],
  ['13_toggles_off_janeiro', base({
    sim_onb: '2026-01-12', sim_t_carn: false, sim_t_corp: false,
  })],
  ['14_vespera_9_julho', base({ sim_onb: '2026-07-08' })],
  ['15_remarca_todas_corridos', base({
    sim_mode: 'corridos',
    sim_dt_val: '2026-06-21', sim_dt_apr: '2026-07-22', sim_dt_grad: '2026-08-01',
  })],
];

// ── run ──────────────────────────────────────────────────────────────────────
fs.mkdirSync(OUT_DIR, { recursive: true });

for (const [name, values] of SCENARIOS) {
  const { compute, subSteps } = context.__load(makeDoc(values));
  const r = compute();

  const fases = r.seq.map(p => ({
    key: p.key,
    label: p.label,
    dias: p.days,
    pct: p.pct,
    cum_prev: p.cumPrev,
    cum_end: p.cumEnd,
    inicio: iso(p.start),
    fim: iso(p.end),
    sub_passos: subSteps(p.key, p.cumPrev, p.days, r).map(s => ({
      kind: s.kind === 'rec' ? 'rec' : s.kind,
      label: s.label,
      data: iso(s.date),
      pos: s.kind === 'bloco' ? s.pos : null,
      single: s.kind === 'bloco' ? !!s.single : false,
      ws: s.kind === 'bloco' ? !!s.ws : false,
    })),
  }));

  const expected = {
    capped: !!r.capped,
    total_gap: r.totalGap,
    entrega: iso(r.entrega),
    entrega_base: iso(r.entregaBase),
    fases: fases,
    reunioes: {
      val: { data_natural: iso(r.meet.val.nat), gap: r.meet.val.gap, marcada: !!r.meet.val.set },
      apr: { data_natural: iso(r.meet.apr.nat), gap: r.meet.apr.gap, marcada: !!r.meet.apr.set },
      grad: { data_natural: iso(r.meet.grad.nat), gap: r.meet.grad.gap, marcada: !!r.meet.grad.set },
    },
    feriados: r.hols.map(h => ({ data: iso(h.d), nome: h.nm })),
    reupd_info: r.reupdInfo
      ? {
          base: r.reupdInfo.base,
          requested: r.reupdInfo.requested,
          available: r.reupdInfo.available,
          used: r.reupdInfo.used,
          total: r.reupdInfo.total,
        }
      : null,
  };

  const params = {
    prazo_total: values.sim_prazo,
    modo: values.sim_mode,
    data_onboarding: values.sim_onb,
    pct_doc: values.sim_doc,
    pct_dev: values.sim_dev,
    pct_aud: values.sim_aud,
    peso_val: values.sim_w_val,
    peso_hom: values.sim_w_hom,
    peso_ent: values.sim_w_ent,
    reupd_fds: values.sim_reupd,
    considerar_carnaval: values.sim_t_carn,
    considerar_corpus: values.sim_t_corp,
    data_reuniao_validacao: values.sim_dt_val || null,
    data_reuniao_apresentacao: values.sim_dt_apr || null,
    data_reuniao_graduacao: values.sim_dt_grad || null,
  };

  const outPath = path.join(OUT_DIR, name + '.json');
  fs.writeFileSync(
    outPath,
    JSON.stringify({ scenario: name, source: 'inova-cockpit-v34.html', params, expected }, null, 2) + '\n'
  );
  console.log('wrote', outPath, '| entrega', expected.entrega,
    '| capped', expected.capped, '| gap', expected.total_gap);
}
console.log('done:', SCENARIOS.length, 'scenarios');
