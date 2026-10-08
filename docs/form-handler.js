/**
 * RSVP validation, pending-request recovery, and Google Sheets submission.
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
    this.status = document.getElementById('rsvp-status');
    this.progress = document.getElementById('rsvp-progress');
    this.isSubmitting = false;
    this.pendingSubmission = null;
    try {
      this.pendingSubmission = JSON.parse(sessionStorage.getItem('rsvp-pending') || 'null');
    } catch {
      // Storage can be unavailable in private or embedded browsers.
    }

    this.init();
  }

  init() {
    this.setupAttendanceToggles();
    this.setupGuestTypeToggles();
    this.setupValidationListeners();
    this.form.addEventListener('submit', (e) => this.handleSubmit(e));
    this.submitBtn.disabled = false;
    this.syncConditionalFields();
    window.addEventListener('pageshow', () => this.syncConditionalFields());
  }

  // Expand secondary RSVP questions dynamically when accepting
  setupAttendanceToggles() {
    this.attendanceToggles.forEach(radio => {
      radio.addEventListener('change', () => {
        this.clearFieldError('attendance');
        this.syncConditionalFields();
      });
    });
  }

  // Show/Hide family count input
  setupGuestTypeToggles() {
    this.guestTypeToggles.forEach(radio => {
      radio.addEventListener('change', () => {
        this.clearFieldError('guest_type');
        this.syncConditionalFields();
      });
    });
  }

  syncConditionalFields() {
    const accepting = this.form.querySelector('[name="attendance"]:checked')?.value === 'accept';
    const family = accepting && this.form.querySelector('[name="guest_type"]:checked')?.value === 'family';
    this.expandedFields.classList.toggle('expanded', accepting);
    this.expandedFields.inert = !accepting;
    this.expandedFields.setAttribute('aria-hidden', String(!accepting));
    this.guestTypeToggles.forEach(radio => {
      radio.disabled = !accepting;
      radio.required = accepting;
    });
    this.familyCountContainer.classList.toggle('hidden', !family);
    this.familyCountInput.disabled = !family;
    this.familyCountInput.required = family;
    if (!accepting) this.clearFieldError('guest_type');
    if (!family) this.clearFieldError('family_count');
  }

  // Clear field level errors immediately on user action
  setupValidationListeners() {
    this.fullName.addEventListener('input', () => {
      if (this.fullName.value.trim().length > 1) {
        this.clearFieldError('name');
      }
    });
    this.familyCountInput.addEventListener('input', () => this.clearFieldError('family_count'));
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
    group?.querySelectorAll('input').forEach(input => input.removeAttribute('aria-invalid'));
  }

  validateForm() {
    let isValid = true;
    ['name', 'attendance', 'guest_type', 'family_count'].forEach(type => this.clearFieldError(type));

    // 1. Validate Full Name (Not empty)
    if (this.fullName.value.trim().length < 2 || this.fullName.value.trim().length > 100) {
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
            const count = Number(this.familyCountInput.value);
            if (!Number.isInteger(count) || count < 3 || count > 15) {
              const group = this.familyCountInput.closest('.form-group');
              group.classList.add('has-error');
              isValid = false;
            }
          }
        }
      }
    }

    this.form.querySelectorAll('.has-error input').forEach(input => input.setAttribute('aria-invalid', 'true'));
    return isValid;
  }

  prefersReducedMotion() {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  setBusy(busy) {
    this.isSubmitting = busy;
    this.form.inert = busy;
    this.form.setAttribute('aria-busy', String(busy));
    this.submitBtn.disabled = busy;
    this.submitBtn.querySelector('.btn-text').textContent = busy ? 'Sending...' : 'Send my RSVP';
    this.submitBtn.style.opacity = busy ? '0.7' : '1';
    if (this.progress) this.progress.textContent = busy ? 'Sending your RSVP. Please wait.' : '';
  }

  async getVisitorId() {
    if (typeof fpPromise === 'undefined') return 'unknown';
    let timeout;
    try {
      return await Promise.race([
        Promise.resolve(fpPromise).then(fp => fp?.get()).then(result => result?.visitorId || 'unknown').catch(() => 'unknown'),
        new Promise(resolve => { timeout = setTimeout(() => resolve('unknown'), 1500); })
      ]);
    } finally {
      clearTimeout(timeout);
    }
  }

  submissionFor(fields) {
    const signature = JSON.stringify(fields);
    if (this.pendingSubmission?.signature === signature
      && typeof this.pendingSubmission.submissionId === 'string'
      && this.pendingSubmission.submissionId.length > 0
      && this.pendingSubmission.submissionId.length <= 128
      && typeof this.pendingSubmission.timestamp === 'string'
      && Number.isFinite(Date.parse(this.pendingSubmission.timestamp))) {
      return this.pendingSubmission;
    }
    this.pendingSubmission = {
      signature,
      submissionId: typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2),
      timestamp: new Date().toISOString()
    };
    try {
      sessionStorage.setItem('rsvp-pending', JSON.stringify(this.pendingSubmission));
    } catch {
      // The in-memory ID still protects retries in this page when storage is blocked.
    }
    return this.pendingSubmission;
  }

  // Handle submit validation and transition initiation
  async handleSubmit(e) {
    e.preventDefault();

    if (this.isSubmitting) return;

    if (!this.validateForm()) {
      // Find the first error and scroll it into view for mobile UX
      const firstError = this.form.querySelector('.has-error');
      if (firstError) {
        firstError.querySelector('input')?.focus({ preventScroll: true });
        firstError.scrollIntoView({ behavior: this.prefersReducedMotion() ? 'auto' : 'smooth', block: 'center' });
      }

      // Trigger horizontal shake feedback on validation error
      if (!this.prefersReducedMotion()) this.card.classList.add('shake-animation');
      
      // Trigger a light haptic tap if mobile API available (haptic notch on error)
      if (navigator.vibrate && !this.prefersReducedMotion()) {
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
      else if (guestType === 'family') totalGuests = Number(this.familyCountInput.value);
    }

    const hpInput = document.getElementById('hp-website');
    const hpValue = hpInput ? hpInput.value : '';

    // Capture and lock before any asynchronous work, including optional fingerprinting.
    const fields = {
      fullName: this.fullName.value.trim(),
      attendance: attendanceVal,
      guestType: guestType,
      totalGuests: totalGuests,
      hp: hpValue
    };
    const submission = this.submissionFor(fields);

    // API URL provided by the user
    const WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbzWZMGFf0CSWsd1seh5SzC4zfLUKEB1AO75uBgHfc0OlM-8IKBnrI4DufHtxz7ELq7e9A/exec';

    // Show loading state
    this.setBusy(true);
    this.status.textContent = '';
    this.status.classList.add('hidden');

    // 10 second timeout for fetch
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    try {
      const visitorId = await this.getVisitorId();
      const rsvpData = { ...fields, submissionId: submission.submissionId, timestamp: submission.timestamp, visitorId };
      const response = await fetch(WEB_APP_URL, {
        method: 'POST',
        body: JSON.stringify(rsvpData),
        signal: controller.signal
      });
      if (!response.ok) throw new Error('http-error');
      const result = await response.json();

      if (result?.status === 'success') {
        clearTimeout(timeoutId);
        try { sessionStorage.removeItem('rsvp-pending'); } catch { /* Storage is optional. */ }
        this.pendingSubmission = null;
        this.displaySuccessPanel(attendanceVal);
      } else {
        const message = String(result?.error || result?.message || '');
        throw new Error(/^Server busy, try again\.?$/i.test(message) ? 'server-busy' : 'server-error');
      }
    } catch (err) {
      clearTimeout(timeoutId);
      if (controller.signal.aborted || err.name === 'AbortError') {
        this.status.textContent = 'We could not confirm your RSVP in time. Please retry; your answers have been kept.';
      } else if (err.message === 'server-busy') {
        this.status.textContent = 'Server busy, try again.';
      } else {
        this.status.textContent = 'We could not confirm your RSVP. Please check your connection and try again.';
      }
      this.status.classList.remove('hidden');
      this.setBusy(false);
      this.status.focus({ preventScroll: true });
      this.status.scrollIntoView({ behavior: this.prefersReducedMotion() ? 'auto' : 'smooth', block: 'nearest' });
    } finally {
      clearTimeout(timeoutId);
    }
  }


  // Confirm immediately after the server acknowledges the request.
  displaySuccessPanel(attendanceVal) {
    if (this.progress) this.progress.textContent = '';
    // Customize text based on attendance
    if (attendanceVal === 'decline') {
      const title = document.getElementById('success-title');
      const text = document.getElementById('success-text');
      if (title && text) {
        title.textContent = 'We will miss you';
        text.textContent = 'Thank you for letting us know. We appreciate your warm wishes from afar.';
      }
    }

    this.form.classList.add('hidden');
    this.form.setAttribute('aria-busy', 'false');
    this.successPanel.classList.remove('hidden');
    this.successPanel.focus({ preventScroll: true });
    this.successPanel.scrollIntoView({ behavior: this.prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });
    
    this.successPanel.classList.add('panel-active');
  }
}

// Attach class globally for app.js initialization
window.FormHandler = FormHandler;
