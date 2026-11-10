# Ralgo on GitHub Pages

The Ralgo exhibition, interactive works, collection galleries and briefings. This repository, **dali1986/Ralgo-web**, publishes to **https://ralgo.art** through GitHub Pages.

## How it publishes

Every push to `main` runs the **Publish Ralgo website** workflow (`.github/workflows/pages.yml`). It runs `npm run build`, which writes the complete site into `_site/`, and deploys that folder. Nothing else is published.

These are written by the build and are not committed:

- `_site/`
- `website/index.html`, built from `templates/home.html`
- `website/blog/` and `website/feed.xml`, built from `content/posts/`
- `tools/blog-generated.json`

Edit the sources, not the generated pages.

## Local preview

Install Node.js 22 or newer and Python 3.10 or newer. There are no npm dependencies. Share cards need Pillow:

```bash
python3 -m pip install -r tools/requirements-images.txt
npm run build
python3 -m http.server 8000 --directory _site
```

Open `http://localhost:8000/`. Any static HTTP server can serve `_site/` instead. Opening the HTML directly with `file://` will not load the catalogue or the JavaScript modules.

The build stops with an error if a local link, image, share card or catalogue preview is missing.

The build reads `PAGES_BASE_PATH` for sites served from a repository subfolder, and GitHub sets it automatically. For ralgo.art it is empty. A subfolder build (`PAGES_BASE_PATH=/name npm run build`) currently fails validation on the Temper page, whose share image path is fixed at the site root.

## Edit the exhibition

| File | Purpose |
| --- | --- |
| `templates/home.html` | Homepage layout and text, plus the Experiments and Compositions views |
| `website/styles.css` | Exhibition styling |
| `website/vulnerable-worlds.css` | The opening Vulnerable Worlds section |
| `website/blog.css` | Briefing archive and article styling |
| `website/app.js` | Galleries, pairing, collection order and viewer |
| `website/works.js` | Featured artwork descriptions and interactive links |
| `website/collection-meta.js` | Collection titles and descriptions |
| `website/data/catalogue.json` | All collection items, names and Seasky/Aria pairings |
| `website/art/`, `website/works/` | The living works themselves |
| `website/assets/` | Featured images, films and brand marks |
| `website/artworks/` | Cached collection previews |
| `website/404.html` | The not-found page |
| `content/posts/` | Briefings in Markdown |
| `tools/site-header.mjs` | The header used by the blog, the collection directory and the not-found page |
| `tools/build-*.mjs` | The page builders |

The homepage keeps its own copy of the navigation in `templates/home.html`, because it also carries the work index button. If you change the links, change them in both places.

## Add a briefing

Copy `content/POST-TEMPLATE.md` to a new Markdown file inside `content/posts/`. Edit its title, date, slug, excerpt and body, then commit it to `main`. This can be done in GitHub's file editor.

Each commit rebuilds the archive, the article pages, the three latest briefings on the homepage and `/feed.xml`.

- **Cover:** add the image to `website/assets/` and set `cover` to `/assets/your-image.png`. Keep the path rooted at `/`. A post without a cover is shown as a plain text card.
- **Video:** set `video` to a local MP4 or WebM in `/assets/`.
- **Slug:** use a stable lowercase slug such as `a-new-week-of-art-and-technology`. It becomes the article's permanent address.

Keep unpublished work in a local `content/drafts/` folder, which Git ignores. To remove a published article, move its Markdown out of `content/posts/` and commit. The text remains in Git history.

## What the build adds

- Every collection and numbered work gets a static, shareable URL under `/collections/`. Featured works have pages under `/works/`. The exhibition enhances these links with its viewer, and old hash links still resolve.
- Open Graph and Twitter tags, canonical links, JSON-LD, `sitemap.xml` and `robots.txt`.
- 1200 × 630 share cards in `_site/assets/share/`, showing the complete artwork on the gallery's dark background. Paired Seasky cards contain both images.
- Share tags for Vulnerable Worlds and Sage, which keep their own pages. Vulnerable Worlds embeds its typefaces at the top of the page, so its tags are placed ahead of them, where link previews will read them.
- Redirect pages for addresses from the earlier WordPress site. The list is `moved` in `tools/build-collections.mjs`.
- A small return link on the living works. Their renderer source stays intact.
- Content-based filenames for display images and interface assets. Cache lifetimes are controlled by GitHub Pages.

## Contact and analytics

`site-settings.json` holds two public settings.

- `contactEmail`: the public email. The build places a mailto link and "Commissions, exhibitions and press enquiries." in About, the exhibition footer and the briefing footers. Leave it empty to show no contact block.
- `goatcounterEndpoint`: the exact `https://SITECODE.goatcounter.com/count` value from the GoatCounter installation snippet. No API key is needed. Leave it empty to load no tracking script.

GoatCounter loads only on `ralgo.art` and `www.ralgo.art`. Local copies and embedded artwork previews are excluded. It counts pageviews, including gallery navigation without a page reload, and `contact-about` / `contact-footer` clicks. Those clicks mean an email link was opened, not that an enquiry was sent. Page paths exclude query strings and ordinary anchors, and referrers are limited to the referring origin.

References: [Getting started](https://www.goatcounter.com/help/start), [JavaScript API](https://www.goatcounter.com/help/js), [Single-page apps](https://www.goatcounter.com/help/spa).

## Collection previews

Run `python3 tools/audit-thumbnails.py` to review suspicious previews (requires Pillow). Nine Overgrowth entries have source signing placeholders and are marked `previewStatus: "unavailable"`. The gallery keeps their titles and Verse links without showing those placeholders. Replace their local image files and remove that status when verified previews become available. The build flags newly added images smaller than 5 KB for review.

Overgrowth #5 was recovered from its recorded hash using the artist-supplied sketch. See the [recovery provenance](tools/overgrowth-recovery.json) and the [reproduction tool](tools/overgrowth/README.md).

Original full-resolution collection images and minted token renderers use their original external destinations. This repository holds the website and its cached previews, not every full-resolution image.

## Credits

Harvey Rayner is the primary artist for Quasi Dragon Studies, with Ralgo credited for the compositions. QQL is by Tyler Hobbs and Dandelion Mané; QQL #325 was explored, selected and minted by Ralgo. Existing Art Blocks, Verse and artist links remain in place.

## Sage

`integrations/sage/` holds the Sage page source and its Cloudflare Worker. See [its README](integrations/sage/README.md).

## Domain

The custom domain is set under the repository's **Settings → Pages**. Run **Publish Ralgo website** again after changing it, so the output uses the new base address.

## Left over from the original export

`PUBLISH-TO-GITHUB.sh` and `EXPORT-MANIFEST.json` came with the export this repository was created from. The script creates a separate new repository and is not used by this site. Neither file is read by the build.

## Hosting references

- [Configure GitHub Pages publishing](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)
- [Use custom workflows with GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)
- [Configure a custom domain](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site)
