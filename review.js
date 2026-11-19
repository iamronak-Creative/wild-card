(() => {
  const views = [...document.querySelectorAll('.slide')];
  const review = document.querySelector('.review');
  const stage = document.getElementById('stage');
  const announce = document.getElementById('announce');
  const touchPresentation = matchMedia('(pointer: coarse) and (max-width: 950px)');
  let current = -1;
  let scrollFrame = 0;

  function fitArtboard() {
    const {width, height} = review.getBoundingClientRect();
    const scale = Math.min(width / stage.offsetWidth, height / stage.offsetHeight, 1);
    review.style.setProperty('--deck-scale', scale);
    if (scale > 0) review.style.setProperty('--audio-button-size', Math.max(64, 36 / scale) + 'px');
  }

  new ResizeObserver(fitArtboard).observe(review);
  fitArtboard();

  function select(index) {
    const previous = views[current];
    const wasPulse = previous?.id === 'pulse';
    current = Math.max(0, Math.min(views.length - 1, index));
    const active = views[current];
    previous?.removeAttribute('aria-current');
    active.setAttribute('aria-current', 'true');
    const isPulse = active.id === 'pulse';
    if (wasPulse && !isPulse) window.WCEPulse.leave(touchPresentation.matches);
    if (isPulse && !wasPulse) window.WCEPulse.enter();
    return active;
  }

  function show(index, updateHash) {
    const active = select(index);
    if (touchPresentation.matches) review.scrollTop = active.offsetTop;
    else for (const slide of views) slide.hidden = slide !== active;
    announce.textContent = active.querySelector('h1').textContent.replace(/\s+/g, ' ') + '. Slide ' + (current + 1) + ' of ' + views.length + '.';
    if (updateHash) history.replaceState(null, '', '#' + active.id);
  }

  function syncHash() {
    const previousLinks = {'#mark': '#pulse', '#threshold': '#light', '#private': '#invitation', '#screen': '#neon'};
    const hash = location.hash;
    const key = previousLinks[hash] || hash;
    show(views.findIndex(view => '#' + view.id === key), key !== hash);
  }

  window.addEventListener('hashchange', syncHash);

  function configureNavigation() {
    const scrolling = touchPresentation.matches;
    review.toggleAttribute('data-mobile-scroll', scrolling);
    if (scrolling) {
      for (const slide of views) slide.hidden = false;
    } else {
      review.scrollTop = 0;
      for (const [index, slide] of views.entries()) slide.hidden = index !== Math.max(0, current);
    }
    fitArtboard();
  }

  touchPresentation.addEventListener('change', () => {
    configureNavigation();
    show(current, false);
  });

  review.addEventListener('scroll', () => {
    if (!touchPresentation.matches || scrollFrame) return;
    scrollFrame = requestAnimationFrame(() => {
      scrollFrame = 0;
      if (!touchPresentation.matches) return;
      const midpoint = review.scrollTop + review.clientHeight / 2;
      const index = views.findIndex(slide => slide.offsetTop + slide.offsetHeight > midpoint);
      if (index >= 0 && index !== current) select(index);
    });
  }, {passive: true});

  async function toggleFullscreen() {
    if (!document.fullscreenEnabled) return;
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {
      announce.textContent = 'Fullscreen is unavailable in this window.';
    }
  }

  document.addEventListener('keydown', event => {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    if (event.key.toLowerCase() === 'f') {
      event.preventDefault();
      if (!event.repeat) toggleFullscreen();
      return;
    }
    if (event.key.toLowerCase() === 'm' && views[current].id === 'pulse') {
      event.preventDefault();
      window.WCEPulse.toggleMute();
      return;
    }
    const destination = {
      ArrowLeft: current - 1,
      ArrowRight: current + 1,
      PageUp: current - 1,
      PageDown: current + 1,
      Home: 0,
      End: views.length - 1
    }[event.key];
    if (destination === undefined) return;
    event.preventDefault();
    show(destination, true);
  });

  review.addEventListener('touchend', event => {
    if (touchPresentation.matches && !event.target.closest('#pulse-volume')) {
      window.WCEPulse.startFromNavigation();
    }
  }, {passive: true});

  history.scrollRestoration = 'manual';
  configureNavigation();
  const navigation = performance.getEntriesByType('navigation')[0];
  if (navigation?.type === 'reload') show(0, true);
  else syncHash();
})();
