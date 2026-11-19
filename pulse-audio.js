window.createWCEPulseAudio = media => {
  const fileSource = media.src;
  const waveSource = window.WCEPulseScore && 'data:audio/wav;base64,' + window.WCEPulseScore;
  media.volume = 1;

  let context;
  let score;
  let gain;
  let source;
  let startedAt = 0;
  let offset = 0;
  let muted = false;
  let output = 'media';
  let generation = 0;

  const time = () => {
    if (output === 'media') return media.currentTime;
    return source ? Math.max(0, offset + context.currentTime - startedAt) % source.buffer.duration : offset;
  };

  async function prepareScore() {
    const Audio = window.AudioContext || window.webkitAudioContext;
    if (!Audio || !window.WCEPulseScore) throw new Error('Embedded score unavailable');
    if (!context) {
      context = new Audio();
      gain = context.createGain();
      gain.gain.value = muted ? 0 : 1;
      gain.connect(context.destination);
      const wave = Uint8Array.from(atob(window.WCEPulseScore), character => character.charCodeAt(0));
      score = context.decodeAudioData(wave.buffer);
    }

    // A suspended embedded view can leave resume pending indefinitely.
    const resume = context.resume();
    let timeout;
    try {
      const buffer = await Promise.race([
        Promise.all([resume, score]).then(([, decoded]) => decoded),
        new Promise((_, reject) => {
          timeout = setTimeout(() => reject(new Error('Audio context is suspended')), 1100);
        })
      ]);
      if (context.state !== 'running') throw new Error('Audio context is suspended');
      return buffer;
    } finally {
      clearTimeout(timeout);
    }
  }

  async function playMedia(from, delay) {
    media.muted = muted;
    media.volume = 1;
    media.currentTime = from;
    let timeout;
    try {
      await Promise.race([
        media.play(),
        new Promise((_, reject) => {
          timeout = setTimeout(() => reject(new Error('The media player did not start')), delay);
        })
      ]);
    } finally {
      clearTimeout(timeout);
    }
  }

  return {
    get time() { return time(); },
    get output() { return output; },
    get muted() { return muted; },
    async play(from, automatic) {
      const request = ++generation;
      if (output === 'media') {
        try {
          // Ask the browser to start sound during the actual user gesture.
          await playMedia(from, 1600);
          return;
        } catch (error) {
          if (request !== generation) throw error;
          media.pause();
          if (automatic) throw error;
          if (error.name !== 'NotAllowedError' && waveSource && media.src === fileSource) {
            media.src = waveSource;
            try {
              await playMedia(from, 1600);
              return;
            } catch (fallbackError) {
              if (request !== generation) throw fallbackError;
              media.pause();
            }
          }
        }
      }

      const buffer = await prepareScore();
      if (request !== generation) return;
      output = 'web-audio';
      offset = from;
      const node = context.createBufferSource();
      node.buffer = buffer;
      node.loop = true;
      node.connect(gain);
      node.addEventListener('ended', () => node.disconnect(), {once: true});
      source = node;
      startedAt = context.currentTime + .015;
      node.start(startedAt, offset);
    },
    pause() {
      generation += 1;
      media.pause();
      if (source) {
        offset = Math.max(0, time());
        const node = source;
        source = null;
        node.stop();
      }
    },
    reset() {
      this.pause();
      offset = 0;
      if (media.currentTime > 0) media.currentTime = 0;
    },
    setMuted(value) {
      muted = value;
      media.muted = value;
      if (gain) gain.gain.setTargetAtTime(value ? 0 : 1, context.currentTime, .012);
    }
  };
};
