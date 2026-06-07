/**
 * RSVP Form & State Handler - "The Landscape of Us"
 * Orchestrates letterpress initials inputs, dynamic expanding details, validation loops,
 * custom watercolor particle dissolution effects, and success card panel reveals.
 */

class FormHandler {
  constructor(formId, cardId, successPanelId, audioHandler) {
    this.form = document.getElementById(formId);
    this.card = document.getElementById(cardId);
    this.successPanel = document.getElementById(successPanelId);
    this.audio = audioHandler;
    
    // Form fields
    this.initials = [
      document.getElementById('initial-1'),
      document.getElementById('initial-2'),
      document.getElementById('initial-3')
    ];
    this.fullName = document.getElementById('guest-fullname');
    this.attendanceToggles = document.getElementsByName('attendance');
    this.expandedFields = document.getElementById('expanded-details-container');
    
    // Submit btn
    this.submitBtn = document.getElementById('rsvp-submit-btn');

    this.init();
  }

  init() {
    this.setupInitialsAutofocus();
    this.setupAttendanceToggles();
    this.setupValidationListeners();
    this.form.addEventListener('submit', (e) => this.handleSubmit(e));
  }

  // Auto-focus progression for letterpress initials component
  setupInitialsAutofocus() {
    this.initials.forEach((input, index) => {
      input.addEventListener('input', (e) => {
        const val = input.value.trim();
        if (val.length === 1) {
          input.parentElement.classList.add('filled');
          // Move to next input field
          if (index < this.initials.length - 1) {
            this.initials[index + 1].focus();
          }
        } else {
          input.parentElement.classList.remove('filled');
        }
        this.clearFieldError('initials');
      });

      // Handle backspaces moving focus backward
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Backspace' && input.value.length === 0) {
          if (index > 0) {
            const prev = this.initials[index - 1];
            prev.focus();
            prev.value = '';
            prev.parentElement.classList.remove('filled');
          }
        }
      });
    });
  }

  // Expand secondary RSVP questions dynamically when accepting
  setupAttendanceToggles() {
    this.attendanceToggles.forEach(radio => {
      radio.addEventListener('change', () => {
        this.clearFieldError('attendance');
        if (radio.value === 'accept') {
          this.expandedFields.classList.add('expanded');
        } else {
          this.expandedFields.classList.remove('expanded');
        }
      });
    });
  }

  // Clear field level errors immediately on user action
  setupValidationListeners() {
    this.fullName.addEventListener('input', () => {
      if (this.fullName.value.trim().length > 1) {
        this.clearFieldError('name');
      }
    });
  }

  clearFieldError(type) {
    let group = null;
    if (type === 'initials') {
      group = this.initials[0].closest('.form-group');
    } else if (type === 'name') {
      group = this.fullName.closest('.form-group');
    } else if (type === 'attendance') {
      group = this.attendanceToggles[0].closest('.form-group');
    }
    
    if (group && group.classList.contains('has-error')) {
      group.classList.remove('has-error');
    }
  }

  validateForm() {
    let isValid = true;

    // 1. Validate Initials (Need at least 2 characters filled)
    const filledCount = this.initials.filter(input => input.value.trim().length === 1).length;
    if (filledCount < 2) {
      const group = this.initials[0].closest('.form-group');
      group.classList.add('has-error');
      isValid = false;
    }

    // 2. Validate Full Name (Not empty)
    if (this.fullName.value.trim().length < 2) {
      const group = this.fullName.closest('.form-group');
      group.classList.add('has-error');
      isValid = false;
    }

    // 3. Validate Attendance choice
    const isAttendanceChecked = Array.from(this.attendanceToggles).some(radio => radio.checked);
    if (!isAttendanceChecked) {
      const group = this.attendanceToggles[0].closest('.form-group');
      group.classList.add('has-error');
      isValid = false;
    }

    return isValid;
  }

  // Handle submit validation and transition initiation
  handleSubmit(e) {
    e.preventDefault();

    if (!this.validateForm()) {
      // Trigger horizontal shake feedback on validation error
      this.card.classList.add('shake-animation');
      
      // Trigger a light haptic tap if mobile API available (haptic notch on error)
      if (navigator.vibrate) {
        navigator.vibrate([40, 30, 40]);
      }
      
      // Clean up shake class after animation finishes so it can re-shake on next click
      setTimeout(() => {
        this.card.classList.remove('shake-animation');
      }, 450);
      return;
    }

    // Capture form fields data
    const rsvpData = {
      initials: this.initials.map(i => i.value).join(''),
      fullName: this.fullName.value,
      attendance: Array.from(this.attendanceToggles).find(r => r.checked).value,
      guestsCount: document.getElementById('guest-count').value,
      dietary: document.getElementById('dietary-preference').value,
      accommodation: document.getElementById('accommodation-check').checked,
      timestamp: new Date().toISOString()
    };

    // Encrypt & Save in LocalStorage securely (Privacy-first design demonstration)
    try {
      const encryptedData = btoa(JSON.stringify(rsvpData)); // Simple base64 mock encryption
      localStorage.setItem('wedding_rsvp_payload', encryptedData);
    } catch (err) {
      console.warn("Storage error: ", err);
    }

    // Initiate submission sequence
    this.triggerDissolutionSequence();
  }

  // Captures card geometry, starts canvas droplet simulation, then displays success confirmation card
  triggerDissolutionSequence() {
    // Disable inputs during transition
    this.submitBtn.disabled = true;
    this.submitBtn.style.opacity = '0.5';

    // 1. Mobile UX: RSVP Submission Recoil (diminishing haptic pulses)
    if (navigator.vibrate) {
      navigator.vibrate([80, 50, 40, 30, 20]);
    }

    // 2. Play Resonant "Ink Drop" chime
    if (this.audio) {
      this.audio.playInkDropChime();
    }

    // 3. Create watercolor particles canvas overlay
    const rect = this.card.getBoundingClientRect();
    const canvas = document.createElement('canvas');
    canvas.width = rect.width;
    canvas.height = rect.height;
    canvas.style.position = 'absolute';
    canvas.style.top = '0';
    canvas.style.left = '0';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.zIndex = '4';
    canvas.style.pointerEvents = 'none';
    this.card.appendChild(canvas);

    const ctx = canvas.getContext('2d');

    // Fade out form elements smoothly
    this.form.classList.add('fade-out');

    // Create particle array
    const particles = [];
    const colors = ['#4B5943', '#D29D5B', '#E1F0FA', '#FAF5EC', '#F2EDE2'];
    
    // Spawn particles from positions of the form components
    const totalParticles = 120;
    for (let i = 0; i < totalParticles; i++) {
      particles.push({
        x: Math.random() * rect.width,
        y: Math.random() * rect.height * 0.8 + (rect.height * 0.1),
        vx: Math.random() * 2 - 1.0,
        vy: -Math.random() * 1.5 - 0.5,
        radius: Math.random() * 8 + 3,
        color: colors[Math.floor(Math.random() * colors.length)],
        alpha: 1.0,
        decay: Math.random() * 0.015 + 0.008,
        wiggleSpeed: Math.random() * 0.02 + 0.01,
        wiggleAmp: Math.random() * 0.8 + 0.2
      });
    }

    let startTime = performance.now();

    const animateParticles = (now) => {
      const elapsed = now - startTime;
      ctx.clearRect(0, 0, rect.width, rect.height);

      let activeCount = 0;
      particles.forEach(p => {
        if (p.alpha > 0) {
          activeCount++;
          
          // Apply physics
          p.y += p.vy;
          p.x += p.vx + Math.sin(elapsed * p.wiggleSpeed) * p.wiggleAmp;
          p.alpha -= p.decay;
          
          if (p.alpha < 0) p.alpha = 0;

          // Draw droplet with soft wet watercolor edge
          ctx.beginPath();
          const grad = ctx.createRadialGradient(p.x, p.y, p.radius * 0.1, p.x, p.y, p.radius);
          grad.addColorStop(0, p.color);
          grad.addColorStop(0.6, p.color);
          grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
          
          ctx.fillStyle = grad;
          ctx.globalAlpha = p.alpha;
          ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
          ctx.closePath();
          ctx.fill();
        }
      });

      if (activeCount > 0) {
        requestAnimationFrame(animateParticles);
      } else {
        // Particles dissolved: clean up canvas and trigger panel split
        canvas.remove();
        this.displaySuccessPanel();
      }
    };

    requestAnimationFrame(animateParticles);
  }

  // Split panels open and reveal success confirmation card
  displaySuccessPanel() {
    this.successPanel.classList.remove('hidden');
    
    // Small delay to trigger DOM layout reflow
    setTimeout(() => {
      this.successPanel.classList.add('panel-active');
    }, 50);
  }
}

// Attach class globally for app.js initialization
window.FormHandler = FormHandler;
