(() => {
  const views = [...document.querySelectorAll('.slide')];
  const review = document.querySelector('.review');
  const stage = document.getElementById('stage');
  const announce = document.getElementById('announce');
  let current = -1;
  let finger = null;

  function fitArtboard() {
    const {width, height} = review.getBoundingClientRect();
    const scale = Math.min(width / stage.offsetWidth, height / stage.offsetHeight, 1);
    review.style.setProperty('--deck-scale', scale);
  }

  new ResizeObserver(fitArtboard).observe(review);
  fitArtboard();

  function show(index, updateHash) {
    const wasPulse = views[current]?.id === 'pulse';
    current = Math.max(0, Math.min(views.length - 1, index));
    const active = views[current];
    const isPulse = active.id === 'pulse';
    if (wasPulse && !isPulse) window.WCEPulse.reset();
    for (const slide of views) slide.hidden = slide !== active;
    if (isPulse && !wasPulse) window.WCEPulse.enter();
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
    if (event.key === ' ' && views[current].id === 'pulse') {
      event.preventDefault();
      if (!event.repeat) window.WCEPulse.togglePlayback();
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

  review.addEventListener('touchstart', event => {
    finger = event.touches.length === 1 ? event.touches[0] : null;
  }, {passive: true});
  review.addEventListener('touchend', event => {
    if (!finger) return;
    const dx = event.changedTouches[0].clientX - finger.clientX;
    const dy = event.changedTouches[0].clientY - finger.clientY;
    finger = null;
    if (Math.abs(dx) > 58 && Math.abs(dx) > Math.abs(dy) * 1.5) show(current + (dx > 0 ? -1 : 1), true);
  }, {passive: true});
  review.addEventListener('touchcancel', () => { finger = null; });

  syncHash();
})();
