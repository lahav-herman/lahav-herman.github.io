# apps/

Live, in-browser projects hosted directly on this site — built in plain HTML/CSS/JS, no
build step. Each one gets its own self-contained folder:

```
apps/
└── <slug>/
    ├── index.html
    ├── style.css   (or whatever the app needs — fully independent of the main site's CSS)
    └── script.js
```

Link each new app from the "Web Apps" grid on [`index.html`](../index.html#apps). Apps
don't share `assets/css/style.css` with the rest of the site — they're free to look
however fits them, as long as they roughly follow the same monochrome palette.

## Live apps

None yet.
