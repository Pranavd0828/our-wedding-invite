/**
 * Interactive Audio Engine - "The Landscape of Us"
 * Synthesizes procedural field recordings (wind/water), generates felt-piano ambient progressions,
 * triggers scroll-velocity paper scrape noises, and handles the ink-drop RSVP submit chime.
 */

class AudioHandler {
  constructor(widgetId) {
    this.widget = document.getElementById(widgetId);
    this.widgetLabel = this.widget.querySelector('.widget-label');
    
    this.ctx = null;
    this.globalGain = null;
    this.delayNode = null;
    
    // Ambient Synths
    this.windNode = null;
    this.waveGain = null;
    this.isMuted = true;
    
    // Generative loop timer
    this.sequenceTimer = null;
    
    // Paper scrape interactive nodes
    this.scrapeNoiseNode = null;
    this.scrapeGain = null;
    this.lastScrollTime = 0;
    this.lastScrollY = 0;
    
    // Felt Piano chord list (Fmaj7, Cmaj, Dm9, Bbmaj7)
    this.chords = [
      [174.61, 220.00, 261.63, 329.63], // F3, A3, C4, E4
      [130.81, 196.00, 261.63, 329.63], // C3, G3, C4, E4
      [146.83, 220.00, 293.66, 349.23], // D3, A3, D4, F4
      [116.54, 174.61, 220.00, 293.66]  // Bb2, F3, A3, D4
    ];
    this.currentChordIndex = 0;
    
    this.init();
  }

  init() {
    this.widget.addEventListener('click', () => this.togglePlayback());
    window.addEventListener('scroll', () => this.handleScrollScrape());
  }

  setupAudioContext() {
    // Create Audio Context (safely inside click handler to satisfy browser autoplay policies)
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AudioContextClass();
    
    // Setup Global Volume Gain Node
    this.globalGain = this.ctx.createGain();
    this.globalGain.gain.setValueAtTime(0, this.ctx.currentTime);
    this.globalGain.connect(this.ctx.destination);
    
    // Setup Global Ambient Delay Node (giving depth/reverb to piano and chime)
    this.delayNode = this.ctx.createDelay(2.0);
    this.delayNode.delayTime.setValueAtTime(0.6, this.ctx.currentTime);
    
    const delayFeedback = this.ctx.createGain();
    delayFeedback.gain.setValueAtTime(0.4, this.ctx.currentTime);
    
    // Cross-feed delay feedback
    this.delayNode.connect(delayFeedback);
    delayFeedback.connect(this.delayNode);
    this.delayNode.connect(this.globalGain);

    // Initialize procedural sound components
    this.buildWindAmbient();
    this.buildWaveAmbient();
    this.setupPaperScrape();
    
    // Start procedural loops
    this.startPianoGenerativeLoop();
  }

  togglePlayback() {
    if (!this.ctx) {
      this.setupAudioContext();
    }
    
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }

    if (this.isMuted) {
      // Unmute: fade in global volume
      this.globalGain.gain.setTargetAtTime(0.35, this.ctx.currentTime, 0.8);
      this.widget.classList.remove('paused');
      this.widgetLabel.textContent = "SOUND: ON";
      this.isMuted = false;
    } else {
      // Mute: fade out global volume
      this.globalGain.gain.setTargetAtTime(0.0, this.ctx.currentTime, 0.3);
      this.widget.classList.add('paused');
      this.widgetLabel.textContent = "SOUND: OFF";
      this.isMuted = true;
    }
  }

  // Create White/Pink Noise Buffer for Wind and Paper scraping
  createNoiseBuffer() {
    const bufferSize = 2 * this.ctx.sampleRate;
    const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    
    // Pink noise approximation
    let b0, b1, b2, b3, b4, b5, b6;
    b0 = b1 = b2 = b3 = b4 = b5 = b6 = 0.0;
    
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.96900 * b2 + white * 0.1538520;
      b3 = 0.86650 * b3 + white * 0.3104856;
      b4 = 0.55000 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.0168980;
      output[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362;
      output[i] *= 0.11; // Normalize scale
      b6 = white * 0.115926;
    }
    return noiseBuffer;
  }

  // Synthesize soft wind blowing through hills
  buildWindAmbient() {
    const windSource = this.ctx.createBufferSource();
    windSource.buffer = this.createNoiseBuffer();
    windSource.loop = true;
    
    // Lowpass filter to block harsh noise peaks
    const windFilter = this.ctx.createBiquadFilter();
    windFilter.type = 'lowpass';
    windFilter.frequency.setValueAtTime(350, this.ctx.currentTime);
    windFilter.Q.setValueAtTime(1.5, this.ctx.currentTime);

    // Wind Volume Gain Node
    const windGain = this.ctx.createGain();
    windGain.gain.setValueAtTime(0.04, this.ctx.currentTime);
    
    // Modulate wind cutoff filter slowly using a LFO (Low-Frequency Oscillator)
    const lfo = this.ctx.createOscillator();
    lfo.frequency.setValueAtTime(0.04, this.ctx.currentTime); // very slow wave
    
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.setValueAtTime(120, this.ctx.currentTime); // sweep range
    
    lfo.connect(lfoGain);
    lfoGain.connect(windFilter.frequency);
    
    // Connections
    windSource.connect(windFilter);
    windFilter.connect(windGain);
    windGain.connect(this.globalGain);
    
    // Start wind
    lfo.start();
    windSource.start();
  }

  // Synthesize soft water waves in distance
  buildWaveAmbient() {
    const waveSource = this.ctx.createBufferSource();
    waveSource.buffer = this.createNoiseBuffer();
    waveSource.loop = true;

    const waveFilter = this.ctx.createBiquadFilter();
    waveFilter.type = 'bandpass';
    waveFilter.frequency.setValueAtTime(150, this.ctx.currentTime);
    waveFilter.Q.setValueAtTime(1.0, this.ctx.currentTime);

    this.waveGain = this.ctx.createGain();
    this.waveGain.gain.setValueAtTime(0.015, this.ctx.currentTime);

    // Wave movement modulation (lapping waves)
    const lfo = this.ctx.createOscillator();
    lfo.frequency.setValueAtTime(0.12, this.ctx.currentTime); // Wave period: ~8 seconds

    const lfoGain = this.ctx.createGain();
    lfoGain.gain.setValueAtTime(0.012, this.ctx.currentTime);

    lfo.connect(lfoGain);
    lfoGain.connect(this.waveGain.gain);

    waveSource.connect(waveFilter);
    waveFilter.connect(this.waveGain);
    this.waveGain.connect(this.globalGain);

    lfo.start();
    waveSource.start();
  }

  // Setup static nodes for scroll friction scraping sounds
  setupPaperScrape() {
    this.scrapeNoiseNode = this.ctx.createBufferSource();
    this.scrapeNoiseNode.buffer = this.createNoiseBuffer();
    this.scrapeNoiseNode.loop = true;

    const scrapeFilter = this.ctx.createBiquadFilter();
    scrapeFilter.type = 'bandpass';
    scrapeFilter.frequency.setValueAtTime(2400, this.ctx.currentTime);
    scrapeFilter.Q.setValueAtTime(3.0, this.ctx.currentTime);

    this.scrapeGain = this.ctx.createGain();
    this.scrapeGain.gain.setValueAtTime(0.0, this.ctx.currentTime); // silent by default

    this.scrapeNoiseNode.connect(scrapeFilter);
    scrapeFilter.connect(this.scrapeGain);
    this.scrapeGain.connect(this.globalGain);

    this.scrapeNoiseNode.start();
  }

  // Handle scroll events and modulate paper sound based on scroll speed
  handleScrollScrape() {
    if (!this.ctx || this.isMuted) return;

    const now = performance.now();
    const currentY = window.scrollY;
    
    const deltaY = Math.abs(currentY - this.lastScrollY);
    const deltaTime = Math.max(now - this.lastScrollTime, 1);
    
    // Calculate scroll velocity (pixels/ms)
    const velocity = deltaY / deltaTime;
    
    this.lastScrollY = currentY;
    this.lastScrollTime = now;

    if (velocity > 0.05) {
      // Map velocity to scrape volume (clamped to protect hearing)
      const targetVolume = Math.min(velocity * 0.07, 0.06);
      
      // Warm felt scratch texture: pitch shifts slightly with velocity
      this.scrapeGain.gain.setTargetAtTime(targetVolume, this.ctx.currentTime, 0.05);
    } else {
      // Quickly fade out if scrolling stops
      this.scrapeGain.gain.setTargetAtTime(0.0, this.ctx.currentTime, 0.15);
    }
  }

  // Play a single soft felt-piano note
  playPianoNote(frequency, startTime, duration = 4.0) {
    const osc1 = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    
    const noteGain = this.ctx.createGain();
    const pianoFilter = this.ctx.createBiquadFilter();

    // Mellow felt piano timbre: Sine (fundamental) + Triangle (harmonic)
    osc1.type = 'sine';
    osc2.type = 'triangle';
    
    osc1.frequency.setValueAtTime(frequency, startTime);
    // Add micro-detuning on the second oscillator for rich choral texture
    osc2.frequency.setValueAtTime(frequency + (Math.random() * 0.4 - 0.2), startTime);

    // Filter: Dampen high frequencies rapidly (felt dampening)
    pianoFilter.type = 'lowpass';
    pianoFilter.frequency.setValueAtTime(450, startTime);
    pianoFilter.frequency.exponentialRampToValueAtTime(150, startTime + 1.2);
    pianoFilter.Q.setValueAtTime(1.0, startTime);

    // Amplitude Envelope: Soft attack (40ms), long decay, long release
    noteGain.gain.setValueAtTime(0.0, startTime);
    noteGain.gain.linearRampToValueAtTime(0.12, startTime + 0.08); // Max volume reached gently
    noteGain.gain.exponentialRampToValueAtTime(0.015, startTime + duration * 0.8);
    noteGain.gain.linearRampToValueAtTime(0.0, startTime + duration);

    // Mix oscillators
    const mixGain = this.ctx.createGain();
    mixGain.gain.setValueAtTime(0.6, startTime);
    osc1.connect(mixGain);
    
    // Scale triangle oscillator volume down to keep harmonics subtle
    const triGain = this.ctx.createGain();
    triGain.gain.setValueAtTime(0.2, startTime);
    osc2.connect(triGain);
    triGain.connect(mixGain);

    mixGain.connect(pianoFilter);
    pianoFilter.connect(noteGain);
    
    // Dry output
    noteGain.connect(this.globalGain);
    // Spatial Delay routing (creating deep echo)
    noteGain.connect(this.delayNode);

    osc1.start(startTime);
    osc2.start(startTime);

    osc1.stop(startTime + duration);
    osc2.stop(startTime + duration);
  }

  // Generate piano loops: periodically plays notes from the chord progression
  startPianoGenerativeLoop() {
    const playChord = () => {
      if (!this.ctx || this.isMuted) {
        // Continue scheduling next loops even if muted, context handles suspension
        this.sequenceTimer = setTimeout(playChord, 12000);
        return;
      }

      const activeChord = this.chords[this.currentChordIndex];
      const now = this.ctx.currentTime;
      
      // Arpeggiate the chord: play notes staggered by a variable, natural-sounding delay
      activeChord.forEach((freq, i) => {
        // Humanized arpeggiator timing variations (+/- 20ms)
        const delay = i * 0.25 + (Math.random() * 0.04 - 0.02);
        this.playPianoNote(freq, now + delay, 5.0);
      });

      // Shift to next chord in cycle
      this.currentChordIndex = (this.currentChordIndex + 1) % this.chords.length;

      // Repeat loop
      this.sequenceTimer = setTimeout(playChord, 12000);
    };

    // Trigger initial delay
    this.sequenceTimer = setTimeout(playChord, 3000);
  }

  // Resonant plink water-drop confirmation sound when form is submitted successfully
  playInkDropChime() {
    if (!this.ctx) return;
    
    // Ensure context is running
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }

    const now = this.ctx.currentTime;
    
    // Clean, high bell-like frequency
    const osc = this.ctx.createOscillator();
    const chimeGain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();

    osc.type = 'sine';
    // Pentatonic resonance: E5 (659.25Hz) or G5 (783.99Hz)
    osc.frequency.setValueAtTime(783.99, now);
    
    // Frequency slide to simulate drop compression: fast slide up
    osc.frequency.exponentialRampToValueAtTime(1046.50, now + 0.06); // slide to C6

    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(900, now);
    filter.Q.setValueAtTime(2.0, now);

    // Envelope: Instant attack, long ring tail
    chimeGain.gain.setValueAtTime(0.0, now);
    chimeGain.gain.linearRampToValueAtTime(0.25, now + 0.005);
    chimeGain.gain.exponentialRampToValueAtTime(0.001, now + 2.5);

    osc.connect(filter);
    filter.connect(chimeGain);
    
    // Connect to output and delay for space
    chimeGain.connect(this.globalGain);
    chimeGain.connect(this.delayNode);

    osc.start(now);
    osc.stop(now + 2.6);
  }

  // Clean up timers
  destroy() {
    if (this.sequenceTimer) {
      clearTimeout(this.sequenceTimer);
    }
  }
}

// Attach class globally for app.js initialization
window.AudioHandler = AudioHandler;
