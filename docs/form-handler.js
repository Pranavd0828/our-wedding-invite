/**
 * RSVP Form & State Handler - "The Landscape of Us"
 * Orchestrates letterpress initials inputs, dynamic expanding details, validation loops,
 * custom watercolor particle dissolution effects, and success card panel reveals.
 */

class FormHandler {
  constructor(formId, cardId, successPanelId) {
    this.form = document.getElementById(formId);
    this.card = document.getElementById(cardId);
    this.successPanel = document.getElementById(successPanelId);

    
    // Form fields
    this.fullName = document.getElementById('guest-fullname');
    this.attendanceToggles = document.getElementsByName('attendance');
    this.guestTypeToggles = document.getElementsByName('guest_type');
    this.familyCountContainer = document.getElementById('family-count-container');
    this.familyCountInput = document.getElementById('family-guest-count');
    this.expandedFields = document.getElementById('expanded-details-container');
    
    // Submit btn
    this.submitBtn = document.getElementById('rsvp-submit-btn');

    this.init();
  }

  init() {
    this.setupAttendanceToggles();
    this.setupGuestTypeToggles();
    this.setupValidationListeners();
    this.form.addEventListener('submit', (e) => this.handleSubmit(e));
  }

  // Expand secondary RSVP questions dynamically when accepting
  setupAttendanceToggles() {
    this.attendanceToggles.forEach(radio => {
      radio.addEventListener('change', () => {
        this.clearFieldError('attendance');
        if (radio.value === 'accept') {
          this.expandedFields.classList.add('expanded');
          // Re-apply height if family is already checked
          if (document.querySelector('input[name="guest_type"][value="family"]')?.checked) {
            this.expandedFields.style.gridTemplateRows = '1.5fr';
          }
        } else {
          this.expandedFields.classList.remove('expanded');
          this.expandedFields.style.gridTemplateRows = '0fr'; // Force collapse overriding any inline styles
        }
      });
    });
  }

  // Show/Hide family count input
  setupGuestTypeToggles() {
    this.guestTypeToggles.forEach(radio => {
      radio.addEventListener('change', () => {
        this.clearFieldError('guest_type');
        if (radio.value === 'family') {
          this.familyCountContainer.classList.remove('hidden');
          // Add extra height buffer to expanding container
          this.expandedFields.style.gridTemplateRows = '1.5fr';
        } else {
          this.familyCountContainer.classList.add('hidden');
          this.expandedFields.style.gridTemplateRows = '1fr';
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
    if (type === 'name') {
      group = this.fullName.closest('.form-group');
    } else if (type === 'attendance') {
      group = this.attendanceToggles[0].closest('.form-group');
    } else if (type === 'guest_type') {
      group = this.guestTypeToggles[0].closest('.form-group');
    } else if (type === 'family_count') {
      group = this.familyCountInput.closest('.form-group');
    }
    
    if (group && group.classList.contains('has-error')) {
      group.classList.remove('has-error');
    }
  }

  validateForm() {
    let isValid = true;

    // 1. Validate Full Name (Not empty)
    if (this.fullName.value.trim().length < 2) {
      const group = this.fullName.closest('.form-group');
      group.classList.add('has-error');
      isValid = false;
    }

    // 2. Validate Attendance choice
    const isAttendanceChecked = Array.from(this.attendanceToggles).some(radio => radio.checked);
    if (!isAttendanceChecked) {
      const group = this.attendanceToggles[0].closest('.form-group');
      group.classList.add('has-error');
      isValid = false;
    } else {
      const attendanceVal = Array.from(this.attendanceToggles).find(r => r.checked).value;
      
      // 3. If accepting, validate guest type
      if (attendanceVal === 'accept') {
        const isGuestTypeChecked = Array.from(this.guestTypeToggles).some(radio => radio.checked);
        if (!isGuestTypeChecked) {
          const group = this.guestTypeToggles[0].closest('.form-group');
          group.classList.add('has-error');
          isValid = false;
        } else {
          const guestTypeVal = Array.from(this.guestTypeToggles).find(r => r.checked).value;
          // 4. If family, validate family count
          if (guestTypeVal === 'family') {
            const count = parseInt(this.familyCountInput.value, 10);
            if (isNaN(count) || count < 3 || count > 15) {
              const group = this.familyCountInput.closest('.form-group');
              group.classList.add('has-error');
              isValid = false;
            }
          }
        }
      }
    }

    return isValid;
  }

  // Handle submit validation and transition initiation
  async handleSubmit(e) {
    e.preventDefault();

    if (this.isSubmitting) return;

    if (!this.validateForm()) {
      // Find the first error and scroll it into view for mobile UX
      const firstError = this.form.querySelector('.has-error');
      if (firstError) {
        firstError.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }

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

    const attendanceVal = Array.from(this.attendanceToggles).find(r => r.checked).value;
    let guestType = null;
    let totalGuests = 0;

    if (attendanceVal === 'accept') {
      guestType = Array.from(this.guestTypeToggles).find(r => r.checked).value;
      if (guestType === 'just_me') totalGuests = 1;
      else if (guestType === 'plus_one') totalGuests = 2;
      else if (guestType === 'family') totalGuests = parseInt(this.familyCountInput.value, 10);
    }

    const hpInput = document.getElementById('hp-website');
    const hpValue = hpInput ? hpInput.value : '';

    const submissionId = Date.now().toString(36) + Math.random().toString(36).substr(2, 5);

    // Capture form fields data
    const rsvpData = {
      fullName: this.fullName.value,
      attendance: attendanceVal,
      guestType: guestType,
      totalGuests: totalGuests,
      timestamp: new Date().toISOString(),
      submissionId: submissionId,
      hp: hpValue
    };

    // API URL provided by the user
    const WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbzWZMGFf0CSWsd1seh5SzC4zfLUKEB1AO75uBgHfc0OlM-8IKBnrI4DufHtxz7ELq7e9A/exec';

    // Show loading state
    this.isSubmitting = true;
    const originalBtnText = this.submitBtn.querySelector('.btn-text').innerText;
    this.submitBtn.disabled = true;
    this.submitBtn.querySelector('.btn-text').innerText = 'SAVING...';
    this.submitBtn.style.opacity = '0.7';

    // 10 second timeout for fetch
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    try {
      const response = await fetch(WEB_APP_URL, {
        method: 'POST',
        body: JSON.stringify(rsvpData),
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      const result = await response.json();

      if (result.status === 'success') {
        // Initiate submission sequence only on success
        this.triggerDissolutionSequence(attendanceVal);
      } else {
        throw new Error(result.error || result.message || 'Unknown error from server');
      }
    } catch (err) {
      clearTimeout(timeoutId);
      console.error("API Submission Error:", err);
      if (err.name === 'AbortError') {
        alert("The connection timed out. Please check your internet and try again.");
      } else {
        alert(err.message || "There was an error saving your RSVP. Please check your connection and try again.");
      }
      
      // Revert loading state
      this.isSubmitting = false;
      this.submitBtn.disabled = false;
      this.submitBtn.querySelector('.btn-text').innerText = originalBtnText;
      this.submitBtn.style.opacity = '1';
    }
  }

  // Captures card geometry, starts canvas droplet simulation, then displays success confirmation card
  triggerDissolutionSequence(attendanceVal) {
    // Disable inputs during transition
    this.submitBtn.disabled = true;
    this.submitBtn.style.opacity = '0.5';

    // 1. Mobile UX: RSVP Submission Recoil (diminishing haptic pulses)
    if (navigator.vibrate) {
      navigator.vibrate([80, 50, 40, 30, 20]);
    }

    // 2. Play Resonant "Ink Drop" chime


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
        this.displaySuccessPanel(attendanceVal);
      }
    };

    requestAnimationFrame(animateParticles);
  }

  // Split panels open and reveal success confirmation card
  displaySuccessPanel(attendanceVal) {
    // Customize text based on attendance
    if (attendanceVal === 'decline') {
      const title = document.getElementById('success-title');
      const text = document.getElementById('success-text');
      if (title && text) {
        title.innerText = "We Will Miss You";
        text.innerText = `"Thank you for letting us know. We appreciate your warm wishes from afar."`;
      }
    }

    this.successPanel.classList.remove('hidden');
    
    // Small delay to trigger DOM layout reflow
    setTimeout(() => {
      this.successPanel.classList.add('panel-active');
    }, 50);
  }
}

// Attach class globally for app.js initialization
window.FormHandler = FormHandler;
