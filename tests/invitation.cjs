const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { createServer } = require('node:http');
const { chromium, webkit } = require('playwright');

const root = path.resolve(__dirname, '../docs');
const output = process.env.TEST_OUTPUT_DIR;
const type = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
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
          assert.equal(await page.locator('#expanded-details-container').isVisible(), true);
          assert.equal(await page.locator('#expanded-details-container').evaluate(e => e.inert), false);
          assert.equal(await page.locator('#guest-just-me').isEnabled(), true);
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

    await test('Scientific notation preserves the validated family total', async () => {
      const { page, context, posts } = await fixture();
      try {
        await page.goto(base); await fill(page, 'accept', 'family');
        await page.locator('#family-guest-count').fill('1e1');
        await page.locator('#rsvp-submit-btn').click(); await success(page);
        assert.equal(posts[0].totalGuests, 10);
      } finally { await context.close(); }
    });

    await test('Damaged retry records are replaced before submission', async () => {
      const { page, context, posts } = await fixture();
      try {
        await page.addInitScript(() => sessionStorage.setItem('rsvp-pending', JSON.stringify({
          signature: JSON.stringify({fullName:'Local Test Guest',attendance:'decline',guestType:null,totalGuests:0,hp:''}),
          submissionId: '', timestamp: 'invalid'
        })));
        await page.goto(base); await fill(page, 'decline');
        await page.locator('#rsvp-submit-btn').click(); await success(page);
        assert.ok(posts[0].submissionId.length > 0);
        assert.ok(Number.isFinite(Date.parse(posts[0].timestamp)));
      } finally { await context.close(); }
    });

    await test('Repeated submits send exactly one request', async () => {
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
      await test(`Invitation layout, images and controls at ${width}x${height}`, async () => {
        const { page, context, errors } = await fixture({ context: { viewport: { width, height }, reducedMotion: 'no-preference', isMobile: width <= 1024 } });
        try {
          await page.goto(base);
          for (const section of ['welcome-section', 'story-title', 'details-section', 'map-section', 'rsvp-section']) {
            await page.locator('#' + section).scrollIntoViewIfNeeded();
            await page.waitForTimeout(250);
            assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
          }
          await page.waitForFunction(() => [...document.images].every(image => image.complete && image.naturalWidth > 0));
          assert.equal(await page.locator('canvas').count(), 0, 'There must be no cross-fading canvas backgrounds');
          await fill(page, 'accept', 'family');
          const clipped = await page.locator('#rsvp-section').evaluate(e => [...e.querySelectorAll('h2,.toggle-label,.btn-submit')].filter(el => el.scrollWidth > el.clientWidth + 1).map(el => el.textContent.trim()));
          assert.deepEqual(clipped, []);
          await page.locator('#family-guest-count').blur();
          await page.locator('#rsvp-submit-btn').click();
          await success(page);
          assert.deepEqual(errors, []);
          if (output) {
            await page.evaluate(() => window.scrollTo({top:0,behavior:'instant'}));
            await page.screenshot({path:path.join(output,`hero-${width}.png`)});
            await page.screenshot({path:path.join(output,`full-${width}.png`),fullPage:true});
          }
        } finally { await context.close(); }
      });
    }

    await test('Mobile RSVP bar reaches the form and clears typing fields', async () => {
      const {page, context} = await fixture();
      try {
        await page.goto(base);
        await page.locator('.mobile-rsvp-bar a').click();
        await page.waitForFunction(() => {
          const r=document.querySelector('#rsvp-section').getBoundingClientRect();
          return r.top >= 0 && r.top < innerHeight;
        });
        await page.locator('#guest-fullname').focus();
        assert.equal(await page.locator('.mobile-rsvp-bar').evaluate(e=>getComputedStyle(e).visibility), 'hidden');
        await page.locator('#guest-fullname').blur();
        await page.waitForFunction(()=>getComputedStyle(document.querySelector('.mobile-rsvp-bar')).visibility==='visible');
      } finally {await context.close();}
    });

    await test('Page references, local fonts and links are valid', async () => {
      const { page, context } = await fixture();
      const failed = [];
      page.on('response', response => {
        if (response.url().startsWith(base) && response.status() >= 400) failed.push(response.url());
      });
      try {
        await page.goto(base);
        await page.evaluate(() => document.fonts.ready);
        const issues = await page.evaluate(() => {
          const ids = [...document.querySelectorAll('[id]')].map(e => e.id);
          const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index);
          const missing = [...document.querySelectorAll('a[href^="#"]')].filter(a => !document.getElementById(a.hash.slice(1))).map(a => a.hash);
          const labels = [...document.querySelectorAll('[aria-labelledby], [aria-describedby]')].flatMap(e =>
            `${e.getAttribute('aria-labelledby') || ''} ${e.getAttribute('aria-describedby') || ''}`.trim().split(/\s+/).filter(id => id && !document.getElementById(id)));
          const fonts = [...document.fonts].filter(f => f.family.includes('Cormorant')).map(f => f.status);
          return { duplicateIds, missing, labels, fonts };
        });
        assert.deepEqual(issues, {duplicateIds: [], missing: [], labels: [], fonts: ['loaded', 'loaded']});
        assert.deepEqual(failed, []);
      } finally { await context.close(); }
    });

    await test('A missing initializer leaves a disabled form and recovery guidance', async () => {
      const { page, context } = await fixture();
      try {
        await page.route('**/app.js*', route => route.abort());
        await page.goto(base);
        assert.equal(await page.locator('#rsvp-submit-btn').isDisabled(), true);
        assert.equal(await page.locator('#rsvp-loading').isVisible(), true);
        await page.locator('#guest-fullname').fill('Local Test Guest');
        await page.locator('#guest-fullname').press('Enter');
        assert.equal(page.url(), base + '/');
      } finally { await context.close(); }
    });

    await test('A missing form module has visible recovery guidance', async () => {
      const {page, context} = await fixture();
      try {
        await page.route('**/form-handler.js*', route=>route.abort());
        await page.goto(base);
        assert.equal(await page.locator('#rsvp-submit-btn').isDisabled(), true);
        assert.equal(await page.locator('#rsvp-loading').isVisible(), true);
        assert.match(await page.locator('#rsvp-loading').textContent(), /refresh/i);
      } finally {await context.close();}
    });

    await test('JavaScript disabled retains readable content and prevents a native GET', async () => {
      const {page, context} = await fixture({context:{javaScriptEnabled:false}});
      try {
        await page.goto(base);
        assert.equal(await page.locator('h1').isVisible(),true);
        assert.equal(await page.locator('#rsvp-submit-btn').isDisabled(),true);
        assert.equal(await page.locator('noscript').isVisible(),true);
        await page.locator('#guest-fullname').fill('Local Test Guest');
        await page.locator('#guest-fullname').press('Enter');
        assert.equal(page.url(),base+'/');
      } finally {await context.close();}
    });

    await test('Failed artwork does not hide invitation text or stop RSVP', async () => {
      const {page,context,errors} = await fixture();
      try {
        await page.route('**/assets/**',route=>route.abort());
        await page.goto(base);
        assert.equal(await page.locator('h1').isVisible(),true);
        await fill(page,'decline');
        await page.locator('#rsvp-submit-btn').click();
        await success(page);
        assert.deepEqual(errors,[]);
      } finally {await context.close();}
    });

    await test('The invitation has no third-party animation dependency', async () => {
      const {page,context} = await fixture();
      const external=[];
      page.on('request',r=>{const url=new URL(r.url());if(url.origin!==base && url.hostname!=='openfpcdn.io')external.push(r.url());});
      try {
        await page.goto(base);
        await page.waitForTimeout(150);
        assert.deepEqual(external,[]);
      } finally {await context.close();}
    });

    await test('Reduced motion uses native immediate scrolling and confirmation', async () => {
      const {page,context} = await fixture();
      try {
        await page.goto(base);
        assert.equal(await page.evaluate(()=>getComputedStyle(document.documentElement).scrollBehavior),'auto');
        await fill(page);
        await page.locator('#rsvp-submit-btn').click();
        await success(page);
        assert.equal(await page.locator('canvas').count(),0);
      } finally {await context.close();}
    });

    await test('Text at 200 percent remains usable on a small phone', async () => {
      const {page,context} = await fixture({context:{viewport:{width:320,height:568}}});
      try {
        await page.goto(base);
        await page.addStyleTag({content:'html { font-size: 200%; }'});
        const clipped=await page.evaluate(()=>[...document.querySelectorAll('h1,h2,h3,.toggle-label,.btn-submit,.mobile-rsvp-bar')].filter(e=>e.scrollWidth>e.clientWidth+1).map(e=>e.textContent.trim()));
        assert.deepEqual(clipped,[]);
        assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
        await fill(page,'decline');await page.locator('#rsvp-submit-btn').click();await success(page);
        assert.ok(await page.evaluate(()=>document.querySelector('#success-title').getBoundingClientRect().top >= document.querySelector('.site-header').getBoundingClientRect().bottom), 'The confirmation heading must not hide behind navigation');
        if(output)await page.screenshot({path:path.join(output,'text-200-percent.png')});
      } finally {await context.close();}
    });

    await test('Radio focus is visible and arrow keys change attendance', async () => {
      const {page,context} = await fixture();
      try {
        await page.goto(base);
        await page.locator('#rsvp-accept').focus();
        await page.keyboard.press('ArrowRight');
        assert.equal(await page.locator('#rsvp-decline').isChecked(),true);
        assert.equal(await page.locator('label[for="rsvp-decline"]').evaluate(e=>getComputedStyle(e).outlineStyle),'solid');
        assert.equal(await page.locator('#guest-just-me').isDisabled(),true);
      } finally {await context.close();}
    });

    if (process.env.AXE_SCRIPT) await test('Accessibility scan of the full invitation and expanded form', async () => {
      const {page,context} = await fixture();
      try {
        await page.goto(base);
        await page.addScriptTag({path:process.env.AXE_SCRIPT});
        await fill(page,'accept','family');
        const violations=await page.evaluate(async()=>(await axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}})).violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))})));
        if(output)await fs.writeFile(path.join(output,'accessibility.json'),JSON.stringify(violations,null,2));
        assert.deepEqual(violations,[]);
      } finally {await context.close();}
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
