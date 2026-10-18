(() => {
  'use strict';
  // Preserve the optional identifier expected by the existing RSVP integration.
  window.fpPromise = import('https://openfpcdn.io/fingerprintjs/v4')
    .then(module => module.load())
    .catch(() => null);
  const loading = document.getElementById('rsvp-loading');
  try {
    if (typeof window.FormHandler !== 'function') throw new Error('RSVP module unavailable');
    window.AppInstance = { form: new window.FormHandler('wedding-rsvp-form', 'rsvp-interactive-card', 'rsvp-success-panel') };
    loading.hidden = true;
  } catch (error) {
    loading.textContent = 'The RSVP form could not load. Please refresh this page, or contact Prajakta or Pranav directly.';
    console.warn('RSVP initialization failed.', error);
  }

  // Keep the fixed RSVP bar clear of fields while the mobile keyboard is open.
  const updateKeyboardState = () => {
    const field = document.activeElement;
    const isTyping = field instanceof HTMLInputElement && ['text', 'number', 'email', 'tel'].includes(field.type);
    const viewport = window.visualViewport;
    const keyboardVisible = viewport && viewport.scale <= 1.05 && window.innerHeight - viewport.height > 120;
    document.body.classList.toggle('keyboard-open', isTyping || Boolean(keyboardVisible));
  };
  document.addEventListener('focusin', updateKeyboardState);
  document.addEventListener('focusout', () => requestAnimationFrame(updateKeyboardState));
  window.visualViewport?.addEventListener('resize', updateKeyboardState);
  window.addEventListener('pageshow', updateKeyboardState);

  // Fit complete names only when enlarged text or fallback fonts exceed the space.
  const title = document.getElementById('couple-names');
  const titleContainer = title.parentElement;
  const measure = document.createElement('canvas').getContext('2d');
  const fitNames = () => {
    if (!measure) return;
    title.style.setProperty('--name-fit', '1');
    const style = getComputedStyle(title);
    const containerStyle = getComputedStyle(titleContainer);
    const available = titleContainer.clientWidth - parseFloat(containerStyle.paddingLeft) - parseFloat(containerStyle.paddingRight);
    const widths = [...title.children].map(element => {
      const textStyle = getComputedStyle(element);
      measure.font = `${textStyle.fontStyle} ${textStyle.fontWeight} ${textStyle.fontSize} ${textStyle.fontFamily}`;
      return measure.measureText(element.textContent).width;
    });
    const needed = style.flexDirection === 'column'
      ? Math.max(...widths)
      : widths.reduce((sum, width) => sum + width, 0) + 2 * parseFloat(style.columnGap);
    title.style.setProperty('--name-fit', String(Math.min(1, Math.max(1, available - 2) / needed)));
  };
  fitNames();
  document.fonts.ready.then(fitNames);
  window.addEventListener('resize', fitNames);
  if (typeof ResizeObserver === 'function') {
    const titleObserver = new ResizeObserver(fitNames);
    titleObserver.observe(titleContainer);
  }

  // Larger text can increase either fixed bar; measure actual space for anchor scrolling.
  const header = document.querySelector('.site-header');
  const bar = document.querySelector('.mobile-rsvp-bar');
  const updateNavigationSpace = () => {
    document.documentElement.style.setProperty('--header-height', `${header.getBoundingClientRect().height}px`);
    document.documentElement.style.setProperty('--rsvp-bar-height', `${bar.getBoundingClientRect().height}px`);
  };
  updateNavigationSpace();
  if (typeof ResizeObserver === 'function') {
    const observer = new ResizeObserver(updateNavigationSpace);
    observer.observe(header);
    observer.observe(bar);
  }
  window.addEventListener('resize', updateNavigationSpace);
  document.querySelectorAll('a[href^="#"]').forEach(link => {
    link.addEventListener('click', () => {
      if (document.activeElement instanceof HTMLInputElement) document.activeElement.blur();
    });
  });
})();
