# Prajakta & Pranav: Our Forever Begins

A mobile-first wedding invitation for December 11 and 12, 2026, at Sorina Hillside Resort, Pune.

Public site: [GitHub Pages](https://pranavd0828.github.io/our-wedding-invite/).

## Experience

The homepage combines the Gateway of India, Pune, the Western Ghats, vada pav, bun maska, and cutting chai in custom watercolor artwork. A separate portrait-oriented composition keeps both cities visible on phones. The page continues through a text-only introduction, the celebrations, the venue, and RSVP. Couple photographs are not displayed or used in the link preview.

Mobile has a fixed RSVP action bar with safe-area padding. The bar hides during text entry so it does not compete with the software keyboard. Desktop has a sticky navigation header. Sections remain in normal document flow: no WebGL, scroll-triggered background crossfades, Lenis, or particle overlays.

The venue section is text-only. The Google Maps link and event information are retained from the previous invitation.

Headings use locally hosted Cormorant Garamond with serif fallbacks. Its open font license is included with the assets. Body text uses system fonts.

## Files And Hosting

- `docs/index.html`: invitation content, navigation, and accessible RSVP markup.
- `docs/index.css`: responsive layout and reduced-motion behavior.
- `docs/app.js`: form initialization, optional fingerprint initialization, and keyboard-aware mobile action bar.
- `docs/form-handler.js`: conditional questions, validation, timeout, retry identity, and submission.
- `docs/assets/`: locally served images, fonts, and Lucide icons, including font and icon licenses.
- `tests/invitation.cjs`: browser regression suite with intercepted RSVP requests.

There is no build step. GitHub Pages should publish the `docs` directory. The HTML can be opened locally for a visual preview. For an HTTP preview, run:

```sh
python3 -m http.server 8080 --bind 127.0.0.1 --directory docs
```

Use another port if 8080 is occupied. The Pages URL only changes after these files are committed, pushed, and deployed; a local preview is not a production deployment.

## RSVP And Spreadsheet Compatibility

The existing Google Apps Script endpoint and payload keys are unchanged: `fullName`, `attendance`, `guestType`, `totalGuests`, `timestamp`, `submissionId`, `hp`, and `visitorId`.

The redesign does not publish, upload, or read guest spreadsheets. Responses continue through the existing Google Sheets integration. No local Excel file acts as a public database.

The form locks before asynchronous work, validates whole-number family totals of 3 through 15, and gives the full network request and JSON parsing a ten-second deadline. The optional fingerprint lookup retains its 1.5-second limit and falls back to `unknown`. The external fingerprint script remains for compatibility with the existing integration; it is not needed for visual rendering or a successful submission.

An unchanged uncertain request reuses its submission ID in the same tab when session storage is available. Changed answers create a new ID. Success clears the pending ID. This is retry protection, not one-response-per-person enforcement. A timeout does not prove that the spreadsheet write failed. Server schema validation, formula handling, rate limits, deployment permissions, and deduplication remain responsibilities of the separately deployed backend.

Missing form code leaves visible recovery guidance and a disabled submit button. A confirmed response shows the success message immediately, without waiting for an animation.

## Verification

Use Node.js 20 or later:

```sh
npm ci
npx playwright install chromium webkit
npm test
TEST_BROWSER=webkit npm test
```

Optional environment variables:

- `BROWSER_EXECUTABLE`: use an installed browser executable.
- `TEST_OUTPUT_DIR`: save screenshots and machine-readable results outside the repository.
- `TEST_FILTER`: run matching test names only.
- `AXE_SCRIPT`: path to a local axe-core script to include an automated accessibility scan.

The suite covers mobile, tablet, landscape, and desktop layouts; artwork and font loading; page references; sticky RSVP navigation; focus behavior; enlarged text; reduced motion; failed scripts; offline responses; retry identity; damaged retry records; repeated taps; numeric conversion; conditional fields; and confirmation. Every RSVP request is mocked. Tests do not create live guest records or verify the deployed Apps Script source. Physical-phone checks are still needed for real software keyboards, browser chrome, and assistive technologies.

## Privacy

This is a public repository. Publishing only `docs` does not hide other committed files from GitHub. The local private backup folder, planning folders, separate relatives invitation, and recording are explicitly ignored. Keep guest lists, credentials, and backend administration files outside the public source wherever possible, and review staged files before committing.

Existing unused artwork remains available locally and in Git history. The new homepage uses optimized WebP artwork of approximately 115 KB on phones and 200 KB on desktops.
