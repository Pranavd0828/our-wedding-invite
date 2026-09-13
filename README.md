# Prajakta weds Pranav

A static wedding invitation and RSVP site for December 11-12, 2026, at Sorina Hillside Resort, Pune.

Live site: https://pranavd0828.github.io/our-wedding-invite/

## Project structure

- `docs/`: the public GitHub Pages site, including HTML, CSS, JavaScript and image assets.
- `docs/app.js`: scroll state, section transitions and optional Lenis smooth scrolling.
- `docs/webgl-handler.js`: desktop image rendering, with DOM image fallbacks on phones, tablets, reduced-motion settings or WebGL failure.
- `docs/form-handler.js`: conditional RSVP questions, client validation, submission and confirmation.
- `tests/invitation.cjs`: browser regression checks. Every RSVP request is intercepted; test guests never reach the live sheet.

There is no build step, audio player or interactive map. The venue address links to Google Maps. GitHub Pages should publish `main` / `docs`, with no custom domain required.

## Local preview

Serve the site over HTTP so WebGL textures work:

```sh
python3 -m http.server 8080 --bind 127.0.0.1 --directory docs
```

Open http://127.0.0.1:8080. An occupied port can be replaced with another number.

## Browser tests

Use a supported Node.js LTS release:

```sh
npm ci
npx playwright install chromium
npm test
```

For the WebKit engine, install it with `npx playwright install webkit` and run `TEST_BROWSER=webkit npm test`. `BROWSER_EXECUTABLE` can select an installed browser executable; `TEST_OUTPUT_DIR` enables screenshots and a JSON results file. These checks emulate screen sizes and browser behavior; they do not replace a physical iPhone/Safari check for toolbar resizing, the software keyboard or GPU flicker.

## RSVP behavior

The form locks before asynchronous work and gives the full request, including reading JSON, a ten-second deadline. Optional fingerprint lookup has a separate 1.5-second limit. An unchanged retry reuses its submission ID, including after reload in the same tab where session storage is available. Changing answers creates a new submission. A timeout does not prove that the server failed to save the response.

The payload retains `fullName`, `attendance`, `guestType`, `totalGuests`, `timestamp`, `submissionId`, `hp` and `visitorId`. The client validates the name and whole-number family counts, but client validation is not a security boundary.

## Backend and privacy

The deployed Google Apps Script and spreadsheet are maintained separately and are not in this repository. Client tests cannot establish whether the live backend enforces schema validation, formula safety, locking, rate limits or idempotency. Verify those rules in the deployed script, especially that deduplication uses `submissionId` and does not prevent different guests sharing one device from replying.

The web-app endpoint is necessarily public in the browser. The honeypot and fingerprint are not authentication or complete spam protection. FingerprintJS loads third-party code and supplies a device identifier; its availability is optional for submission. Lenis is also optional. The unused gl-matrix dependency has been removed.

Session storage retains a pending submission signature and ID in the guest's tab until confirmed success; storage failures fall back to an in-memory ID. The served RSVP JPEG is about 260KB. The original PNG and previous artwork remain tracked, but are not requested by the page.

The repository itself is public. Publishing only `docs/` limits the website's files, not what is visible through GitHub or Git history. Keep private backend files, guest lists, credentials and raw personal documents outside the repository.
