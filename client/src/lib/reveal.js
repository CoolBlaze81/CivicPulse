// Scroll reveal: cards and rows that start below the fold ease in as they
// scroll into view. Things already on screen keep their entrance animation.
const SEL = [
  '.card', '.panel', '.quick-tile', '.pulse-tile', '.list-item', '.report-item', '.urgent-row', '.queue-card',
  '.kpi', '.stat', '.near-row', '.audit-row', '.menu-row', '.table.stackable tbody tr', '.how-step',
].join(', ');

export function startReveal() {
  if (typeof window === 'undefined' || !('IntersectionObserver' in window)) return;
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;

  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      const el = e.target;
      io.unobserve(el);
      el.classList.add('in-view');
      // Hand the element back to its normal hover and press transitions.
      setTimeout(() => el.classList.remove('reveal', 'in-view'), 900);
    }
  }, { rootMargin: '0px 0px -6% 0px', threshold: 0.06 });

  const consider = (el) => {
    if (el.dataset.reveal) return;
    el.dataset.reveal = '1';
    if (el.parentElement?.closest('.reveal')) return; // the parent already reveals it
    if (el.closest('.drawer, .modal, .picker, .leaflet-container')) return;
    if (el.getBoundingClientRect().top > window.innerHeight * 0.94) {
      el.classList.add('reveal');
      io.observe(el);
    }
  };
  const scan = (root) => {
    if (root.matches?.(SEL)) consider(root);
    root.querySelectorAll?.(SEL).forEach(consider);
  };
  const pending = new Set();
  let frame = 0;
  // Wait a frame so new content has its layout before we measure it.
  const flush = () => { frame = 0; pending.forEach(scan); pending.clear(); };
  new MutationObserver((muts) => {
    for (const m of muts) m.addedNodes.forEach((n) => { if (n.nodeType === 1) pending.add(n); });
    if (pending.size && !frame) frame = requestAnimationFrame(flush);
  }).observe(document.body, { childList: true, subtree: true });
  requestAnimationFrame(() => scan(document.body));
}
