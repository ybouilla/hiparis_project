# Flags of the language selector

One SVG per country used in `src/languages.json` (public domain, from the `svg-country-flags` package).
They are plain static files, downloaded only when a flag is displayed (`src/Flag.js`): bundling a flag
library instead added 3.7 MB of JavaScript to every page.

Adding a language to `languages.json`? Copy its country's SVG here (the test `Flag.test.js` checks it).
