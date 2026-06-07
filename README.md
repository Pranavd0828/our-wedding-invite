# The Landscape of Us

**A Premium Digital Wedding RSVP & Itinerary Experience**
Designed for the wedding celebration of Pranav & Prajakta.

This project is a bespoke, single-page wedding invitation and RSVP portal that blends modern web technologies with a highly crafted editorial aesthetic. It relies on vanilla HTML/CSS/JS to achieve blistering performance and leverages WebGL and smooth scrolling for a premium, native-app feel.

---

## 🎨 Design Philosophy
The site follows a strict editorial layout, evoking the feeling of a high-end magazine printed on thick textured paper. 
*   **Typography:** Cormorant Garamond (Serif) for elegant display titles and Outfit (Sans-Serif) for crisp, legible UI elements.
*   **Color Palette:** Rooted in nature - warm beige papers, rich olive greens, deep charcoal inks, and subtle gold accents.
*   **Motion:** Cinematic and intentional. No jarring animations; instead, elements elegantly crossfade, blur, and scale into place in response to the user's scroll position.

## 🏗 Architecture & Features

### 1. WebGL Texture Crossfading
The background visuals of the Welcome and Festivities sections are powered by a custom WebGL fragment shader (`webgl-handler.js`). 
*   Instead of standard CSS image opacity, the site uses GLSL shaders to mathematically mix two images (`image-4.jpg` and `image-3.jpg`) based on the exact scroll percentage.
*   A localized "watercolor edge" algorithm introduces slight visual distortion during the transition, simulating pigment bleeding into paper.

### 2. Smooth Scrolling (Lenis)
Native scrolling is intercepted and managed via [Lenis](https://lenis.studiofreight.com/). 
*   Ensures a velvety smooth, continuous scroll experience on both desktop and trackpads.
*   The `app.js` module hooks into Lenis' `requestAnimationFrame` loop to trigger dynamic `.active-phase` classes on DOM elements exactly when they cross strict viewport thresholds.

### 3. Persistent Split-Screen Layout
To create an immersive editorial frame, the right side of the screen is strictly managed as a persistent, fixed-position visual canvas.
*   As the user scrolls, the left side (text and timelines) scrolls normally.
*   The right side (WebGL canvas, Google Map, and RSVP photo) remains statically pinned in place, elegantly crossfading content as new sections become active.
*   All visual elements perfectly share the same `740 / 1055` portrait aspect ratio.

### 4. Static Venue Illustration
The Venue section features a beautifully composed static image layout instead of an interactive map.
*   **Aesthetics:** Removing external map UI ensures the layout matches the exact visual styling (zoom cropping and aspect ratios) of the other editorial sections without injected UI controls breaking the design.
*   **Responsive Breakpoints:** The layout relies on strict media queries. Devices up to 1024px (including iPad Pro in portrait mode) use the centered, full-bleed mobile layout, while wider screens snap into the elegant split-screen desktop frame.

### 5. Dynamic HTML5 Audio
A hidden `<audio>` element (controlled via `AudioHandler`) provides a subtle ambient soundtrack.
*   Controlled by a bespoke "SOUND: OFF" toggle button pinned to the bottom right of the viewport.

### 6. Google Apps Script Backend Integration
RSVP submissions are securely written to a private Google Sheet.
*   **Realtime Submissions:** The `FormHandler` intercepts the native `<form>` submission, prevents default routing, and pushes the payload directly to a Google Apps Script Web App URL via a fetch request.
*   **Success State:** Upon successful write, the form elegantly transitions into a custom "Thank You" confirmation panel without triggering a page reload.

---

## 📁 File Structure
*   `index.html` - The master DOM structure. Contains the strict layout grid, WebGL fallback canvases, and all section content.
*   `index.css` - The complete design system. Houses all custom CSS properties, flex/grid rules, micro-interactions, and Z-index layering.
*   `app.js` - The global application orchestrator. Initializes Lenis and tracks scroll position to dispatch phase updates to children.
*   `webgl-handler.js` - The GLSL shader compiler and WebGL context manager for the background image transitions.
*   `form-handler.js` - Client-side validation and Google Apps Script interaction logic for the RSVP form.
*   `audio-handler.js` - Lightweight controller for the ambient background track.

---

## 🚀 Local Development
Because of the WebGL cross-origin texture requirements, this site **cannot** be run by double-clicking the `index.html` file. It must be served via a local web server.

1. Ensure you have `npx` installed.
2. Run the site locally:
   ```bash
   npx http-server . -p 8080
   ```
3. Open `http://localhost:8080` in your browser.
