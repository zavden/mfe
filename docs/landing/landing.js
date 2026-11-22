/* The project's page (docs/index.html): what it does beside the documentation's site.js, which
 * gives it the theme and mounts its players, widgets and Python tabs. One classic script, nothing
 * from the network. */
(function () {
  'use strict';

  function start() {
    const docs = window.MFEDocs;

    // The theme button of the header: the other theme, remembered as the documentation remembers
    // it (the two share the choice).
    const toggle = document.querySelector('[data-lp-theme]');
    if (toggle && docs) {
      const label = () => `Switch to the ${docs.theme() === 'dark' ? 'light' : 'dark'} theme`;
      const sync = () => {
        toggle.setAttribute('aria-label', label());
        toggle.title = label();
      };
      toggle.addEventListener('click', () =>
        docs.setTheme(docs.theme() === 'dark' ? 'light' : 'dark'),
      );
      docs.onTheme(sync);
      sync();
    }

    // The exported page of section 06 follows the theme of this one (one of its options).
    const deck = document.querySelector('.lp-deck .mfe-deck');
    if (deck && docs) {
      const follow = (theme) => deck.setAttribute('data-theme', theme);
      follow(docs.theme());
      docs.onTheme(follow);
    }

    // The Python of section 05 opens at its scene, under the helper that comes first in the
    // file: each tab once, when it is first shown, so that a reader's own scroll stays.
    const shown = new WeakSet();
    const toScene = () => {
      for (const pre of document.querySelectorAll('.lp-code .mfe-code pre')) {
        if (shown.has(pre) || pre.offsetParent === null) continue;
        shown.add(pre);
        const lines = pre.textContent.split('\n');
        const at = lines.findIndex((line) => /^class \w+\(/.test(line));
        if (at > 0) {
          const lineHeight = parseFloat(getComputedStyle(pre).lineHeight) || 22;
          pre.scrollTop = Math.max(0, (at - 1) * lineHeight);
        }
      }
    };
    requestAnimationFrame(toScene);
    document.addEventListener('mfe-docs:python-tab', () => requestAnimationFrame(toScene));

    // The header's links mark the section on screen.
    const links = Array.from(document.querySelectorAll('.lp-nav a[href^="#"]'));
    const sections = links
      .map((link) => document.getElementById(link.getAttribute('href').slice(1)))
      .filter(Boolean);
    if (sections.length && 'IntersectionObserver' in window) {
      const visible = new Set();
      const mark = () => {
        const current = sections.find((section) => visible.has(section));
        for (const link of links) {
          const on = current && link.getAttribute('href') === `#${current.id}`;
          if (on) link.setAttribute('aria-current', 'true');
          else link.removeAttribute('aria-current');
        }
      };
      const observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (entry.isIntersecting) visible.add(entry.target);
            else visible.delete(entry.target);
          }
          mark();
        },
        { rootMargin: '-45% 0px -50% 0px' },
      );
      sections.forEach((section) => observer.observe(section));
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
