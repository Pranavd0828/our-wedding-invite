/**
 * Global Application Orchestrator - "The Landscape of Us"
 * Initializes child modules, coordinates scroll timelines, manages time-based environment logic,
 * runs typographic widow controllers, and paints the dynamic loading favicon.
 */

class Application {
  constructor() {
    this.webgl = null;
    this.audio = null;
    this.map = null;
    this.form = null;
    
    // Environmental / Climate states
    this.exposure = 1.0;
    this.saturation = 1.0;
    this.timeTint = [1.0, 1.0, 1.0];

    // Scroll metrics
    this.scrollPercent = 0.0;
    this.blendValue = 0.0;
    
    this.init();
  }

  init() {
    // 1. Run Dynamic Favicon Canvas Painter (Simulate paint load)
    this.paintFaviconLoading();

    // 2. Initialize Environmental Time Settings
    this.calibrateEnvironment();

    // 3. Document Load and Resize events
    if (document.readyState === 'loading') {
      window.addEventListener('DOMContentLoaded', () => this.onReady());
    } else {
      this.onReady();
    }

    // 4. Initialize Lenis Smooth Scroll (from portfolio repo)
    this.lenis = new Lenis({
      duration: 1.4,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
      wheelMultiplier: 1,
      touchMultiplier: 2,
      autoRaf: false, // Prevent conflict with our manual RAF loop
    });

    this.lenis.on('scroll', () => {
      this.orchestrateScrollTimeline();
    });

    this.raf = this.raf.bind(this);
    requestAnimationFrame(this.raf);
  }

  raf(time) {
    this.lenis.raf(time);
    requestAnimationFrame(this.raf);
  }

  onReady() {
    this.setupComponents();
    this.preventWidows();
    window.addEventListener('resize', () => this.preventWidows());
  }

  // Setup sub-module instances
  setupComponents() {
    // Initialize Web Audio Handler
    this.audio = new window.AudioHandler('audio-control-widget');
    
    // Initialize WebGL Background Layer
    this.webgl = new window.WebGLHandler('webgl-canvas', 'fallback-images-container');
    
    // Custom map handler removed (using Google Maps directly via initMap)
    // Initialize RSVP Form Controller
    this.form = new window.FormHandler('wedding-rsvp-form', 'rsvp-interactive-card', 'rsvp-success-panel', this.audio);

    // Initial scroll sync
    this.orchestrateScrollTimeline();
  }

  calibrateEnvironment() {
    // Standard Mumbai/Pune Theme (No time of day shifting)
    document.body.classList.remove('golden-hour', 'night-mode');
    this.exposure = 1.0;
    this.saturation = 1.0;
    this.timeTint = [1.02, 0.95, 0.88]; // Very subtle warm chai tint
  }

  // Orchestrate Scroll Sequences: updates WebGL textures blending and active viewport sections
  orchestrateScrollTimeline() {
    const docHeight = document.documentElement.scrollHeight;
    const winHeight = window.innerHeight;
    const maxScroll = docHeight - winHeight;
    const scrollY = window.scrollY;

    // Fade out "Scroll to unfold" immediately upon scroll
    const scrollHint = document.querySelector('.scroll-hint');
    if (scrollHint) {
      if (scrollY > 50) {
        scrollHint.style.opacity = '0';
      } else {
        scrollHint.style.opacity = '0.7';
      }
    }
    
    if (maxScroll <= 0) return;

    this.scrollPercent = Math.min(Math.max(scrollY / maxScroll, 0), 1);
    document.documentElement.style.setProperty('--scroll-percentage', this.scrollPercent);

    const welcomeEl = document.getElementById('welcome-section');
    const canvasEl = document.getElementById('webgl-canvas');
    const fallbackEl = document.getElementById('fallback-images-container');

    // 1. Calculate watercolor blend value (Image 4 to Image 3 transition)
    // Anchored exactly to the transition out of the welcome section
    if (welcomeEl) {
      const welcomeRect = welcomeEl.getBoundingClientRect();
      const welcomeBottom = welcomeRect.bottom + scrollY;
      const transitionStart = welcomeBottom - winHeight * 0.5;
      const transitionWindow = 150; // pixels

      if (scrollY < transitionStart) {
        this.blendValue = 0.0;
      } else if (scrollY > (transitionStart + transitionWindow)) {
        this.blendValue = 1.0;
      } else {
        this.blendValue = (scrollY - transitionStart) / transitionWindow;
      }
      
    }

    // 2. Hide WebGL Canvas when reaching Map/RSVP sections
    const mapSection = document.getElementById('map-section');
    if (mapSection && canvasEl && fallbackEl) {
      const mapTop = mapSection.getBoundingClientRect().top + scrollY;
      // Start fading out when the map section is coming into view
      if (scrollY > mapTop - winHeight * 0.6) {
        canvasEl.classList.add('hidden');
        fallbackEl.classList.add('hidden');
      } else {
        canvasEl.classList.remove('hidden');
        fallbackEl.classList.remove('hidden');
      }
    }

    // Update WebGL rendering parameters
    if (this.webgl) {
      this.webgl.setParameters(this.blendValue, this.exposure, this.saturation, this.timeTint);
    }

    // 3. Dynamic Section Active Phase triggers based on actual DOM bounds
    const sections = [
      { id: 'welcome-section' },
      { id: 'details-section' },
      { id: 'map-section' },
      { id: 'rsvp-section' }
    ];

    sections.forEach((sec, idx) => {
      const el = document.getElementById(sec.id);
      if (el) {
        const rect = el.getBoundingClientRect();
        const top = rect.top + scrollY;
        const bottom = top + rect.height;
        
        // A section animates in when its top reaches 70% of viewport and exits when its bottom goes above 10%
        const entryTrigger = scrollY + winHeight * 0.7;
        const exitTrigger = scrollY + winHeight * 0.1;

        if (entryTrigger >= top && exitTrigger < bottom) {
          el.classList.add('active-phase');
        } else {
          // Keep welcome section active at the very top of scroll
          if (idx === 0 && scrollY === 0) {
            el.classList.add('active-phase');
          } else {
            el.classList.remove('active-phase');
          }
        }
      }
    });

    // Custom CSS variable triggers for scroll scaling (as progressive enhancement)
    if (this.scrollPercent <= 0.35) {
      const sectionScrollScale = 1.0 + (this.scrollPercent / 0.35) * 0.05;
      document.documentElement.style.setProperty('--section-image-scale', sectionScrollScale);
    }
  }

  // Typographic Widow Control: prevent single trailing words in paragraphs
  preventWidows() {
    const textBlocks = document.querySelectorAll(
      '.intro-description, .event-desc, .success-text, .rsvp-subtitle, .details-subtitle'
    );
    
    textBlocks.forEach(el => {
      const htmlContent = el.innerHTML.trim();
      // Skip if already formatted
      if (htmlContent.includes('&nbsp;')) return;
      
      const words = htmlContent.split(' ');
      if (words.length > 4) {
        const lastWord = words.pop();
        const secondLastWord = words.pop();
        el.innerHTML = words.join(' ') + ' ' + secondLastWord + '&nbsp;' + lastWord;
      }
    });
  }

  // Custom Favicon System: dynamic canvas paints itself on load
  paintFaviconLoading() {
    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    const ctx = canvas.getContext('2d');
    const favicon = document.getElementById('favicon');

    let progress = 0;
    const drawFavicon = () => {
      ctx.clearRect(0, 0, 32, 32);

      // 1. Draw Faint Pencil Crest Outline (P & P)
      ctx.strokeStyle = 'rgba(75, 89, 67, 0.4)'; // Olive with low opacity
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      // Draw P
      ctx.moveTo(8, 22);
      ctx.lineTo(8, 10);
      ctx.bezierCurveTo(12, 10, 15, 12, 15, 15);
      ctx.bezierCurveTo(15, 18, 12, 20, 8, 20);
      
      // Draw &
      ctx.moveTo(17, 21);
      ctx.bezierCurveTo(19, 21, 21, 19, 20, 16);
      ctx.bezierCurveTo(19, 13, 16, 17, 18, 19);
      ctx.lineTo(21, 22);
      
      // Draw second P
      ctx.moveTo(23, 22);
      ctx.lineTo(23, 10);
      ctx.bezierCurveTo(27, 10, 30, 12, 30, 15);
      ctx.bezierCurveTo(30, 18, 27, 20, 23, 20);

      ctx.stroke();

      // 2. Draw Watercolor Blurs (Fills up as page hydrates)
      if (progress > 0.1) {
        // Olive green pigment bleed
        ctx.fillStyle = `rgba(75, 89, 67, ${progress * 0.4})`;
        ctx.beginPath();
        ctx.arc(10, 14, 6 * progress, 0, Math.PI * 2);
        ctx.fill();
      }

      if (progress > 0.4) {
        // Golden pigment bleed
        ctx.fillStyle = `rgba(210, 157, 91, ${(progress - 0.3) * 0.5})`;
        ctx.beginPath();
        ctx.arc(20, 17, 7 * (progress - 0.3), 0, Math.PI * 2);
        ctx.fill();
      }

      // Update browser head
      favicon.href = canvas.toDataURL('image/png');

      if (progress < 1.0) {
        progress += 0.05; // Simulate load steps
        setTimeout(drawFavicon, 50);
      }
    };

    drawFavicon();
  }
}

// Instantiate application immediately
window.AppInstance = new Application();

// Google Maps callback function
window.initMap = function() {
  const mapElement = document.getElementById('google-map');
  if (!mapElement) return;

  const location = { lat: 18.397, lng: 73.743 };

  const isDesktop = window.innerWidth >= 900;

  const map = new google.maps.Map(mapElement, {
    center: location,
    zoom: 14,
    disableDefaultUI: true,
    zoomControl: isDesktop,
    gestureHandling: isDesktop ? 'auto' : 'none',
    styles: [
      { featureType: "poi", elementType: "all", stylers: [{ visibility: "off" }] },
      { featureType: "transit", elementType: "all", stylers: [{ visibility: "off" }] },
      { elementType: "geometry", stylers: [{ color: "#F8F3EA" }] },
      { elementType: "labels.text.stroke", stylers: [{ color: "#F8F3EA" }] },
      { elementType: "labels.text.fill", stylers: [{ color: "#5E3A21" }] },
      { featureType: "administrative.locality", elementType: "labels.text.fill", stylers: [{ color: "#5E3A21" }] },
      { featureType: "road", elementType: "geometry", stylers: [{ color: "#ffffff" }] },
      { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#D4B895" }] },
      { featureType: "road", elementType: "labels.text.fill", stylers: [{ color: "#8A6B52" }] },
      { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#E8C89A" }] },
      { featureType: "road.highway", elementType: "geometry.stroke", stylers: [{ color: "#D6A96C" }] },
      { featureType: "water", elementType: "geometry", stylers: [{ color: "#85B8D4" }] },
      { featureType: "water", elementType: "labels.text.fill", stylers: [{ color: "#5E3A21" }] },
      { featureType: "landscape.natural", elementType: "geometry", stylers: [{ color: "#F4EBD9" }] }
    ]
  });

  const customIcon = {
    path: google.maps.SymbolPath.CIRCLE,
    fillColor: '#A64B38', /* Warm terracotta marker for a pop of color */
    fillOpacity: 1,
    strokeColor: '#ffffff',
    strokeWeight: 2,
    scale: 10
  };

  new google.maps.Marker({
    position: location,
    map: map,
    title: "Sorina Hillside Resort",
    icon: customIcon
  });
};
