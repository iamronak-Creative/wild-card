(() => {
  const {points, width} = window.WCEGeometry;
  const cues = window.WCEPulseCues;
  const loop = window.WCEPulseLoop;
  const scene = document.getElementById('pulse-art');
  const volume = document.getElementById('pulse-volume');
  const speakerWaves = volume.querySelector('[data-volume-on]');
  const speakerMute = volume.querySelector('[data-volume-off]');
  const audio = window.createWCEPulseAudio(document.getElementById('pulse-audio'));
  const status = document.getElementById('pulse-status');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const rowStep = 5.52;
  const palettes = [
    ['#ebac52','#f8bd68','#eb974e','#d98670','#d084c7','#b986ff'],
    ['#ae7dff','#bc86ff','#cf93ff','#eb9ed7','#f3a8ac','#ffd194'],
    ['#ffc375','#ffd48d','#e9a150','#e08b6b','#d17cc4','#ba8aff']
  ];
  const clamp = value => Math.min(1, Math.max(0, value));
  const ease = value => {
    const x = clamp(value);
    return x*x*(3 - 2*x);
  };

  const envelopes = [0, 1, 2].map(band => {
    let level = 0;
    return Float32Array.from({length: cues.samples.length / 3}, (_, i) => {
      // A short attack holds the beat. A longer release carries the brightness
      // between hits rather than snapping rows off as the source decays.
      const target = cues.samples[Math.min(i + 1, cues.samples.length / 3 - 1)*3 + band] / 255;
      const response = Math.exp(-1 / (cues.fps * (target > level ? .060 : .172)));
      level = target + (level - target)*response;
      return level;
    });
  });

  const tracks = points.map((raw,index) => {
    const coordinates = raw.split(' ').map(Number);
    const corners = [];
    for (let i = 0; i < coordinates.length; i += 2) corners.push([coordinates[i],coordinates[i+1]]);
    const top = Math.min(...corners.map(([,y]) => y));
    const bottom = Math.max(...corners.map(([,y]) => y));
    const atTop = corners.filter(([,y]) => y === top).map(([x]) => x);
    const left = Math.min(...atTop);
    const right = Math.max(...atTop);
    const lowerLeft = Math.min(...corners.filter(([,y]) => y === bottom).map(([x]) => x));
    const lean = (left-lowerLeft)/(bottom-top);
    const count = [22,18,23][index];
    const upper = top - rowStep*count;
    const projection = lean*rowStep*count;
    return {
      index, top, bottom, count,
      clip: [[left-lean,top+1],[right-lean,top+1],[right+projection,upper],[left+projection,upper]]
        .map(([x,y]) => x + ',' + y).join(' ')
    };
  });

  const clips = tracks.map(({index, clip}) =>
    '<clipPath id="pulse-rise-' + index + '"><polygon points="' + clip + '"/></clipPath>' +
    '<clipPath id="pulse-white-' + index + '"><polygon points="' + points[index] + '"/></clipPath>'
  ).join('');
  const bands = tracks.map(({index,top,count}) => {
    const palette = palettes[index];
    const rows = Array.from({length:count}, (_,slot) => {
      const tone = palette[Math.min(palette.length-1,Math.floor(slot*palette.length/count))];
      const y = top - (slot+1)*rowStep + .57;
      return '<rect y="' + y + '" width="' + (width+69) + '" height="' + (rowStep-1.09) + '" fill="' + tone + '"/>';
    }).join('');
    return '<g data-pulse-bar clip-path="url(#pulse-rise-' + index + ')">' + rows + '</g>';
  }).join('');
  const whiteBands = tracks.map(({index, top, bottom}) => {
    const rowCount = Math.ceil((bottom-top)/rowStep);
    const step = (bottom-top)/rowCount;
    const rows = Array.from({length:rowCount}, (_,slot) =>
      '<rect y="' + (bottom-(slot+1)*step+1.05) + '" width="' + width + '" height="' + (step-1.05) + '"/>'
    ).join('');
    return '<g data-white-bar clip-path="url(#pulse-white-' + index + ')">' + rows + '</g>';
  }).join('');

  const logoWidth = 438;
  const logoLeft = (960 - logoWidth)/2;
  const logoTop = 158;
  const ratio = logoWidth/386;
  scene.innerHTML = '<svg viewBox="0 0 960 540" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
    '<defs>' + clips +
    '<clipPath id="pulse-type"><rect y="182" width="386" height="100"/></clipPath>' +
    '<radialGradient id="pulse-field"><stop stop-color="#71512f"/><stop offset=".5" stop-color="#33223a"/><stop offset="1" stop-color="#100b12" stop-opacity="0"/></radialGradient>' +
    '</defs>' +
    '<ellipse data-glow cx="516" cy="158" rx="444" ry="203" fill="url(#pulse-field)"/>' +
    '<g transform="translate(' + logoLeft + ' ' + logoTop + ') scale(' + ratio + ')">' +
    '<g data-equalizer>' + bands + '<g fill="#fff">' + whiteBands + '</g></g>' +
    '<image data-foreground-mark href="assets/lockup-white.svg" width="386" height="273.32" clip-path="url(#pulse-type)"/>' +
    '</g>' +
    '</svg>';

  const glow = scene.querySelector('[data-glow]');
  const groups = [...scene.querySelectorAll('[data-pulse-bar]')];
  const rows = groups.map(group => [...group.children]);
  let frame = 0;
  let active = false;
  let mode = 'preview';
  let previewOrigin = 0;
  let entryEnergy;
  let latestEnergy;
  let session = 0;
  let autoPending = false;

  function energy(time, band) {
    const values = envelopes[band];
    const position = Math.max(0,time*cues.fps);
    const index = Math.min(values.length - 2, Math.floor(position));
    const frac = clamp(position-index);
    return values[index] + (values[index + 1] - values[index])*frac;
  }

  function loopEnergy(time, band) {
    const seam = .20;
    const blend = ease((time - loop.duration + seam) / seam);
    return energy(loop.offset + time, band)*(1 - blend) + energy(loop.offset, band)*blend;
  }

  function draw(now) {
    const preview = mode !== 'playing';
    const time = reduced.matches ? cues.poster - loop.offset : preview ?
      Math.max(0, (now - previewOrigin)/1000) % loop.duration :
      Math.max(0, audio.time);
    if (mode === 'playing' && time >= .30) entryEnergy = undefined;
    const envelope = [0, 1, 2].map(band => {
      const value = loopEnergy(time, band);
      if (preview || !entryEnergy || reduced.matches) return value;
      const blend = ease(time / .30);
      return entryEnergy[band]*(1 - blend) + value*blend;
    });
    latestEnergy = envelope;
    glow.setAttribute('opacity', .22 + (envelope[0] + envelope[1] + envelope[2])*.16);
    rows.forEach((bar,band) => {
      const signal = clamp(envelope[band]*1.16);
      const level = clamp((signal - .17)/.83)*(bar.length - .5);
      groups[band].dataset.level = level;
      for (const [index,row] of bar.entries()) {
        row.setAttribute('opacity', .96*ease((level - index)/2.4));
      }
    });
    scene.dataset.sampleTime = time.toFixed(3);
    scene.dataset.phase = mode;
    scene.dataset.audioOutput = audio.output;
    scene.dataset.reducedMotion = String(reduced.matches);
  }

  function render(now) {
    draw(now);
    const moving = mode === 'playing' || mode === 'preview' || mode === 'starting';
    if (active && moving && !reduced.matches) frame = requestAnimationFrame(render);
  }

  function syncLabel() {
    scene.setAttribute('aria-label', {
      preview: 'Play Pulse with sound',
      starting: 'Starting Pulse',
      playing: audio.muted ? 'Unmute Pulse' : 'Pulse music playing'
    }[mode]);
    const muted = mode !== 'playing' || audio.muted;
    const volumeLabel = mode === 'playing' ? (muted ? 'Unmute music' : 'Mute music') : 'Enable music';
    volume.setAttribute('aria-label', volumeLabel);
    volume.title = volumeLabel;
    speakerWaves.toggleAttribute('hidden', muted);
    speakerMute.toggleAttribute('hidden', !muted);
  }

  function redraw() {
    cancelAnimationFrame(frame);
    frame = 0;
    render(performance.now());
    syncLabel();
  }

  function clearStatus() {
    status.textContent = '';
    status.classList.add('sr-only');
  }

  async function begin(automatic = false) {
    if (mode === 'starting') return;
    const request = ++session;
    autoPending = automatic;
    entryEnergy = latestEnergy;
    mode = 'starting';
    clearStatus();
    redraw();
    try {
      await audio.play(0, automatic);
      if (request !== session) return;
      mode = 'playing';
      redraw();
    } catch {
      if (request !== session) return;
      mode = 'preview';
      if (!automatic) {
        status.textContent = 'Sound couldn’t start here. Try opening this deck in Chrome.';
        status.classList.remove('sr-only');
      }
      redraw();
    } finally {
      if (request === session) autoPending = false;
    }
  }

  function enablePlayback() {
    if (mode === 'starting' && autoPending) {
      audio.pause();
      mode = 'preview';
    }
    if (mode === 'playing') {
      if (audio.muted) {
        audio.setMuted(false);
        syncLabel();
      }
    } else {
      begin();
    }
  }

  function toggleMute() {
    if (mode !== 'playing') {
      enablePlayback();
      return;
    }
    audio.setMuted(!audio.muted);
    status.textContent = audio.muted ? 'Pulse muted.' : 'Pulse unmuted.';
    syncLabel();
  }

  scene.addEventListener('click', enablePlayback);
  volume.addEventListener('click', toggleMute);
  reduced.addEventListener('change',redraw);
  window.WCEPulse = {
    enter() {
      active = true;
      previewOrigin = performance.now();
      clearStatus();
      redraw();
      if (mode === 'preview') begin(true);
    },
    toggleMute,
    startFromNavigation() {
      if (mode !== 'playing') enablePlayback();
    },
    leave(keepPlaying) {
      active = false;
      if (!keepPlaying) {
        session += 1;
        mode = 'preview';
        entryEnergy = undefined;
        autoPending = false;
        audio.reset();
        audio.setMuted(false);
      }
      clearStatus();
      redraw();
    }
  };
  redraw();
})();
