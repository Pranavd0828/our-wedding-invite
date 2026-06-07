/**
 * WebGL Handler - "The Landscape of Us"
 * Manages watercolor texture loading, fiber-bleed fragment shader transitions,
 * aspect-ratio cover scaling, gyro/mouse parallax tilts, and time-of-day exposure.
 */

class WebGLHandler {
  constructor(canvasId, fallbackContainerId) {
    this.canvas = document.getElementById(canvasId);
    this.fallbackContainer = document.getElementById(fallbackContainerId);
    this.gl = null;
    this.program = null;
    
    // Textures
    this.textures = { image3: null, image4: null };
    this.imagesLoaded = { image3: false, image4: false };
    
    // Animation/State Uniforms
    this.blendValue = 0.0;
    this.exposure = 1.0;
    this.saturation = 1.0;
    this.timeTint = [1.0, 1.0, 1.0];
    
    // Parallax variables
    this.targetParallax = { x: 0, y: 0 };
    this.currentParallax = { x: 0, y: 0 };
    this.hasGyro = false;
    this.useStaticMobileFallback = window.matchMedia('(max-width: 767px)').matches;
    
    // Initialization
    this.init();
  }

  async init() {
    if (this.useStaticMobileFallback) {
      this.canvas.classList.add('hidden');
      this.displayFallback();
      return;
    }

    this.gl = this.canvas.getContext('webgl', { alpha: true, antialias: true, premultipliedAlpha: false });
    if (!this.gl) {
      console.warn("WebGL not supported, falling back to DOM image layers.");
      this.displayFallback();
      return;
    }

    this.canvas.addEventListener("webglcontextlost", (e) => {
      e.preventDefault();
      console.error("WebGL context lost.");
      this.displayFallback();
    }, false);
    // Compile Shaders & Link Program
    if (!this.setupShaders()) {
      this.displayFallback();
      return;
    }

    // Load textures
    this.loadTexture('image4', './assets/image-4.jpg');
    this.loadTexture('image3', './assets/image-3.jpg');

    // Setup Geometry
    this.setupGeometry();

    // Resize handling
    this.resizeCanvas();
    if (typeof ResizeObserver !== 'undefined') {
      const resizeObserver = new ResizeObserver(() => this.resizeCanvas());
      resizeObserver.observe(this.canvas);
    } else {
      window.addEventListener('resize', () => this.resizeCanvas());
    }

    // Event Listeners
    this.setupInteractivity();

    // Start rendering loop
    this.tick();
  }

  displayFallback() {
    if (this.fallbackContainer) {
      this.fallbackContainer.classList.remove('visual-hide');
      const img3 = document.getElementById('fallback-img-3');
      const img4 = document.getElementById('fallback-img-4');
      
      // Basic hover/scroll translation on fallback images as progressive enhancement
      window.addEventListener('scroll', () => {
        const welcomeEl = document.getElementById('welcome-section');
        let shouldShowSecondImage = false;
        
        if (welcomeEl) {
          // Trigger transition exactly when the Welcome section scrolls up past the middle of the screen
          const rect = welcomeEl.getBoundingClientRect();
          shouldShowSecondImage = rect.bottom < (window.innerHeight * 0.5);
        } else {
          // Fallback if section is missing
          const scrollPercent = window.scrollY / (document.documentElement.scrollHeight - window.innerHeight);
          shouldShowSecondImage = scrollPercent > 0.35;
        }
        
        if (!shouldShowSecondImage) {
          img4.classList.remove('hidden');
          img3.classList.add('hidden');
        } else {
          img4.classList.add('hidden');
          img3.classList.remove('hidden');
        }
      });
    }
  }

  setupShaders() {
    const gl = this.gl;

    const vsSource = `
      attribute vec2 a_position;
      attribute vec2 a_texCoord;
      varying vec2 v_texCoord;
      uniform vec2 u_texScale;
      uniform vec2 u_texOffset;
      uniform vec2 u_parallax;

      void main() {
        gl_Position = vec4(a_position, 0.0, 1.0);
        // Correct texture coordinates for cover fitting and add parallax offset
        v_texCoord = (a_texCoord - 0.5) * u_texScale + 0.5 + u_texOffset + u_parallax;
      }
    `;

    const fsSource = `
      precision mediump float;
      varying vec2 v_texCoord;
      
      uniform sampler2D u_texture1; // Image 4 (Sunglasses)
      uniform sampler2D u_texture2; // Image 3 (Warm Smile)
      uniform float u_blend;        // Blend progress (0.0 to 1.0)
      
      uniform float u_exposure;
      uniform float u_saturation;
      uniform vec3 u_timeTint;

      // 2D pseudo-random noise
      float noise(vec2 st) {
        return fract(sin(dot(st.xy, vec2(12.9898, 78.233))) * 43758.5453123);
      }

      // Smooth noise interpolation
      float smoothNoise(vec2 st) {
        vec2 i = floor(st);
        vec2 f = fract(st);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(noise(i + vec2(0.0, 0.0)), noise(i + vec2(1.0, 0.0)), u.x),
          mix(noise(i + vec2(0.0, 1.0)), noise(i + vec2(1.0, 1.0)), u.x),
          u.y
        );
      }

      // Fractal Brownian Motion (FBM) representing paper fibers
      float fbm(vec2 st) {
        float value = 0.0;
        float amplitude = 0.5;
        for (int i = 0; i < 3; i++) {
          value += amplitude * smoothNoise(st);
          st *= 2.0;
          amplitude *= 0.5;
        }
        return value;
      }

      void main() {
        vec2 uv = v_texCoord;

        // Transparent border for zoomed out image in Phase 1
        if (v_texCoord.x < 0.0 || v_texCoord.x > 1.0 || v_texCoord.y < 0.0 || v_texCoord.y > 1.0) {
          gl_FragColor = vec4(0.0);
          return;
        }

        vec4 color1 = texture2D(u_texture1, uv);
        vec4 color2 = texture2D(u_texture2, uv);

        // Generate organic bleeding threshold map using paper fiber noise
        float fiberPattern = fbm(uv * 12.0);
        
        // Skew blend curve slightly per-pixel based on the fiber structure
        float bleedThreshold = smoothstep(0.0, 0.2, u_blend - fiberPattern * 0.18);
        
        // Final organic bleed interpolation
        // Final organic bleed interpolation (if u_blend is used)
        vec4 finalColor = mix(color1, color2, bleedThreshold);

        // Output raw original color without any tint or distortion
        gl_FragColor = finalColor;
      }
    `;

    const vs = this.compileShader(gl.VERTEX_SHADER, vsSource);
    const fs = this.compileShader(gl.FRAGMENT_SHADER, fsSource);

    if (!vs || !fs) return false;

    this.program = gl.createProgram();
    gl.attachShader(this.program, vs);
    gl.attachShader(this.program, fs);
    gl.linkProgram(this.program);

    if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) {
      console.error("Linker failure: " + gl.getProgramInfoLog(this.program));
      return false;
    }

    return true;
  }

  compileShader(type, source) {
    const gl = this.gl;
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.error("Shader compiler failure: " + gl.getShaderInfoLog(shader));
      gl.deleteShader(shader);
      return null;
    }
    return shader;
  }

  loadTexture(key, src) {
    const gl = this.gl;
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);

    // Placeholder pixel while loading
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([250, 245, 236, 255]));

    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    const image = new Image();
    image.onerror = () => {
      console.error("Failed to load texture: " + src);
      this.displayFallback();
    };
    image.onload = () => {
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
      this.textures[key] = texture;
      this.imagesLoaded[key] = true;
      if (key === 'image4') {
        // Fix EXIF rotation bug: browser auto-rotates pixels to portrait, but image.width returns raw landscape!
        let aspect = (image.naturalWidth || image.width) / (image.naturalHeight || image.height);
        if (aspect > 1.0) {
          aspect = 1.0 / aspect; // Force portrait if it's > 1.0
        }
        this.imageAspect = aspect;
      }
      this.updateAspectCorrection();
      
      if (this.imagesLoaded['image3'] && this.imagesLoaded['image4']) {
        this.texturesReady = true;
      }
    };
    image.src = src;
  }

  setupGeometry() {
    const gl = this.gl;

    // A full screen quad
    const vertices = new Float32Array([
      -1.0, -1.0,   0.0, 0.0,
       1.0, -1.0,   1.0, 0.0,
      -1.0,  1.0,   0.0, 1.0,
      -1.0,  1.0,   0.0, 1.0,
       1.0, -1.0,   1.0, 0.0,
       1.0,  1.0,   1.0, 1.0,
    ]);

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

    const positionLoc = gl.getAttribLocation(this.program, "a_position");
    const texCoordLoc = gl.getAttribLocation(this.program, "a_texCoord");

    gl.enableVertexAttribArray(positionLoc);
    gl.vertexAttribPointer(positionLoc, 2, gl.FLOAT, false, 16, 0);

    gl.enableVertexAttribArray(texCoordLoc);
    gl.vertexAttribPointer(texCoordLoc, 2, gl.FLOAT, false, 16, 8);
  }

  resizeCanvas() {
    const gl = this.gl;
    if (!gl) return;

    const devicePixelRatio = window.devicePixelRatio || 1;
    this.canvas.width = Math.round(this.canvas.clientWidth * devicePixelRatio);
    this.canvas.height = Math.round(this.canvas.clientHeight * devicePixelRatio);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);

    this.updateAspectCorrection();
  }

  updateAspectCorrection() {
    const gl = this.gl;
    if (!gl || !this.program) return;

    this.imgAspect = this.imageAspect || (4.0 / 3.0); // Dynamic image aspect
    this.canvasAspect = this.canvas.width / this.canvas.height;
  }

  setupInteractivity() {
    // Gyroscope tilt sensing for mobile
    if (window.DeviceOrientationEvent) {
      window.addEventListener('deviceorientation', (e) => {
        if (e.gamma !== null && e.beta !== null) {
          this.hasGyro = true;
          // Clamp rotation to +/- 30 degrees, divide to get normalized -1..1
          const x = Math.min(Math.max(e.gamma, -25), 25) / 25;
          const y = Math.min(Math.max(e.beta - 45, -25), 25) / 25; // Adjusted offset for typical holding angle (45deg)
          
          this.targetParallax.x = x * 0.018;
          this.targetParallax.y = -y * 0.018;
        }
      }, true);
    }

    // Mouse tilt sensing fallback for desktop
    window.addEventListener('mousemove', (e) => {
      if (!this.hasGyro) {
        const x = (e.clientX / window.innerWidth) * 2 - 1;
        const y = (e.clientY / window.innerHeight) * 2 - 1;
        
        this.targetParallax.x = x * 0.012;
        this.targetParallax.y = -y * 0.012; // Y coordinates invert in WebGL
      }
    });

    // Handle touch movement parallax fallback on mobile if gyro permissions are disabled
    window.addEventListener('touchmove', (e) => {
      if (!this.hasGyro && e.touches.length > 0) {
        const x = (e.touches[0].clientX / window.innerWidth) * 2 - 1;
        const y = (e.touches[0].clientY / window.innerHeight) * 2 - 1;
        
        this.targetParallax.x = x * 0.012;
        this.targetParallax.y = -y * 0.012;
      }
    });
  }

  // Called by main orchestrator to pass updated environmental/scroll params
  setParameters(blend, exposure, saturation, tintArray) {
    this.blendValue = blend;
    this.exposure = exposure;
    this.saturation = saturation;
    this.timeTint = tintArray;
  }

  tick() {
    const gl = this.gl;
    if (!gl) return;

    // Frame interpolation for smooth spring-like haptic/visual movement
    this.currentParallax.x += (this.targetParallax.x - this.currentParallax.x) * 0.08;
    this.currentParallax.y += (this.targetParallax.y - this.currentParallax.y) * 0.08;

    // Clear buffer
    gl.clearColor(250/255, 245/255, 236/255, 1.0); // Match --canvas-base
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.useProgram(this.program);

    // Bind textures
    if (this.imagesLoaded.image4) {
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.textures.image4);
      gl.uniform1i(gl.getUniformLocation(this.program, "u_texture1"), 0);
    }

    if (this.imagesLoaded.image3) {
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, this.textures.image3);
      gl.uniform1i(gl.getUniformLocation(this.program, "u_texture2"), 1);
    }

    const scrollY = window.scrollY;
    const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
    const scrollPercent = maxScroll > 0 ? Math.min(Math.max(scrollY / maxScroll, 0), 1) : 0;
    
    // Pure mathematically perfect COVER scaling (like object-fit: cover)
    let currentScaleX = 1.0;
    let currentScaleY = 1.0;
    if (this.canvasAspect > this.imgAspect) {
      // Canvas is wider than image. To cover, image width matches, image height is cropped.
      currentScaleY = this.imgAspect / this.canvasAspect; 
    } else {
      // Canvas is taller than image. To cover, image height matches, image width is cropped.
      currentScaleX = this.canvasAspect / this.imgAspect;
    }

    let offsetY = 0.0;
    const isMobile = window.innerWidth < 768;
    // Push the image slightly down on mobile so it sits behind the text beautifully
    offsetY = isMobile ? -0.1 : 0.0;

    gl.uniform2f(gl.getUniformLocation(this.program, "u_texScale"), currentScaleX, currentScaleY);
    gl.uniform2f(gl.getUniformLocation(this.program, "u_texOffset"), 0.0, offsetY);

    // Set Uniforms
    gl.uniform1f(gl.getUniformLocation(this.program, "u_blend"), this.blendValue);
    gl.uniform1f(gl.getUniformLocation(this.program, "u_exposure"), this.exposure);
    gl.uniform1f(gl.getUniformLocation(this.program, "u_saturation"), this.saturation);
    gl.uniform3f(
      gl.getUniformLocation(this.program, "u_timeTint"),
      this.timeTint[0],
      this.timeTint[1],
      this.timeTint[2]
    );
    gl.uniform2f(
      gl.getUniformLocation(this.program, "u_parallax"),
      this.currentParallax.x,
      this.currentParallax.y
    );

    // Draw full screen quad
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    if (this.texturesReady && !this.firstFrameRendered) {
      this.firstFrameRendered = true;
      if (this.fallbackContainer && !this.fallbackContainer.classList.contains('visual-hide')) {
        this.fallbackContainer.classList.add('visual-hide');
      }
    }

    requestAnimationFrame(() => this.tick());
  }
}

// Attach class globally for app.js initialization
window.WebGLHandler = WebGLHandler;
