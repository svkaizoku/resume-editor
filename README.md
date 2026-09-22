# Resume Editor

A dead-simple, browser-only resume editor. Edit your resume in a form on the left,
see a live A4 preview on the right, and export a clean PDF with one click.

No build step, no backend, no dependencies — just static HTML/CSS/JS.

**Live app:** https://svkaizoku.github.io/resume-editor/

## Why

Editing text inside a styled PDF (Enhancv, Canva, etc.) is painful — the text is stored
as positioned glyphs, not editable paragraphs, so tools can only overlay on top and the
layout breaks. This tool takes the opposite approach: your resume is **structured data**
(`resume-data.json`) rendered into a clean template. Editing the skills, experience, or any
text is just editing a form. Export re-renders a fresh, correct PDF every time.

## Use it

### Option A — hosted (easiest)
Open the live app link above. Edits autosave in your browser (localStorage).

### Option B — locally
`fetch()` of the seed JSON is blocked on `file://`, so run a tiny local server:

```bash
cd resume-editor
python3 -m http.server 8000
# then open http://localhost:8000
```

(Opening `index.html` directly still works, but it starts blank instead of loading the seed —
use Import JSON to load `resume-data.json`.)

## Editing

- **Text fields** (name, title, summary, dates…): type — the preview updates live.
- **Skills:** type a skill and press **Enter** to add a chip; click **×** to remove.
- **Experience / Education / Languages / Other sections:** use **+ Add** to add a block,
  **Remove** to delete one, **+ Add bullet / + Add item** for list entries.
- Everything **autosaves** to your browser. Refreshing keeps your edits.

## Save / share / reset

- **Export PDF** — opens the print dialog. Choose *Save as PDF*. Print CSS hides the editor and
  prints only the resume at A4. (Tip: turn off "Headers and footers" in the print dialog.)
- **Export JSON** — download your data as a `.json` backup.
- **Import JSON** — load a previously exported `.json` (or `resume-data.json`).
- **Reset** — discard local edits and reload the original seed.

## Files

| File | Purpose |
|------|---------|
| `index.html` | Page shell: toolbar + editor + preview panes |
| `styles.css` | Screen layout and the `@media print` A4 rules |
| `app.js` | State model, form + preview rendering, storage, import/export |
| `resume-data.json` | Seed content loaded on first run |

## Customize

- **Change the look:** edit the `.preview` rules in `styles.css` (fonts, spacing, colors).
- **Change the starting content:** edit `resume-data.json`, then use **Reset** to reload it.

## License

MIT — see [LICENSE](LICENSE).
