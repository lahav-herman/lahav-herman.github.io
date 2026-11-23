# lahav-herman.github.io

My GitHub Pages portfolio — plain HTML/CSS/JS, no build step.

## Folder map

```
├── index.html          # Home — hero mark (LAHAV.svg / HERMAN.svg), full project write-ups, web apps grid
├── files.html           # Index of general-purpose downloads
├── apps/                 # Live HTML+JS+CSS projects hosted on this site (see apps/README.md)
├── files/                # General-purpose downloads, unrelated to specific projects (see files/README.md)
└── assets/               # Shared css/js/img for the main site pages, incl. the LAHAV/HERMAN typography marks
```

Projects are written up directly on `index.html` (no separate page per project) — add a
new one as another `<article class="project">` section there.

The hero mark (`assets/img/LAHAV.svg` and `assets/img/HERMAN.svg`) comes from
[lahav-herman/atypography](https://github.com/lahav-herman/atypography) — update those
files there and re-copy them here if the mark changes.

Adding a new in-browser app: one folder in `apps/`, one card under the "Web Apps" section
of `index.html`.
