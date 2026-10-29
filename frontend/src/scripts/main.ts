// Site-wide interactions. Runs once per full load; `init` re-runs after every
// client-side navigation (Astro view transitions fire `astro:page-load`).
import { navigate } from 'astro:transitions/client';

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const finePointer = window.matchMedia('(pointer: fine)').matches;
const $ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector<T>(sel);
const $$ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => Array.from(root.querySelectorAll<T>(sel));
const inr = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });
const rupees = (n: number) => `₹${inr.format(Math.round(n))}`;
const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

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
    if (reduceMotion) {
      el.textContent = `${prefix}${inr.format(target)}${suffix}`;
      return;
    }
    const duration = 1600;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 4);
      el.textContent = `${prefix}${inr.format(Math.round(target * eased))}${suffix}`;
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
type Mode = 'fd' | 'rd' | 'monthly' | 'emi';
type Range = [number, number, number, number];
type CalcConfig = Record<Mode, { label: string; amountLabel: string; amount: Range; rate: Range; months: Range }>;

function compute(mode: Mode, amount: number, rate: number, months: number) {
  if (mode === 'fd') {
    // Simple interest up to a year, half-yearly compounding beyond (matches published maturity values).
    const maturity = months <= 12 ? amount * (1 + (rate * months) / 1200) : amount * Math.pow(1 + rate / 200, months / 6);
    return { result: maturity, b1: amount, b2: maturity - amount };
  }
  if (mode === 'rd') {
    let maturity = 0;
    for (let k = 1; k <= months; k++) maturity += amount * Math.pow(1 + rate / 200, k / 6);
    const invested = amount * months;
    return { result: maturity, b1: invested, b2: maturity - invested };
  }
  if (mode === 'monthly') {
    const payout = (amount * rate) / 1200;
    return { result: payout, b1: amount, b2: payout * months };
  }
  const r = rate / 1200;
  const emi = r === 0 ? amount / months : (amount * r * Math.pow(1 + r, months)) / (Math.pow(1 + r, months) - 1);
  return { result: emi, b1: amount, b2: emi * months - amount };
}

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
  $$('[data-calc]').forEach((calc) => {
    const config = JSON.parse(calc.dataset.config!) as CalcConfig;
    const defaults = JSON.parse(calc.dataset.defaults!) as { mode: Mode; amount: number; rate: number; months: number };
    const inputs = {
      amount: $<HTMLInputElement>('[data-input="amount"]', calc)!,
      rate: $<HTMLInputElement>('[data-input="rate"]', calc)!,
      months: $<HTMLInputElement>('[data-input="months"]', calc)!,
    };
    const out = (k: string) => $(`[data-out="${k}"]`, calc)!;
    const tabs = $$('[data-calc-tab]', calc);
    const ink = $('.calc__tab-ink', calc);
    const cta = $<HTMLAnchorElement>('[data-calc-cta]', calc);
    let mode = defaults.mode;

    const fill = (el: HTMLInputElement) => {
      const p = ((Number(el.value) - Number(el.min)) / (Number(el.max) - Number(el.min))) * 100;
      el.style.setProperty('--p', `${p}%`);
    };
    const tenure = (m: number) => {
      const y = Math.floor(m / 12);
      const mo = m % 12;
      return [y ? `${y} yr` : '', mo ? `${mo} mo` : ''].filter(Boolean).join(' ') || '0 mo';
    };
    const update = () => {
      const a = Number(inputs.amount.value);
      const r = Number(inputs.rate.value);
      const m = Number(inputs.months.value);
      Object.values(inputs).forEach(fill);
      out('amount').textContent = rupees(a);
      out('rate').textContent = `${r.toFixed(2)}%`;
      out('months').textContent = tenure(m);
      inputs.amount.setAttribute('aria-valuetext', rupees(a));
      inputs.rate.setAttribute('aria-valuetext', `${r.toFixed(2)} percent`);
      inputs.months.setAttribute('aria-valuetext', tenure(m));
      const { result, b1, b2 } = compute(mode, a, r, m);
      setRupees($('[data-result]', calc)!, result);
      setRupees($('[data-b1]', calc)!, b1);
      setRupees($('[data-b2]', calc)!, b2);
      const pct = b1 + b2 > 0 ? (b2 / (b1 + b2)) * 100 : 0;
      $('[data-donut]', calc)!.style.setProperty('--pct', pct.toFixed(1));
    };
    const labels: Record<Mode, [string, string, string, string, string]> = {
      fd: ['Maturity value', 'Total invested', 'Interest earned', 'Book a fixed deposit', '/apply-for-deposits/'],
      rd: ['Maturity value', 'Total invested', 'Interest earned', 'Start a recurring deposit', '/apply-for-deposits/'],
      monthly: ['Monthly income', 'Deposit (returned)', 'Total interest', 'Open a monthly income plan', '/apply-for-deposits/'],
      emi: ['Monthly EMI', 'Principal', 'Total interest', 'Apply for a loan', '/apply-loan/'],
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
      (['amount', 'rate', 'months'] as const).forEach((k) => {
        const [min, max, step, def] = c[k];
        Object.assign(inputs[k], { min: String(min), max: String(max), step: String(step) });
        inputs[k].value = String(values ? values[k] : def);
      });
      $('[data-amount-label]', calc)!.textContent = c.amountLabel;
      const [res, b1, b2, ctaText, ctaHref] = labels[next];
      $('[data-result-label]', calc)!.textContent = res;
      $('[data-b1-label]', calc)!.textContent = b1;
      $('[data-b2-label]', calc)!.textContent = b2;
      if (cta) {
        cta.href = ctaHref;
        cta.firstChild!.textContent = `${ctaText} `;
      }
      tabs.forEach((t) => {
        const on = t.dataset.calcTab === next;
        t.setAttribute('aria-selected', String(on));
        t.tabIndex = on ? 0 : -1;
      });
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
    Object.values(inputs).forEach((el) => el.addEventListener('input', update));
    const ro = new ResizeObserver(moveInk);
    ro.observe(calc);
    onCleanup(() => ro.disconnect());
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
type Entry = { t: string; u: string; g: string; k?: string };
let searchIndex: Promise<Entry[]> | null = null;
const loadIndex = () => (searchIndex ??= fetch('/search-index.json').then((r) => r.json()).catch(() => { searchIndex = null; return []; }));
const norm = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '');
const GROUPS = ['Pages', 'Deposits', 'Loans', 'Services', 'Branches', 'FAQ', 'Stories'];
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
  let s = 0;
  for (const term of terms) {
    const i = t.indexOf(term);
    if (i === 0) s += 12;
    else if (i > 0) s += t[i - 1] === ' ' ? 8 : 5;
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
      html.push(`<li role="presentation" class="search__group">${g}</li>`);
      for (const { e } of inGroup) {
        const sub = e.g === 'Branches' || e.g === 'Deposits' || e.g === 'Loans' ? escapeHtml((e.k ?? '').slice(0, 90)) : e.g;
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
    status.textContent = options.length ? `${options.length} results` : 'No results';
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
      if (e.key === 'ArrowDown') { e.preventDefault(); setActive(active + 1); }
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
  return text.replace('*', '').replace(/\(.*?\)/g, '').trim().toLowerCase() || 'this field';
}

function errorFor(el: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement) {
  const v = el.validity;
  if (v.valid) return '';
  if (el instanceof HTMLInputElement && el.type === 'checkbox') return 'Please tick this box so we can contact you about your enquiry.';
  if (v.valueMissing) return el instanceof HTMLSelectElement ? `Select your ${fieldLabel(el)}.` : `Enter your ${fieldLabel(el)}.`;
  if (el instanceof HTMLInputElement) {
    if (el.type === 'email') return 'Enter a valid email address, like name@example.com.';
    if (el.type === 'tel') return 'Enter a 10-digit mobile number, like 99232 03322.';
    if (v.rangeUnderflow) return `Enter at least ${el.name === 'amount' ? rupees(Number(el.min)) : el.min}.`;
    if (v.rangeOverflow) return `Enter no more than ${el.max}.`;
  }
  return `Check your ${fieldLabel(el)}.`;
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
        const opt = Array.from(sel.options).find((o) => o.text.toLowerCase() === preset.toLowerCase());
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
        hint.textContent = '10-digit mobile number';
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
        box.innerHTML = `<h3>There ${invalid.length === 1 ? 'is 1 problem' : `are ${invalid.length} problems`} with your details</h3><ul>${invalid
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
      try {
        const res = await fetch(form.action, { method: 'POST', body: data, headers: { Accept: 'application/json' } });
        const json = await res.json().catch(() => ({}));
        if (!res.ok || !json.ok) throw new Error(json.error || 'Request failed');
        const card = form.closest('[data-form-card]')!;
        form.hidden = true;
        const ok = $<HTMLElement>('[data-success]', card);
        if (ok) {
          ok.hidden = false;
          ok.tabIndex = -1;
          ok.focus();
        }
      } catch {
        const lines = Array.from(data.entries())
          .filter(([k, v]) => !['website', 'ts', 'consent'].includes(k) && String(v).trim())
          .map(([k, v]) => `${k.replace(/_/g, ' ')}: ${v}`);
        const mail = `mailto:emailus@lokmangal.co.in?subject=${encodeURIComponent('Website enquiry')}&body=${encodeURIComponent(lines.join('\n'))}`;
        status.innerHTML = `We couldn't send your request right now. Please <a href="${mail}">email it to us</a> or call <a href="tel:+919923203322">+91 99232 03322</a>.`;
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
