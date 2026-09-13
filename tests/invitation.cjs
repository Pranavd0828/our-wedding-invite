const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { createServer } = require('node:http');
const { chromium, webkit } = require('playwright');

const root = path.resolve(__dirname, '../docs');
const output = process.env.TEST_OUTPUT_DIR;
const type = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png', '.jpg': 'image/jpeg' };
let slowBodyStarted = false;
const server = createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (pathname === '/slow-body') {
      slowBodyStarted = true;
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.write('{"status":');
      return;
    }
    const file = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
    if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
    const data = await fs.readFile(file);
    res.writeHead(200, { 'Content-Type': type[path.extname(file)] || 'application/octet-stream' }).end(data);
  } catch { res.writeHead(404).end(); }
});

(async () => {
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const browserType = process.env.TEST_BROWSER === 'webkit' ? webkit : chromium;
  const browser = await browserType.launch({ headless: true, ...(process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : {}) });
  const base = `http://127.0.0.1:${server.address().port}`;
  const results = [];
  if (output) await fs.mkdir(output, { recursive: true });

  async function fixture(options = {}) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce', ...options.context });
    const page = await context.newPage();
    page.setDefaultTimeout(6000);
    const posts = [];
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    // No test payload can reach Google, even when testing failures or retries.
    await context.route('**/*', async route => {
      const request = route.request();
      const url = new URL(request.url());
      if (url.hostname === 'script.google.com') {
        if (request.method() === 'POST') posts.push(request.postDataJSON());
        if (options.respond) return options.respond(route, posts.length);
        return route.fulfill({ contentType: 'application/json', body: '{"status":"success"}' });
      }
      if (url.hostname === 'openfpcdn.io') {
        if (options.fingerprint === 'blocked') return route.abort();
        const body = options.fingerprint === 'pending'
          ? 'export function load(){return new Promise(()=>{})}'
          : 'export function load(){return Promise.resolve({get:()=>new Promise(r=>setTimeout(()=>r({visitorId:"local-test"}),250))})}';
        return route.fulfill({ contentType: 'text/javascript', body });
      }
      if (url.origin === base) return route.continue();
      if (options.realLenis && url.hostname === 'unpkg.com') return route.continue();
      return route.abort();
    });
    return { page, context, posts, errors };
  }

  async function test(name, run) {
    if (process.env.TEST_FILTER && !new RegExp(process.env.TEST_FILTER).test(name)) return;
    try { await run(); results.push({ name, status: 'pass' }); console.log(`PASS ${name}`); }
    catch (error) { results.push({ name, status: 'fail', error: error.stack }); console.error(`FAIL ${name}: ${error.message}`); }
  }

  async function fill(page, attendance = 'accept', guest = 'just_me') {
    await page.locator('#guest-fullname').fill('Local Test Guest');
    await page.locator(`label[for="rsvp-${attendance}"]`).click();
    if (attendance === 'accept') {
      await page.locator(`label[for="guest-${{ just_me: 'just-me', plus_one: 'plus-one', family: 'family' }[guest]}"]`).click();
      if (guest === 'family') await page.locator('#family-guest-count').fill('4');
    }
  }

  async function success(page) {
    await page.waitForFunction(() => document.querySelector('#rsvp-success-panel').classList.contains('panel-active'));
    await page.waitForFunction(() => getComputedStyle(document.querySelector('.success-message-card')).opacity === '1');
    assert.equal(await page.locator('form').evaluate(e => getComputedStyle(e).display), 'none');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'rsvp-success-panel');
    const clipped = await page.locator('.success-message-card').evaluate(e => {
      const r = e.getBoundingClientRect(), p = e.closest('.rsvp-card').getBoundingClientRect();
      return r.top < p.top - 1 || r.bottom > p.bottom + 1 || e.scrollWidth > e.clientWidth + 1;
    });
    assert.equal(clipped, false, 'Confirmation must fit inside its container');
  }

  try {
    await test('Accept / Decline / Accept and family changes remain usable', async () => {
      const { page, context } = await fixture();
      try {
        await page.goto(base);
        assert.equal(await page.locator('#guest-just-me').isEnabled(), false);
        for (const guest of [null, 'just-me', 'plus-one', 'family']) {
          await page.locator('label[for="rsvp-accept"]').click();
          if (guest) await page.locator(`label[for="guest-${guest}"]`).click();
          await page.locator('label[for="rsvp-decline"]').click();
          assert.equal(await page.locator('#guest-just-me').isEnabled(), false);
          await page.locator('label[for="rsvp-accept"]').click();
          assert.ok(await page.locator('#expanded-details-container').evaluate(e => e.clientHeight > 100));
          assert.equal(await page.locator('#family-guest-count').isEnabled(), guest === 'family');
        }
      } finally { await context.close(); }
    });

    await test('Invalid fields focus visibly; family counts must be whole numbers', async () => {
      const { page, context, posts } = await fixture();
      try {
        await page.goto(base);
        await page.locator('#rsvp-submit-btn').click();
        assert.equal(await page.evaluate(() => document.activeElement.id), 'guest-fullname');
        assert.equal(await page.locator('#guest-fullname').getAttribute('aria-invalid'), 'true');
        await fill(page, 'accept', 'family');
        for (const value of ['', '2', '3.9', '16']) {
          await page.locator('#family-guest-count').fill(value);
          await page.locator('#rsvp-submit-btn').click();
          assert.equal(await page.locator('#family-guest-count').getAttribute('aria-invalid'), 'true');
        }
        assert.equal(posts.length, 0);
        await page.locator('#family-guest-count').fill('3');
        assert.equal(await page.locator('#family-guest-count').getAttribute('aria-invalid'), null);
        await page.locator('#rsvp-submit-btn').click();
        await success(page);
        assert.equal(posts[0].totalGuests, 3);
      } finally { await context.close(); }
    });

    await test('Repeated submits during fingerprinting send exactly one request', async () => {
      const { page, context, posts } = await fixture();
      try {
        await page.goto(base); await fill(page);
        await page.evaluate(() => { const form = document.querySelector('form'); form.requestSubmit(); form.requestSubmit(); form.requestSubmit(); });
        assert.equal(await page.locator('form').getAttribute('aria-busy'), 'true');
        await success(page); assert.equal(posts.length, 1);
      } finally { await context.close(); }
    });

    for (const fingerprint of ['blocked', 'pending']) {
      await test(`A ${fingerprint} fingerprint cannot block RSVP`, async () => {
        const { page, context, posts, errors } = await fixture({ fingerprint });
        try {
          await page.goto(base); await fill(page, 'decline');
          await page.locator('#rsvp-submit-btn').click(); await success(page);
          assert.equal(posts[0].visitorId, 'unknown'); assert.deepEqual(errors, []);
        } finally { await context.close(); }
      });
    }

    await test('Retry after a lost response and reload reuses its submission ID', async () => {
      const { page, context, posts } = await fixture({ respond: (route, count) => count === 1 ? route.abort('failed') : route.fulfill({ contentType: 'application/json', body: '{"status":"success"}' }) });
      try {
        await page.goto(base); await fill(page);
        await page.locator('#rsvp-submit-btn').click();
        await page.locator('#rsvp-status').waitFor({ state: 'visible' });
        await page.reload(); await fill(page);
        await page.locator('#rsvp-submit-btn').click(); await success(page);
        assert.equal(posts.length, 2);
        assert.equal(posts[0].submissionId, posts[1].submissionId);
        assert.equal(posts[0].timestamp, posts[1].timestamp);
      } finally { await context.close(); }
    });

    await test('Changed answers get a new ID; safe server-busy message is shown', async () => {
      const { page, context, posts } = await fixture({ respond: route => route.fulfill({ contentType: 'application/json', body: '{"status":"error","error":"Server busy, try again."}' }) });
      try {
        await page.goto(base); await fill(page);
        await page.locator('#rsvp-submit-btn').click();
        await page.locator('#rsvp-status').waitFor({ state: 'visible' });
        assert.equal(await page.locator('#rsvp-status').textContent(), 'Server busy, try again.');
        await page.locator('label[for="rsvp-decline"]').click();
        await page.locator('#rsvp-submit-btn').click();
        await page.locator('#rsvp-status').waitFor({ state: 'visible' });
        assert.notEqual(posts[0].submissionId, posts[1].submissionId);
      } finally { await context.close(); }
    });

    for (const body of ['<html>Access denied</html>', 'null', '{"status":"error","message":"Secret internal stack trace"}']) {
      await test(`Unexpected response is recoverable: ${body.slice(0, 32)}`, async () => {
        const { page, context } = await fixture({ respond: route => route.fulfill({ contentType: 'application/json', body }) });
        try {
          await page.goto(base); await fill(page);
          await page.locator('#rsvp-submit-btn').click();
          await page.locator('#rsvp-status').waitFor({ state: 'visible' });
          assert.equal(await page.locator('#rsvp-submit-btn').isEnabled(), true);
          assert.doesNotMatch(await page.locator('#rsvp-status').textContent(), /Secret|SyntaxError|stack/);
        } finally { await context.close(); }
      });
    }

    await test('Timeout includes stalled JSON after response headers', async () => {
      slowBodyStarted = false;
      const { page, context } = await fixture();
      try {
        await page.addInitScript(target => {
          const networkFetch = window.fetch;
          window.fetch = (url, options) => networkFetch(String(url).includes('script.google.com') ? target : url, options);
        }, base + '/slow-body');
        await page.goto(base); await fill(page);
        await page.clock.install();
        await page.locator('#rsvp-submit-btn').click();
        await page.clock.runFor(400);
        for (let i = 0; i < 50 && !slowBodyStarted; i++) await new Promise(resolve => setTimeout(resolve, 20));
        assert.equal(slowBodyStarted, true);
        await page.clock.fastForward(11000);
        await page.locator('#rsvp-status').waitFor({ state: 'visible' });
        assert.match(await page.locator('#rsvp-status').textContent(), /in time/);
        assert.equal(await page.locator('#rsvp-submit-btn').isEnabled(), true);
      } finally { await context.close(); }
    });

    await test('Blocked session storage still permits an RSVP', async () => {
      const { page, context } = await fixture();
      try {
        await page.addInitScript(() => Object.defineProperty(window, 'sessionStorage', { get() { throw new DOMException('Blocked', 'SecurityError'); } }));
        await page.goto(base); await fill(page); await page.locator('#rsvp-submit-btn').click(); await success(page);
      } finally { await context.close(); }
    });

    for (const [attendance, guest, count] of [['accept', 'just_me', 1], ['accept', 'plus_one', 2], ['accept', 'family', 4], ['decline', null, 0]]) {
      await test(`Correct payload and readable confirmation: ${attendance} / ${guest}`, async () => {
        const { page, context, posts } = await fixture({ context: { viewport: { width: 320, height: 568 } } });
        try {
          await page.goto(base); await fill(page, attendance, guest);
          await page.locator('#rsvp-submit-btn').click(); await success(page);
          assert.equal(posts[0].attendance, attendance); assert.equal(posts[0].guestType, guest); assert.equal(posts[0].totalGuests, count);
          if (output) await page.screenshot({ path: path.join(output, `success-${attendance}-${guest}.png`) });
        } finally { await context.close(); }
      });
    }

    for (const [width, height] of [[320,568], [390,844], [430,932], [480,800], [768,1024], [844,390], [1024,768], [1440,900], [2560,1440]]) {
      await test(`Layout and images at ${width}x${height}`, async () => {
        const { page, context, errors } = await fixture({ context: { viewport: { width, height }, reducedMotion: 'no-preference', isMobile: width <= 1024 } });
        try {
          await page.goto(base);
          for (const section of ['welcome-section', 'details-section', 'map-section', 'rsvp-section']) {
            await page.locator('#' + section).scrollIntoViewIfNeeded();
            await page.waitForTimeout(1100);
            assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
            if (section === 'rsvp-section') {
              assert.ok(await page.locator('.rsvp-form-col').evaluate(e => e.clientWidth >= 270));
              if (width <= 1024) {
                const covers = await page.locator('#rsvp-section .rsvp-full-bleed-image').evaluate(e => {
                  const r = e.getBoundingClientRect();
                  return r.x <= 0 && r.y <= 0 && r.right >= innerWidth && r.bottom >= innerHeight && getComputedStyle(e).opacity === '1';
                });
                assert.equal(covers, true, 'Mobile background must cover the viewport');
              }
            }
            if (output && [390,1440,2560].includes(width)) await page.screenshot({ path: path.join(output, `${section}-${width}.png`) });
          }
          await fill(page, 'accept', 'family');
          const overflow = await page.locator('.rsvp-form-col').evaluate(e => [...e.querySelectorAll('h2,.toggle-label,.btn-submit')].filter(el => el.scrollWidth > el.clientWidth + 1).map(el => el.textContent.trim()));
          assert.deepEqual(overflow, []);
          assert.deepEqual(errors, []);
        } finally { await context.close(); }
      });
    }

    await test('A missing visual module does not disable the form', async () => {
      const { page, context } = await fixture();
      try {
        await page.route('**/webgl-handler.js', route => route.abort());
        await page.goto(base); await fill(page); await page.locator('#rsvp-submit-btn').click(); await success(page);
      } finally { await context.close(); }
    });

    await test('JavaScript disabled leaves readable content and cannot send a native GET', async () => {
      const { page, context } = await fixture({ context: { javaScriptEnabled: false } });
      try {
        await page.goto(base);
        assert.equal(await page.locator('.section-inner').first().evaluate(e => getComputedStyle(e).filter), 'none');
        assert.equal(await page.locator('#rsvp-submit-btn').isEnabled(), false);
        assert.equal(await page.locator('noscript').isVisible(), true);
      } finally { await context.close(); }
    });

    await test('Reduced motion skips WebGL, smooth scrolling and success particles', async () => {
      const { page, context } = await fixture();
      try {
        await page.goto(base);
        assert.equal(await page.evaluate(() => Boolean(AppInstance.lenis || AppInstance.webgl.gl)), false);
        await fill(page); await page.locator('#rsvp-submit-btn').click(); await success(page);
        assert.equal(await page.locator('.rsvp-card canvas').count(), 0);
      } finally { await context.close(); }
    });

    await test('WebGL failure and context loss retain an image and stop rendering', async () => {
      const { page, context } = await fixture({ context: { viewport: { width: 1440, height: 900 }, isMobile: false, reducedMotion: 'no-preference' } });
      try {
        await page.goto(base);
        await page.waitForFunction(() => AppInstance.webgl.firstFrameRendered || AppInstance.webgl.renderDisabled);
        const hadWebGL = await page.evaluate(() => Boolean(AppInstance.webgl.gl));
        if (hadWebGL) {
          const pixels = await page.evaluate(() => {
            const handler = AppInstance.webgl; handler.tick(); const gl = handler.gl;
            const pixel = new Uint8Array(4); gl.readPixels(Math.floor(gl.drawingBufferWidth / 2), Math.floor(gl.drawingBufferHeight / 2), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
            return [...pixel];
          });
          assert.ok(pixels[3] > 0 && pixels.slice(0,3).some(value => value > 0), 'Canvas must render actual pixels');
          await page.evaluate(() => AppInstance.webgl.gl.getExtension('WEBGL_lose_context')?.loseContext());
        } else {
          await page.evaluate(() => AppInstance.webgl.displayFallback());
        }
        await page.waitForFunction(() => AppInstance.webgl.renderDisabled);
        await page.waitForTimeout(650);
        assert.equal(await page.locator('#webgl-canvas').evaluate(e => getComputedStyle(e).visibility), 'hidden');
        assert.equal(await page.locator('#fallback-images-container').evaluate(e => getComputedStyle(e).opacity), '1');
      } finally { await context.close(); }
    });

    await test('Failed venue or RSVP image keeps the previous loaded background', async () => {
      const { page, context } = await fixture();
      try {
        await page.route('**/assets/venue-new-bg.jpg', route => route.abort());
        await page.route('**/assets/rsvp-image.jpg', route => route.abort());
        await page.goto(base); await page.locator('#rsvp-section').scrollIntoViewIfNeeded();
        await page.waitForTimeout(100);
        assert.equal(await page.locator('#fallback-images-container').evaluate(e => getComputedStyle(e).opacity), '1');
        assert.equal(await page.locator('.image-phase-active').count(), 0);
      } finally { await context.close(); }
    });

    await test('Rapid first/second scrolls always retain an opaque image', async () => {
      const { page, context } = await fixture({ context: { reducedMotion: 'no-preference' } });
      try {
        await page.goto(base);
        await page.waitForFunction(() => [...document.querySelectorAll('.fallback-image')].every(img => img.complete && img.naturalWidth > 0));
        const stable = await page.evaluate(async () => {
          const threshold = document.querySelector('#welcome-section').offsetHeight - innerHeight * 0.5;
          for (let i = 0; i < 30; i++) {
            window.scrollTo(0, threshold + (i % 2 ? 90 : -90));
            await new Promise(requestAnimationFrame);
            const image = document.querySelector('#fallback-img-4');
            if (getComputedStyle(image).opacity !== '1' || getComputedStyle(image).display === 'none') return false;
          }
          return true;
        });
        assert.equal(stable, true);
      } finally { await context.close(); }
    });

    await test('Text at 200 percent remains usable on a small phone', async () => {
      const { page, context } = await fixture({ context: { viewport: { width: 320, height: 568 } } });
      try {
        await page.goto(base);
        await page.addStyleTag({ content: 'html { font-size: 200%; }' });
        const clipped = await page.locator('#rsvp-section').evaluate(e => [...e.querySelectorAll('h2,.btn-submit,.toggle-label')].filter(el => el.scrollWidth > el.clientWidth + 1).map(el => el.textContent.trim()));
        assert.deepEqual(clipped, [], 'Large text must fit in controls, not just the page');
        await fill(page, 'decline'); await page.locator('#rsvp-submit-btn').click(); await success(page);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
        if (output) await page.screenshot({path:path.join(output, 'text-200-percent.png')});
      } finally { await context.close(); }
    });

    await test('Keyboard focus is visible and skips collapsed guest questions', async () => {
      const { page, context } = await fixture();
      try {
        await page.goto(base);
        await page.locator('#guest-fullname').focus();
        await page.keyboard.press('Tab');
        assert.equal(await page.evaluate(() => document.activeElement.id), 'rsvp-accept');
        assert.equal(await page.locator('label[for="rsvp-accept"]').evaluate(e => getComputedStyle(e).outlineStyle), 'solid');
        await page.keyboard.press('Tab');
        assert.equal(await page.evaluate(() => document.activeElement.id), 'rsvp-submit-btn');
      } finally { await context.close(); }
    });

    if (process.env.AXE_SCRIPT) await test('Automated accessibility scan across all sections and expanded RSVP', async () => {
      const { page, context } = await fixture();
      try {
        await page.goto(base);
        await page.addScriptTag({ path: process.env.AXE_SCRIPT });
        const violations = [];
        for (const section of ['welcome-section', 'details-section', 'map-section', 'rsvp-section']) {
          await page.locator('#' + section).scrollIntoViewIfNeeded();
          if (section === 'rsvp-section') await fill(page, 'accept', 'family');
          const result = await page.evaluate(async selector => (await axe.run(selector, {runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}})).violations, '#' + section);
          violations.push(...result.map(item => ({rule:item.id,impact:item.impact,nodes:item.nodes.map(node=>({target:node.target,summary:node.failureSummary}))})));
        }
        if (output) await fs.writeFile(path.join(output, 'accessibility.json'), JSON.stringify(violations,null,2));
        assert.deepEqual(violations, []);
      } finally { await context.close(); }
    });

    await test('A two-dimensional canvas failure cannot block submission or success', async () => {
      const { page, context } = await fixture({ context: { reducedMotion: 'no-preference' } });
      try {
        await page.addInitScript(() => {
          const original = HTMLCanvasElement.prototype.getContext;
          HTMLCanvasElement.prototype.getContext = function(type, ...args) { return type === '2d' ? null : original.call(this, type, ...args); };
        });
        await page.goto(base); await fill(page); await page.locator('#rsvp-submit-btn').click(); await success(page);
      } finally { await context.close(); }
    });
  } finally {
    if (output) await fs.writeFile(path.join(output, 'results.json'), JSON.stringify(results, null, 2));
    await browser.close();
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
  console.log(`${results.filter(result => result.status === 'pass').length}/${results.length} passed`);
  if (results.some(result => result.status === 'fail')) process.exitCode = 1;
})().catch(error => { console.error(error); server.closeAllConnections(); server.close(); process.exitCode = 1; });
