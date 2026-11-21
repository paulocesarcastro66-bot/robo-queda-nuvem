// Robô Queda com Projeto — PAPEL na nuvem (GitHub Actions)
// Roda o mesmo núcleo do HTML v4.7.1 dentro do Node, guarda tudo em estado.json e manda para o GitHub a cada 5 min.
import fs from 'node:fs';
import vm from 'node:vm';
import { execSync } from 'node:child_process';

const DURACAO_MIN = +(process.env.DURACAO_MIN || 340);   // cada rodada fica ~5h40 ligada; a próxima já entra na fila
const ARQ = 'estado.json', CHAVE = 'roboQuedaProjetoV471';
const inicioRodada = Date.now();

// ---------- armazenamento (substitui o localStorage do navegador) ----------
let disco = {}; try { disco = JSON.parse(fs.readFileSync(ARQ, 'utf8')); } catch (e) {}
const store = {}; if (disco.estado) store[CHAVE] = JSON.stringify(disco.estado);
const localStorage = { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } };

// ---------- navegador falso (o núcleo escreve na tela; aqui só ignora) ----------
const el = () => ({ innerHTML:'', textContent:'', style:{}, onclick:null, querySelectorAll:() => [], appendChild(){}, click(){} });
const els = {};
const document = { getElementById: id => els[id] || (els[id] = el()), createElement: () => el() };
class Worker { constructor(){ this.onmessage = null; setInterval(() => this.onmessage && this.onmessage(), 5000); } }
const ctx = vm.createContext({
  fetch: (u, o) => fetch(u, Object.assign({ signal: AbortSignal.timeout(20000) }, o || {})),
  console, setTimeout, setInterval, clearInterval, clearTimeout, AbortSignal,
  localStorage, document, Worker, URL: { createObjectURL: () => '', revokeObjectURL(){} }, Blob: class {},
  confirm: () => false, alert(){}, navigator: {}, window: {},
});
vm.runInContext(fs.readFileSync(new URL('./nucleo.js', import.meta.url), 'utf8'), ctx, { filename:'nucleo.js' });

// moedas vigiadas da rodada anterior (pool, máxima de 24 h) — não precisa reaprender tudo
if (disco.vigia) vm.runInContext(`(function(v){ for (const k in v) M[k] = v[k]; })`, ctx)(disco.vigia);
vm.runInContext(`S.ligado = true;`, ctx);

function gravar(){
  vm.runInContext('salvar()', ctx);
  const estado = JSON.parse(store[CHAVE] || 'null');
  const vigia = vm.runInContext('(function(){ const o = {}; for (const [k, w] of Object.entries(M)) o[k] = Object.assign({}, w, { velas: undefined }); return o; })()', ctx);
  const extra = vm.runInContext('({ SOLBRL, SOLUSD, erros })', ctx);
  fs.writeFileSync(ARQ, JSON.stringify({ atualizado: Date.now(), cotacao: extra, estado, vigia }));
}
function enviar(){
  try {
    gravar();
    execSync('git add estado.json && (git diff --cached --quiet || git commit -q -m "estado")', { stdio:'inherit' });
    execSync('git pull -q --rebase -X ours origin main && git push -q origin HEAD:main', { stdio:'inherit' });
  } catch (e) { console.log('falha ao enviar estado:', e.message); }
}
setInterval(enviar, 5 * 60000);
setInterval(() => { const s = vm.runInContext('S', ctx); console.log(new Date().toISOString(), 'abertas', Object.keys(s.pos).length, 'fechadas', s.hist.length, 'saldo', (s.saldo || 0).toFixed(4)); }, 60000);
setTimeout(() => { enviar(); console.log('fim da rodada'); process.exit(0); }, DURACAO_MIN * 60000);
process.on('SIGTERM', () => { enviar(); process.exit(0); });
