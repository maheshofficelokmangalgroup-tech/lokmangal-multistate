// Site-wide interactions. Runs once per full load; `init` re-runs after every
// client-side navigation (Astro view transitions fire `astro:page-load`).
import { navigate } from 'astro:transitions/client';
import { compute } from '@lokmangal/finance';
import { localePath, type Lang } from '../i18n';

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const finePointer = window.matchMedia('(pointer: fine)').matches;
const $ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector<T>(sel);
const $$ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => Array.from(root.querySelectorAll<T>(sel));
const inr = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });
const rupees = (n: number) => `₹${inr.format(Math.round(n))}`;
const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/* Fixed wording comes from the page itself (src/i18n/ui.ts → #i18n), so scripts speak the page's language. */
const pageLang = (): Lang => (document.documentElement.lang === 'mr' ? 'mr' : 'en');
function ui(key: string): string {
  try {
    return (JSON.parse(document.getElementById('i18n')?.textContent ?? '{}') as Record<string, string>)[key] ?? key;
  } catch {
    return key;
  }
}

let cleanups: Array<() => void> = [];
const onCleanup = (fn: () => void) => cleanups.push(fn);

/* Close a dialog with its exit animation (exit is shorter than enter). */
function closeDialog(dialog: HTMLDialogElement) {
  if (!dialog.open || dialog.classList.contains('is-closing')) return;
  if (reduceMotion) return dialog.close();
  dialog.classList.add('is-closing');
  const done = () => {
    dialog.classList.remove('is-closing');
    dialog.close();
  };
  dialog.addEventListener('animationend', done, { once: true });
  setTimeout(() => dialog.open && done(), 400);
}

/* ---------- Scroll reveal ---------- */
function initReveal() {
  $$('[data-stagger]').forEach((group) => {
    Array.from(group.children).forEach((el, i) => (el as HTMLElement).style.setProperty('--i', String(i)));
  });
  const targets = $$('[data-reveal], [data-stagger], [data-words]');
  if (reduceMotion || !('IntersectionObserver' in window)) {
    targets.forEach((el) => el.classList.add('is-in'));
    return;
  }
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          e.target.classList.add('is-in');
          io.unobserve(e.target);
        }
      });
    },
    { rootMargin: '0px 0px -8% 0px', threshold: 0.08 },
  );
  targets.forEach((el) => io.observe(el));
  onCleanup(() => io.disconnect());
}

/* ---------- Animated counters ---------- */
function initCounters() {
  const counters = $$('[data-count]');
  if (!counters.length) return;
  const run = (el: HTMLElement) => {
    const target = Number(el.dataset.count);
    const prefix = el.dataset.prefix ?? '';
    const suffix = el.dataset.suffix ?? '';
    const decimals = Number(el.dataset.decimals ?? 0);
    const fmt = decimals ? new Intl.NumberFormat('en-IN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }) : inr;
    const round = (n: number) => (decimals ? n : Math.round(n));
    if (reduceMotion) {
      el.textContent = `${prefix}${fmt.format(target)}${suffix}`;
      return;
    }
    const duration = 1600;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 4);
      el.textContent = `${prefix}${fmt.format(round(target * eased))}${suffix}`;
      if (t < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };
  const io = new IntersectionObserver(
    (entries) => entries.forEach((e) => { if (e.isIntersecting) { run(e.target as HTMLElement); io.unobserve(e.target); } }),
    { threshold: 0.5 },
  );
  counters.forEach((c) => io.observe(c));
  onCleanup(() => io.disconnect());
}

/* ---------- Header: scrolled / hide-on-scroll, progress bar, back to top ---------- */
let lastY = 0;
function onScroll() {
  const y = window.scrollY;
  const header = $('[data-header]');
  const anyMenuOpen = !!$('[data-nav-item].is-open');
  const focusInHeader = header?.contains(document.activeElement);
  if (header) {
    header.classList.toggle('is-scrolled', y > 24);
    const hide = y > 520 && y > lastY + 4 && !anyMenuOpen && !focusInHeader;
    if (hide) header.classList.add('is-hidden');
    else if (y < lastY - 4 || y < 520) header.classList.remove('is-hidden');
  }
  const max = document.documentElement.scrollHeight - window.innerHeight;
  const p = max > 0 ? Math.min(1, y / max) : 0;
  document.documentElement.style.setProperty('--progress', p.toFixed(4));
  const top = $('[data-to-top]');
  if (top) {
    top.classList.toggle('is-visible', y > 700);
    top.style.setProperty('--ring', String(100 - p * 100));
  }
  lastY = y;
}
let scrollTicking = false;
window.addEventListener(
  'scroll',
  () => {
    if (scrollTicking) return;
    scrollTicking = true;
    requestAnimationFrame(() => { onScroll(); scrollTicking = false; });
  },
  { passive: true },
);
// Keyboard focus must never sit behind the hidden sticky header.
document.addEventListener('focusin', () => $('[data-header]')?.classList.remove('is-hidden'));

/* ---------- Navigation: dropdowns, drawer, announcement ---------- */
function closeMenus(except?: Element) {
  $$('[data-nav-item].is-open').forEach((item) => {
    if (item === except) return;
    item.classList.remove('is-open');
    $('[data-nav-trigger]', item)?.setAttribute('aria-expanded', 'false');
  });
}

function setDrawer(open: boolean) {
  const drawer = $('[data-drawer]');
  const burger = $('[data-burger]');
  if (!drawer || !burger) return;
  drawer.classList.toggle('is-open', open);
  drawer.setAttribute('aria-hidden', String(!open));
  burger.setAttribute('aria-expanded', String(open));
  document.documentElement.style.overflow = open ? 'hidden' : '';
  if (open) ($('[data-drawer-close]') as HTMLButtonElement | null)?.focus();
}

function initNav() {
  $$('[data-nav-trigger]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const item = btn.closest('[data-nav-item]')!;
      const open = !item.classList.contains('is-open');
      closeMenus(item);
      item.classList.toggle('is-open', open);
      btn.setAttribute('aria-expanded', String(open));
    });
  });
  $('[data-burger]')?.addEventListener('click', () => setDrawer(true));
  $('[data-drawer-close]')?.addEventListener('click', () => setDrawer(false));
  $('[data-drawer]')?.addEventListener('click', (e) => {
    if (e.target === e.currentTarget) setDrawer(false);
  });

  const announce = $('[data-announce]');
  try {
    if (sessionStorage.getItem('lm-announce') === 'hidden') announce?.classList.add('is-hidden');
  } catch { /* storage unavailable */ }
  $('[data-announce-close]')?.addEventListener('click', () => {
    announce?.classList.add('is-hidden');
    try { sessionStorage.setItem('lm-announce', 'hidden'); } catch { /* ignore */ }
  });
}
document.addEventListener('click', (e) => {
  if (!(e.target as Element).closest('[data-nav-item]')) closeMenus();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { closeMenus(); setDrawer(false); }
});

/* ---------- Hero slider (pausable; stops on hover, focus, off-screen, hidden tab) ---------- */
function initHero() {
  const hero = $('[data-hero]');
  if (!hero) return;
  const slides = $$('[data-slide]', hero);
  const visuals = $$('[data-visual]', hero);
  const dots = $$('[data-dot]', hero);
  const toggle = $<HTMLButtonElement>('[data-hero-toggle]', hero);
  const status = $('[data-hero-status]', hero);
  if (slides.length < 2) return;
  const DURATION = 6500;
  let index = 0;
  let timer = 0;
  let userPaused = reduceMotion;
  let hovering = false;
  let offscreen = false;

  const running = () => !userPaused && !hovering && !offscreen && !document.hidden;
  const restartDot = () => {
    const bar = $('.hero__dot.is-active span', hero);
    if (!bar) return;
    bar.style.animation = 'none';
    void bar.offsetWidth;
    bar.style.animation = '';
  };
  const sync = () => {
    window.clearInterval(timer);
    const on = running();
    hero.classList.toggle('is-paused', !on);
    if (on) {
      restartDot();
      timer = window.setInterval(() => go(index + 1), DURATION);
    }
  };
  const go = (n: number, announce = false) => {
    index = (n + slides.length) % slides.length;
    slides.forEach((s, i) => {
      const active = i === index;
      s.classList.toggle('is-active', active);
      s.setAttribute('aria-hidden', String(!active));
      $$('a', s).forEach((a) => (active ? a.removeAttribute('tabindex') : a.setAttribute('tabindex', '-1')));
    });
    visuals.forEach((v, i) => v.classList.toggle('is-active', i === index));
    dots.forEach((d, i) => {
      d.classList.toggle('is-active', i === index);
      d.setAttribute('aria-current', String(i === index));
    });
    hero.style.setProperty('--slide-ms', `${DURATION}ms`);
    if (announce && status) status.textContent = `Slide ${index + 1} of ${slides.length}: ${$('.eyebrow', slides[index])?.textContent ?? ''}`;
  };
  const setUserPaused = (p: boolean) => {
    userPaused = p;
    toggle?.setAttribute('aria-pressed', String(p));
    toggle?.setAttribute('aria-label', p ? 'Play slideshow' : 'Pause slideshow');
    sync();
  };

  dots.forEach((d, i) => d.addEventListener('click', () => { go(i, true); sync(); }));
  $('[data-hero-prev]', hero)?.addEventListener('click', () => { go(index - 1, true); sync(); });
  $('[data-hero-next]', hero)?.addEventListener('click', () => { go(index + 1, true); sync(); });
  toggle?.addEventListener('click', () => setUserPaused(!userPaused));

  const stage = $('.hero__inner', hero) ?? hero;
  const enter = () => { hovering = true; sync(); };
  const leave = () => { hovering = false; sync(); };
  stage.addEventListener('pointerenter', enter);
  stage.addEventListener('pointerleave', leave);
  stage.addEventListener('focusin', enter);
  stage.addEventListener('focusout', (e) => { if (!stage.contains(e.relatedTarget as Node)) leave(); });
  const io = new IntersectionObserver(([e]) => { offscreen = !e.isIntersecting; sync(); });
  io.observe(hero);
  const onVis = () => sync();
  document.addEventListener('visibilitychange', onVis);

  go(0);
  setUserPaused(userPaused);
  onCleanup(() => { window.clearInterval(timer); io.disconnect(); document.removeEventListener('visibilitychange', onVis); });

  // Gentle parallax on the floating cards (mouse only).
  if (!reduceMotion && finePointer) {
    const layer = $('[data-parallax]', hero);
    const move = (e: PointerEvent) => {
      if (!layer) return;
      const r = hero.getBoundingClientRect();
      layer.style.setProperty('--px', ((e.clientX - r.left) / r.width - 0.5).toFixed(3));
      layer.style.setProperty('--py', ((e.clientY - r.top) / r.height - 0.5).toFixed(3));
    };
    hero.addEventListener('pointermove', move);
    onCleanup(() => hero.removeEventListener('pointermove', move));
  }
}

/* ---------- Magnetic focal CTAs (max 1–2 per page; mouse only) ---------- */
function initMagnetic() {
  if (reduceMotion || !finePointer) return;
  $$('[data-magnetic]').forEach((el) => {
    const move = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      const x = (e.clientX - (r.left + r.width / 2)) * 0.22;
      const y = (e.clientY - (r.top + r.height / 2)) * 0.3;
      el.style.translate = `${Math.max(-10, Math.min(10, x))}px ${Math.max(-8, Math.min(8, y))}px`;
    };
    const reset = () => { el.style.translate = ''; };
    el.style.transition += ', translate 0.45s cubic-bezier(.34,1.56,.64,1)';
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerleave', reset);
  });
}

/* ---------- Calculators ---------- */
// Formulas are shared with scheme pages and admin previews (packages/finance), so every figure agrees.

/** Published rates past their validity (flag set at build time, or the date has passed since). */
function ratesExpired() {
  const html = document.documentElement;
  if (html.dataset.ratesExpired === 'true') return true;
  const until = html.dataset.ratesValidUntil;
  if (!until) return false;
  const todayIst = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
  return todayIst >= until;
}

type Mode = 'fd' | 'rd' | 'monthly' | 'emi';
type Range = [number, number, number, number];
type CalcConfig = Record<Mode, { label: string; amountLabel: string; amount: Range; rate: Range; months: Range }>;

/* Tween a rupee figure from its current value; a new update cancels the previous tween. */
const tweens = new WeakMap<HTMLElement, number>();
function setRupees(el: HTMLElement, value: number) {
  const target = Math.round(value);
  const from = Number(el.dataset.value ?? target);
  el.dataset.value = String(target);
  cancelAnimationFrame(tweens.get(el) ?? 0);
  if (reduceMotion || from === target) {
    el.textContent = rupees(target);
    return;
  }
  const start = performance.now();
  const step = (now: number) => {
    const t = Math.min(1, (now - start) / 260);
    const eased = 1 - Math.pow(1 - t, 3);
    el.textContent = rupees(from + (target - from) * eased);
    if (t < 1) tweens.set(el, requestAnimationFrame(step));
  };
  tweens.set(el, requestAnimationFrame(step));
}

function initCalculators() {
  const expired = ratesExpired();
  if (expired) $('[data-rates-notice]')?.removeAttribute('hidden');
  $$('[data-calc]').forEach((calc) => {
    if (expired) {
      // Estimates must never use rates that are no longer offered.
      calc.classList.add('is-disabled');
      if (!$('.calc__expired', calc)) {
        const p = document.createElement('p');
        p.className = 'calc__expired';
        p.setAttribute('role', 'status');
        p.textContent = ui('calc.paused');
        calc.append(p);
      }
      return;
    }
    type Key = 'amount' | 'rate' | 'months';
    const keys: Key[] = ['amount', 'rate', 'months'];
    const config = JSON.parse(calc.dataset.config!) as CalcConfig;
    const defaults = JSON.parse(calc.dataset.defaults!) as { mode: Mode; amount: number; rate: number; months: number };
    const inputs = Object.fromEntries(keys.map((k) => [k, $<HTMLInputElement>(`[data-input="${k}"]`, calc)!])) as Record<Key, HTMLInputElement>;
    const boxes = Object.fromEntries(keys.map((k) => [k, $<HTMLInputElement>(`[data-box="${k}"]`, calc)!])) as Record<Key, HTMLInputElement>;
    const tabs = $$('[data-calc-tab]', calc);
    const ink = $('.calc__tab-ink', calc);
    const cta = $<HTMLAnchorElement>('[data-calc-cta]', calc);
    const chart = $('[data-chart]', calc);
    const tip = $('[data-tip]', calc);
    let mode = defaults.mode;
    let seen = false; // the chart grows in the first time the calculator is on screen

    const tenure = (m: number) => {
      const y = Math.floor(m / 12);
      const mo = m % 12;
      return [y ? `${y} ${ui('calc.yr')}` : '', mo ? `${mo} ${ui('calc.mo')}` : ''].filter(Boolean).join(' ') || `0 ${ui('calc.mo')}`;
    };
    // ₹5,000 → ₹5K, ₹50,00,000 → ₹50 L (slider end labels)
    const short = (n: number) => {
      const f = (v: number) => String(Number(v.toFixed(2)));
      if (n >= 1e7) return `₹${f(n / 1e7)}${ui('calc.crore')}`;
      if (n >= 1e5) return `₹${f(n / 1e5)}${ui('calc.lakh')}`;
      if (n >= 1e3) return `₹${f(n / 1e3)}${ui('calc.thousand')}`;
      return `₹${n}`;
    };
    const boxText = (k: Key, v: number) => (k === 'amount' ? inr.format(v) : k === 'rate' ? v.toFixed(2) : String(v));
    const fill = (el: HTMLInputElement) => {
      const p = ((Number(el.value) - Number(el.min)) / (Number(el.max) - Number(el.min))) * 100;
      el.style.setProperty('--p', `${p}%`);
    };

    // Year-by-year bars: what the money is worth each year (deposits), the interest received (monthly income) or
    // how each year's instalments split between principal and interest (loans).
    const periodOf = (m: number) => (m <= 12 ? 1 : m <= 36 ? 3 : 12);
    const yearly = (a: number, r: number, m: number) => {
      const p = periodOf(m);
      const years = Math.ceil(m / p);
      const rows: { y: number; a: number; b: number }[] = [];
      if (mode === 'emi') {
        const inst = compute('emi', a, r, m).result;
        let bal = a;
        for (let y = 1; y <= years; y++) {
          let pr = 0;
          let it = 0;
          for (let k = (y - 1) * p; k < Math.min(y * p, m); k++) {
            const i = (bal * r) / 1200;
            it += i;
            pr += inst - i;
            bal -= inst - i;
          }
          rows.push({ y, a: pr, b: it });
        }
      } else {
        for (let y = 1; y <= years; y++) {
          const t = Math.min(y * p, m);
          const res = compute(mode, a, r, t);
          if (mode === 'monthly') rows.push({ y, a: 0, b: res.result * t });
          else {
            const invested = mode === 'rd' ? a * t : a;
            rows.push({ y, a: invested, b: res.result - invested });
          }
        }
      }
      return rows;
    };
    const drawChart = (a: number, r: number, m: number) => {
      if (!chart) return;
      const rows = yearly(a, r, m);
      const max = Math.max(...rows.map((x) => x.a + x.b), 1);
      if (chart.children.length !== rows.length) {
        chart.innerHTML = '';
        const every = rows.length > 15 ? 5 : rows.length > 10 ? 2 : 1;
        rows.forEach((row, i) => {
          const bar = document.createElement('div');
          bar.className = 'calc__bar';
          bar.innerHTML = '<i class="calc__seg calc__seg--b"></i><i class="calc__seg calc__seg--a"></i>' + ((i + 1) % every === 0 || i === 0 ? `<b>${row.y}</b>` : '');
          chart.append(bar);
        });
      }
      const period = periodOf(m);
      const unit = ui(period === 1 ? 'calc.month' : period === 3 ? 'calc.quarter' : 'calc.year');
      const axis = $('.calc__axis', calc);
      if (axis) axis.textContent = unit;
      const title = $('[data-chart-title]', calc);
      if (title) title.textContent = ui(mode === 'emi' ? 'calc.chartEmi' : mode === 'monthly' ? 'calc.chartIncome' : 'calc.chartGrow');
      Array.from(chart.children).forEach((bar, i) => {
        const row = rows[i];
        const el = bar as HTMLElement;
        el.dataset.barTip = (mode === 'emi' ? ui('calc.tipEmi') : mode === 'monthly' ? ui('calc.tipIncome') : ui('calc.tipGrow'))
          .replace('{p}', `${unit} ${row.y}`)
          .replace('{a}', rupees(row.a))
          .replace('{b}', rupees(row.b))
          .replace('{t}', rupees(row.a + row.b));
        const scale = seen ? 1 : 0;
        el.style.setProperty('--h1', `${((row.a / max) * 100 * scale).toFixed(2)}%`);
        el.style.setProperty('--h2', `${((row.b / max) * 100 * scale).toFixed(2)}%`);
      });
    };

    const update = () => {
      const a = Number(inputs.amount.value);
      const r = Number(inputs.rate.value);
      const m = Number(inputs.months.value);
      keys.forEach((k) => {
        fill(inputs[k]);
        if (document.activeElement !== boxes[k]) boxes[k].value = boxText(k, Number(inputs[k].value));
      });
      const hint = $('[data-out="months"]', calc);
      if (hint) hint.textContent = tenure(m);
      inputs.amount.setAttribute('aria-valuetext', rupees(a));
      inputs.rate.setAttribute('aria-valuetext', `${r.toFixed(2)} %`);
      inputs.months.setAttribute('aria-valuetext', tenure(m));
      const { result, b1, b2 } = compute(mode, a, r, m);
      setRupees($('[data-result]', calc)!, result);
      setRupees($('[data-b1]', calc)!, b1);
      setRupees($('[data-b2]', calc)!, b2);
      const pct = b1 + b2 > 0 ? (b2 / (b1 + b2)) * 100 : 0;
      $('[data-donut]', calc)!.style.setProperty('--pct', pct.toFixed(1));
      const share = $('[data-share]', calc);
      if (share) share.textContent = `${Math.round(pct)}%`;
      const per = $('[data-per]', calc);
      if (per) per.textContent = mode === 'emi' || mode === 'monthly' ? ui('calc.perMonth') : '';
      drawChart(a, r, m);
    };

    // Typing in a box moves its slider; the value is kept within the slider's range and step.
    const commit = (k: Key) => {
      const el = inputs[k];
      const raw = Number(boxes[k].value.replace(/[^0-9.]/g, ''));
      if (!Number.isFinite(raw) || boxes[k].value.trim() === '') {
        boxes[k].value = boxText(k, Number(el.value));
        return;
      }
      const min = Number(el.min);
      const max = Number(el.max);
      const step = Number(el.step) || 1;
      const snapped = Math.min(max, Math.max(min, Math.round((raw - min) / step) * step + min));
      el.value = String(Number(snapped.toFixed(2)));
      boxes[k].value = boxText(k, Number(el.value));
      update();
    };
    keys.forEach((k) => {
      boxes[k].addEventListener('focus', () => {
        boxes[k].value = k === 'rate' ? String(Number(inputs[k].value)) : String(inputs[k].value);
        boxes[k].select();
      });
      boxes[k].addEventListener('blur', () => commit(k));
      boxes[k].addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          commit(k);
          boxes[k].blur();
        }
      });
      inputs[k].addEventListener('input', update);
    });

    // Chart tooltip (pointer and touch).
    const showTip = (bar: HTMLElement | null) => {
      if (!tip) return;
      $$('.calc__bar.is-hot', calc).forEach((b) => b.classList.remove('is-hot'));
      if (!bar?.dataset.barTip) {
        tip.hidden = true;
        return;
      }
      bar.classList.add('is-hot');
      tip.textContent = bar.dataset.barTip;
      tip.hidden = false;
    };
    chart?.addEventListener('pointerover', (e) => showTip((e.target as HTMLElement).closest<HTMLElement>('.calc__bar')));
    chart?.addEventListener('pointerleave', () => showTip(null));

    const labels: Record<Mode, [string, string, string, string, string]> = {
      fd: [ui('calc.maturity'), ui('calc.invested'), ui('calc.interest'), ui('calc.ctaFd'), '/apply-for-deposits/'],
      rd: [ui('calc.maturity'), ui('calc.invested'), ui('calc.interest'), ui('calc.ctaRd'), '/apply-for-deposits/'],
      monthly: [ui('calc.monthlyIncome'), ui('calc.deposit'), ui('calc.totalInterest'), ui('calc.ctaMonthly'), '/apply-for-deposits/'],
      emi: [ui('calc.emiLabel'), ui('calc.principal'), ui('calc.totalInterest'), ui('calc.ctaEmi'), '/apply-loan/'],
    };
    const moveInk = () => {
      const active = tabs.find((t) => t.getAttribute('aria-selected') === 'true');
      if (!active || !ink) return;
      ink.style.setProperty('--ink-x', `${active.offsetLeft}px`);
      ink.style.setProperty('--ink-w', `${active.offsetWidth}px`);
    };
    const setMode = (next: Mode, values?: { amount: number; rate: number; months: number }) => {
      mode = next;
      calc.dataset.mode = next;
      const c = config[next];
      keys.forEach((k) => {
        const [min, max, step, def] = c[k];
        Object.assign(inputs[k], { min: String(min), max: String(max), step: String(step) });
        inputs[k].value = String(values ? values[k] : def);
        const lo = $(`[data-min="${k}"]`, calc);
        const hi = $(`[data-max="${k}"]`, calc);
        if (lo) lo.textContent = k === 'amount' ? short(min) : k === 'rate' ? `${min}%` : tenure(min);
        if (hi) hi.textContent = k === 'amount' ? short(max) : k === 'rate' ? `${max}%` : tenure(max);
      });
      const amountLabel = $('[data-label="amount"]', calc);
      if (amountLabel) amountLabel.textContent = c.amountLabel;
      boxes.amount.setAttribute('aria-label', c.amountLabel);
      const [res, b1, b2, ctaText, ctaHref] = labels[next];
      $('[data-result-label]', calc)!.textContent = res;
      $('[data-b1-label]', calc)!.textContent = b1;
      $('[data-b2-label]', calc)!.textContent = b2;
      if (cta) {
        cta.href = localePath(ctaHref, pageLang());
        cta.firstChild!.textContent = `${ctaText} `;
      }
      tabs.forEach((t) => {
        const on = t.dataset.calcTab === next;
        t.setAttribute('aria-selected', String(on));
        t.tabIndex = on ? 0 : -1;
      });
      if (chart) chart.innerHTML = '';
      moveInk();
      update();
    };
    tabs.forEach((t, i) => {
      t.addEventListener('click', () => setMode(t.dataset.calcTab as Mode));
      // Arrow keys move between tabs (WAI-ARIA tabs pattern).
      t.addEventListener('keydown', (e) => {
        const dir = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
        if (!dir) return;
        e.preventDefault();
        const next = tabs[(i + dir + tabs.length) % tabs.length];
        next.focus();
        setMode(next.dataset.calcTab as Mode);
      });
    });
    // Other parts of a page can set the calculator, e.g. a loan's rate: dispatch 'calc:set' with { amount, ratePct, months }.
    // (Not "rate": the release check reads "{rate:…}" in a page as an unfilled rate placeholder.)
    calc.addEventListener('calc:set', (e) => {
      const d = (e as CustomEvent<{ amount?: number; ratePct?: number; months?: number }>).detail;
      const v: Partial<Record<Key, number>> = { amount: d.amount, rate: d.ratePct, months: d.months };
      keys.forEach((k) => {
        if (v[k] === undefined) return;
        const el = inputs[k];
        el.value = String(Math.min(Number(el.max), Math.max(Number(el.min), v[k]!)));
      });
      update();
    });
    const ro = new ResizeObserver(moveInk);
    ro.observe(calc);
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        seen = true;
        io.disconnect();
        requestAnimationFrame(() => update());
      },
      { threshold: 0.25 },
    );
    if (reduceMotion) seen = true;
    else io.observe(calc);
    onCleanup(() => { ro.disconnect(); io.disconnect(); });
    setMode(mode, defaults);
  });
}

/* ---------- Filters (deposits) and branch search — state kept in the URL ---------- */
function setParam(key: string, value: string | null) {
  const url = new URL(location.href);
  if (value) url.searchParams.set(key, value);
  else url.searchParams.delete(key);
  history.replaceState(history.state, '', url);
}

function animateIn(el: HTMLElement, i: number) {
  el.getAnimations().forEach((a) => a.cancel());
  if (reduceMotion) return;
  el.animate([{ opacity: 0, transform: 'translateY(14px) scale(.98)' }, { opacity: 1, transform: 'none' }], {
    duration: 420, delay: Math.min(i, 8) * 40, easing: 'cubic-bezier(.16,1,.3,1)', fill: 'backwards',
  });
}

function initFilters() {
  const params = new URLSearchParams(location.search);
  $$('[data-filter-group]').forEach((group) => {
    const target = $(group.dataset.filterGroup!)!;
    const items = $$('[data-kind]', target);
    const buttons = $$('[data-filter]', group);
    const apply = (f: string, animate: boolean) => {
      buttons.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.filter === f)));
      let n = 0;
      items.forEach((it) => {
        const show = f === 'all' || it.dataset.kind === f;
        it.hidden = !show;
        if (show && animate) animateIn(it, n++);
      });
    };
    buttons.forEach((btn) =>
      btn.addEventListener('click', () => {
        const f = btn.dataset.filter!;
        apply(f, true);
        setParam('type', f === 'all' ? null : f);
      }),
    );
    const initial = params.get('type');
    if (initial && buttons.some((b) => b.dataset.filter === initial)) apply(initial, false);
  });

  const search = $<HTMLInputElement>('[data-branch-search]');
  if (search) {
    const chips = $$('[data-division-filter]');
    const groups = $$('[data-division]');
    const empty = $('[data-branch-empty]');
    const count = $('[data-branch-count]');
    let division = 'all';
    let debounce = 0;
    const apply = () => {
      const q = search.value.trim().toLowerCase();
      let shown = 0;
      groups.forEach((g) => {
        const inDivision = division === 'all' || g.dataset.division === division;
        let visible = 0;
        $$('[data-branch]', g).forEach((b) => {
          const match = inDivision && (!q || (b.dataset.branch ?? '').includes(q));
          b.hidden = !match;
          if (match) visible++;
        });
        g.hidden = visible === 0;
        shown += visible;
      });
      if (empty) empty.hidden = shown !== 0;
      if (count) count.textContent = String(shown);
    };
    search.addEventListener('input', () => {
      apply();
      window.clearTimeout(debounce);
      debounce = window.setTimeout(() => setParam('q', search.value.trim() || null), 300);
    });
    const setDivision = (d: string) => {
      division = d;
      chips.forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.divisionFilter === d)));
      apply();
    };
    chips.forEach((c) =>
      c.addEventListener('click', () => {
        setDivision(c.dataset.divisionFilter!);
        setParam('division', division === 'all' ? null : division);
      }),
    );
    const q = params.get('q');
    const d = params.get('division');
    if (q) search.value = q;
    if (d && chips.some((c) => c.dataset.divisionFilter === d)) setDivision(d);
    else if (q) apply();
    if (q) $('.divisions')?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
  }
}

/* ---------- Lightbox (image grows from its thumbnail) ---------- */
function initLightbox() {
  const dialog = $<HTMLDialogElement>('[data-lightbox]');
  if (!dialog) return;
  const img = $<HTMLImageElement>('[data-lightbox-img]', dialog)!;
  const cap = $('[data-lightbox-caption]', dialog)!;
  let group: HTMLElement[] = [];
  let index = 0;
  const show = (i: number, from?: DOMRect) => {
    index = (i + group.length) % group.length;
    const el = group[index];
    img.src = el.getAttribute('href') ?? el.dataset.src ?? '';
    img.alt = el.dataset.caption ?? '';
    cap.textContent = el.dataset.caption ?? '';
    if (reduceMotion) return;
    img.getAnimations().forEach((a) => a.cancel());
    img.decode().catch(() => {}).then(() => {
      const to = img.getBoundingClientRect();
      if (from && to.width) {
        const s = from.width / to.width;
        const dx = from.left + from.width / 2 - (to.left + to.width / 2);
        const dy = from.top + from.height / 2 - (to.top + to.height / 2);
        img.animate([{ transform: `translate(${dx}px, ${dy}px) scale(${s})`, opacity: 0.5 }, { transform: 'none', opacity: 1 }], { duration: 480, easing: 'cubic-bezier(.16,1,.3,1)' });
      } else {
        img.animate([{ opacity: 0, transform: 'scale(.97)' }, { opacity: 1, transform: 'none' }], { duration: 320, easing: 'cubic-bezier(.16,1,.3,1)' });
      }
    });
  };
  $$('[data-zoom]').forEach((el) =>
    el.addEventListener('click', (e) => {
      e.preventDefault();
      const name = el.dataset.zoom || 'default';
      group = $$(`[data-zoom="${name}"]`);
      dialog.classList.toggle('is-single', group.length < 2);
      dialog.showModal();
      show(group.indexOf(el), $('img', el)?.getBoundingClientRect());
    }),
  );
  if (dialog.dataset.bound) return;
  dialog.dataset.bound = '1';
  $('[data-lightbox-close]', dialog)!.addEventListener('click', () => closeDialog(dialog));
  $('[data-lightbox-prev]', dialog)!.addEventListener('click', () => show(index - 1));
  $('[data-lightbox-next]', dialog)!.addEventListener('click', () => show(index + 1));
  dialog.addEventListener('click', (e) => { if (e.target === dialog) closeDialog(dialog); });
  dialog.addEventListener('cancel', (e) => { e.preventDefault(); closeDialog(dialog); });
  dialog.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') show(index + 1);
    if (e.key === 'ArrowLeft') show(index - 1);
  });
}

/* ---------- Site search (Ctrl/⌘ K or "/") ---------- */
type Entry = { t: string; u: string; g: string; k?: string; a?: string };
let searchIndex: Promise<Entry[]> | null = null;
let searchIndexLang: Lang | null = null;
const loadIndex = (): Promise<Entry[]> => {
  const lang = pageLang();
  if (searchIndexLang !== lang) { searchIndex = null; searchIndexLang = lang; }
  return (searchIndex ??= fetch(lang === 'mr' ? '/mr/search-index.json' : '/search-index.json').then((r) => r.json()).catch(() => { searchIndex = null; return []; }));
};
const norm = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '');
const GROUPS = ['Pages', 'Deposits', 'Loans', 'Services', 'Branches', 'FAQ', 'Stories'];
const groupLabel = (g: string) => ui('search.groups').split('|')[GROUPS.indexOf(g)] ?? g;
const GROUP_ICON: Record<string, string> = {
  Pages: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/>',
  Deposits: '<path d="M19 5c-1.5 0-2.8 1.4-3 2-3.5-1.5-11-.3-11 5 0 1.8 0 3 2 4.5V20h4v-2h3v2h4v-4c1-.5 1.7-1 2-2h2v-4h-2c0-1-.5-1.5-1-2V5z"/>',
  Loans: '<path d="M11 15h2a2 2 0 1 0 0-4h-3c-.6 0-1.1.2-1.4.6L3 17"/><path d="m7 21 1.6-1.4c.3-.4.8-.6 1.4-.6h4c1.1 0 2.1-.4 2.8-1.2l4.6-4.4a2 2 0 0 0-2.75-2.91l-4.2 3.9"/><circle cx="16" cy="9" r="2.9"/>',
  Services: '<rect width="14" height="20" x="5" y="2" rx="2"/><path d="M12 18h.01"/>',
  Branches: '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
  FAQ: '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>',
  Stories: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
};

function score(e: Entry, terms: string[]) {
  const t = norm(e.t);
  const k = norm(e.k ?? '');
  // The English name of a Marathi entry counts almost as much as its title.
  const a = norm(e.a ?? '');
  let s = 0;
  for (const term of terms) {
    const i = t.indexOf(term);
    if (i === 0) s += 12;
    else if (i > 0) s += t[i - 1] === ' ' ? 8 : 5;
    else if (a.startsWith(term)) s += 10;
    else if (k.includes(term)) s += 2;
    else return 0;
  }
  return s;
}

function highlight(text: string, terms: string[]) {
  let html = escapeHtml(text);
  for (const term of terms) {
    if (term.length < 2) continue;
    const re = new RegExp(`(${escapeHtml(term).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    html = html.replace(re, '<mark>$1</mark>');
  }
  return html;
}

function initSearch() {
  const dialog = $<HTMLDialogElement>('[data-search]');
  if (!dialog) return;
  const input = $<HTMLInputElement>('[data-search-input]', dialog)!;
  const list = $('[data-search-results]', dialog)!;
  const quick = $('[data-search-quick]', dialog)!;
  const empty = $('[data-search-empty]', dialog)!;
  const status = $('[data-search-status]', dialog)!;
  let active = -1;
  let options: HTMLElement[] = [];

  const setActive = (i: number) => {
    if (!options.length) return;
    active = (i + options.length) % options.length;
    options.forEach((o, n) => o.setAttribute('aria-selected', String(n === active)));
    input.setAttribute('aria-activedescendant', options[active].id);
    options[active].scrollIntoView({ block: 'nearest' });
  };
  const go = (href: string) => {
    closeDialog(dialog);
    navigate(href);
  };
  const render = async () => {
    const q = norm(input.value.trim());
    const terms = q.split(/\s+/).filter(Boolean);
    if (!terms.length) {
      list.hidden = true;
      empty.hidden = true;
      quick.hidden = false;
      input.setAttribute('aria-expanded', 'false');
      input.removeAttribute('aria-activedescendant');
      options = [];
      return;
    }
    const index = await loadIndex();
    if (norm(input.value.trim()) !== q) return; // a newer query is already rendering
    const hits = index
      .map((e) => ({ e, s: score(e, terms) }))
      .filter((h) => h.s > 0)
      .sort((a, b) => b.s - a.s);
    const html: string[] = [];
    let n = 0;
    for (const g of GROUPS) {
      const inGroup = hits.filter((h) => h.e.g === g).slice(0, 6);
      if (!inGroup.length) continue;
      html.push(`<li role="presentation" class="search__group">${escapeHtml(groupLabel(g))}</li>`);
      for (const { e } of inGroup) {
        const sub = e.g === 'Branches' || e.g === 'Deposits' || e.g === 'Loans' ? escapeHtml((e.k ?? '').slice(0, 90)) : escapeHtml(groupLabel(e.g));
        html.push(
          `<li role="option" id="sr-${n++}" class="search__opt" aria-selected="false" data-href="${escapeHtml(e.u)}">` +
            `<span class="search__opt-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${GROUP_ICON[g]}</svg></span>` +
            `<span class="search__opt-text"><strong>${highlight(e.t, terms)}</strong><small>${sub}</small></span></li>`,
        );
      }
    }
    list.innerHTML = html.join('');
    options = $$('[role="option"]', list);
    quick.hidden = true;
    list.hidden = !options.length;
    empty.hidden = !!options.length;
    input.setAttribute('aria-expanded', String(!!options.length));
    status.textContent = options.length ? ui('search.count').replace('{n}', String(options.length)) : ui('search.none');
    active = -1;
    if (options.length) setActive(0);
    options.forEach((o, i) => {
      o.addEventListener('click', () => go(o.dataset.href!));
      o.addEventListener('mousemove', () => active !== i && setActive(i));
    });
  };

  if (!dialog.dataset.bound) {
    dialog.dataset.bound = '1';
    input.addEventListener('input', render);
    input.addEventListener('keydown', (e) => {
      // A search box's own Esc only clears the text; here Esc closes the search, as the hint says.
      if (e.key === 'Escape') { e.preventDefault(); closeDialog(dialog); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); setActive(active + 1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(active - 1); }
      else if (e.key === 'Enter' && options[active]) { e.preventDefault(); go(options[active].dataset.href!); }
    });
    $('[data-search-close]', dialog)!.addEventListener('click', () => closeDialog(dialog));
    dialog.addEventListener('click', (e) => { if (e.target === dialog) closeDialog(dialog); });
    dialog.addEventListener('cancel', (e) => { e.preventDefault(); closeDialog(dialog); });
  }
  $$('[data-search-open]').forEach((btn) =>
    btn.addEventListener('click', () => {
      setDrawer(false);
      openSearch();
    }),
  );
}

function openSearch() {
  const dialog = $<HTMLDialogElement>('[data-search]');
  if (!dialog || dialog.open) return;
  dialog.showModal();
  const input = $<HTMLInputElement>('[data-search-input]', dialog)!;
  input.select();
  loadIndex();
}
document.addEventListener('keydown', (e) => {
  const typing = (e.target as HTMLElement).closest('input, textarea, select, [contenteditable]');
  if ((e.key === 'k' || e.key === 'K') && (e.ctrlKey || e.metaKey)) { e.preventDefault(); openSearch(); }
  else if (e.key === '/' && !typing) { e.preventDefault(); openSearch(); }
});

/* ---------- Enquiry forms: inline validation, error summary, submit feedback ---------- */
function fieldLabel(el: HTMLElement) {
  const text = el.closest('.field')?.querySelector('label')?.textContent ?? '';
  const label = text.replace('*', '').replace(/\(.*?\)/g, '').trim();
  return (pageLang() === 'en' ? label.toLowerCase() : label) || ui('form.thisField');
}

function errorFor(el: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement) {
  const v = el.validity;
  if (v.valid) return '';
  if (el instanceof HTMLInputElement && el.type === 'checkbox') return ui('form.checkbox');
  if (v.valueMissing) return ui(el instanceof HTMLSelectElement ? 'form.select' : 'form.enter').replace('{field}', fieldLabel(el));
  if (el instanceof HTMLInputElement) {
    if (el.type === 'email') return ui('form.email');
    if (el.type === 'tel') return ui('form.phone');
    if (v.rangeUnderflow) return ui('form.min').replace('{n}', el.name === 'amount' ? rupees(Number(el.min)) : el.min);
    if (v.rangeOverflow) return ui('form.max').replace('{n}', el.max);
  }
  return ui('form.check').replace('{field}', fieldLabel(el));
}

function initForms() {
  const params = new URLSearchParams(location.search);
  $$<HTMLFormElement>('form[data-enquiry]').forEach((form) => {
    form.noValidate = true; // we show our own, more helpful messages
    const ts = $<HTMLInputElement>('[data-ts]', form);
    if (ts) ts.value = String(Date.now());

    // Pre-select a scheme or loan passed in the URL (?scheme=… / ?type=…).
    const preset = params.get('scheme') ?? params.get('type');
    if (preset) {
      $$<HTMLSelectElement>('select', form).forEach((sel) => {
        // Links carry the English name; on Marathi pages only the option's value is English.
        const wanted = preset.toLowerCase();
        const opt = Array.from(sel.options).find((o) => o.value.toLowerCase() === wanted || o.text.toLowerCase() === wanted);
        if (opt) sel.value = opt.value || opt.text;
      });
    }

    const controls = $$<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>('input:not([type=hidden]), select, textarea', form).filter(
      (el) => !el.closest('.hp'),
    );
    // Helper text for phone numbers, linked for screen readers.
    controls.forEach((el) => {
      if (el instanceof HTMLInputElement && el.type === 'tel' && !el.nextElementSibling?.classList.contains('field__hint')) {
        const hint = document.createElement('p');
        hint.className = 'field__hint';
        hint.id = `${el.id}-hint`;
        hint.textContent = ui('form.phoneHint');
        el.after(hint);
        el.setAttribute('aria-describedby', hint.id);
      }
    });

    const show = (el: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement, msg: string) => {
      const host = el.type === 'checkbox' ? el.closest('label')! : el.closest('.field') ?? el.parentElement!;
      const id = `${el.id || el.name}-error`;
      let p = document.getElementById(id);
      if (!msg) {
        p?.remove();
        el.removeAttribute('aria-invalid');
        el.setAttribute('aria-describedby', (el.getAttribute('aria-describedby') ?? '').replace(id, '').trim());
        if (!el.getAttribute('aria-describedby')) el.removeAttribute('aria-describedby');
        return;
      }
      if (!p) {
        p = document.createElement('p');
        p.className = 'field__error';
        p.id = id;
        // Checkbox errors sit below their label; other errors sit inside the field, under the input.
        if (el.type === 'checkbox') host.after(p);
        else host.appendChild(p);
      }
      p.textContent = msg;
      el.setAttribute('aria-invalid', 'true');
      const ids = new Set((el.getAttribute('aria-describedby') ?? '').split(' ').filter(Boolean));
      ids.add(id);
      el.setAttribute('aria-describedby', [...ids].join(' '));
    };

    controls.forEach((el) => {
      // Validate when the user leaves a field they have touched; clear errors as soon as they are fixed.
      el.addEventListener('blur', () => { if (el.value || el.getAttribute('aria-invalid')) show(el, errorFor(el)); });
      el.addEventListener(el.type === 'checkbox' || el instanceof HTMLSelectElement ? 'change' : 'input', () => {
        if (el.getAttribute('aria-invalid')) show(el, errorFor(el));
      });
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      $('.error-summary', form)?.remove();
      const invalid = controls.filter((el) => {
        const msg = errorFor(el);
        show(el, msg);
        return !!msg;
      });
      if (invalid.length) {
        const box = document.createElement('div');
        box.className = 'error-summary';
        box.setAttribute('role', 'alert');
        box.tabIndex = -1;
        box.innerHTML = `<h3>${escapeHtml(invalid.length === 1 ? ui('form.problems1') : ui('form.problemsN').replace('{n}', String(invalid.length)))}</h3><ul>${invalid
          .map((el) => `<li><a href="#${el.id}">${escapeHtml(errorFor(el))}</a></li>`)
          .join('')}</ul>`;
        box.querySelectorAll('a').forEach((a) =>
          a.addEventListener('click', (ev) => {
            ev.preventDefault();
            const target = document.getElementById(a.getAttribute('href')!.slice(1));
            target?.focus();
          }),
        );
        form.prepend(box);
        box.focus();
        return;
      }

      const btn = $<HTMLButtonElement>('[data-submit]', form)!;
      const status = $('[data-status]', form)!;
      status.textContent = '';
      btn.classList.add('is-loading');
      btn.disabled = true;
      btn.setAttribute('aria-busy', 'true');
      const data = new FormData(form);
      if (!form.getAttribute('action')) {
        // Preview builds have no form endpoint: nothing is sent.
        status.textContent = ui('form.preview');
        btn.classList.remove('is-loading');
        btn.disabled = false;
        btn.removeAttribute('aria-busy');
        return;
      }
      // One key per filled-in form: a retry after a network error cannot create a duplicate enquiry.
      form.dataset.idempotencyKey ??= crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      try {
        const res = await fetch(form.action, {
          method: 'POST',
          body: data,
          headers: { Accept: 'application/json', 'Idempotency-Key': form.dataset.idempotencyKey },
        });
        const json = await res.json().catch(() => ({}));
        const reference: string | undefined = json?.data?.reference;
        if (!res.ok || !(reference || json.ok)) throw new Error(json?.error?.message || json.error || 'Request failed');
        const card = form.closest('[data-form-card]')!;
        form.hidden = true;
        const ok = $<HTMLElement>('[data-success]', card);
        if (ok) {
          const ref = $<HTMLElement>('[data-reference]', ok);
          if (ref && reference) {
            $('strong', ref)!.textContent = reference;
            ref.hidden = false;
          }
          ok.hidden = false;
          ok.tabIndex = -1;
          ok.focus();
        }
      } catch {
        const lines = Array.from(data.entries())
          .filter(([k, v]) => !['website', 'ts', 'consent'].includes(k) && String(v).trim())
          .map(([k, v]) => `${k.replace(/_/g, ' ')}: ${v}`);
        const mail = `mailto:emailus@lokmangal.co.in?subject=${encodeURIComponent('Website enquiry')}&body=${encodeURIComponent(lines.join('\n'))}`;
        status.innerHTML = escapeHtml(ui('form.failed'))
          .replace('{email}', `<a href="${mail}">${escapeHtml(ui('form.failEmail'))}</a>`)
          .replace('{phone}', '<a href="tel:+919923203322">+91 99232 03322</a>');
      } finally {
        btn.classList.remove('is-loading');
        btn.disabled = false;
        btn.removeAttribute('aria-busy');
      }
    });
  });
}

/* ---------- Misc ---------- */
function initMisc() {
  $('[data-to-top]')?.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
    ($('#main') as HTMLElement | null)?.focus({ preventScroll: true });
  });
  // Open a loan card when arriving via /loans/#slug.
  if (location.hash) {
    const target = document.getElementById(decodeURIComponent(location.hash.slice(1)));
    if (target instanceof HTMLDetailsElement) target.open = true;
  }
  $$('[data-share]').forEach((btn) =>
    btn.addEventListener('click', async () => {
      const url = location.href;
      try {
        if (navigator.share) await navigator.share({ title: document.title, url });
        else {
          await navigator.clipboard.writeText(url);
          btn.dataset.copied = 'true';
          setTimeout(() => delete btn.dataset.copied, 2000);
        }
      } catch { /* dismissed */ }
    }),
  );
}

let navigatedClientSide = false;
function init() {
  cleanups.forEach((fn) => fn());
  cleanups = [];
  document.documentElement.classList.add('js');
  lastY = window.scrollY;
  setDrawer(false);
  initReveal();
  initCounters();
  initNav();
  initHero();
  initMagnetic();
  initCalculators();
  initFilters();
  initLightbox();
  initSearch();
  initForms();
  initMisc();
  onScroll();
  // After a client-side page change, move focus to the new page's content for keyboard & screen-reader users.
  if (navigatedClientSide && !location.hash) ($('#main') as HTMLElement | null)?.focus({ preventScroll: true });
}

document.addEventListener('astro:page-load', init);
document.addEventListener('astro:after-swap', () => {
  navigatedClientSide = true;
  document.documentElement.classList.add('js');
});
