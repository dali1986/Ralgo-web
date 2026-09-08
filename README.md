# Ralgo on GitHub Pages

The Ralgo exhibition, interactive works, collection galleries and weekly briefings. This repository, **dali1986/Ralgo-web**, publishes to **https://ralgo.art** through GitHub Pages. Pushes to `main` run the existing **Publish Ralgo website** workflow.

## Current website

- Responsive WebP images serve What the Water Kept and QQL. The oversized original homepage files have been removed from the published site; earlier copies remain in Git history.
- Every collection and numbered work has a static, shareable URL under `/collections/`. Featured works have pages under `/works/`. The exhibition enhances these links with its existing viewer; old hash links still resolve.
- Open Graph and Twitter metadata, a favicon, canonical links, JSON-LD, `sitemap.xml` and `robots.txt` are generated during the build. Available collection and work previews receive 1200 × 630 JPEG share cards with complete artwork on the gallery’s dark background. Paired Seasky cards contain both images. Static pages and client navigation use the same card URLs.
- Weekly posts automatically update `/feed.xml` as well as the blog archive and homepage.
- Standalone living works get a small RALGO return link during the build. Their renderer source stays intact.
- The build gives display images and interface assets content-based filenames. Cache lifetimes are controlled by GitHub Pages.

Edit `templates/home.html` for the homepage, `website/collection-meta.js` for collection descriptions, and `website/data/catalogue.json` for individual works. `tools/build-collections.mjs` generates the collection and artwork pages into `_site`; these generated pages do not need to be committed separately.

Install image-build support with `python3 -m pip install -r tools/requirements-images.txt` before a local build (Python 3.10+). GitHub Actions installs it automatically. Share cards are generated into `_site/assets/share/` and do not need to be committed.

Run `python3 tools/audit-thumbnails.py` to review suspicious previews (requires Pillow). Nine Overgrowth entries currently have source signing placeholders and are marked `previewStatus: "unavailable"`; the gallery retains their titles and Verse links without displaying those placeholders. Replace their local image files and remove that status when verified artwork previews become available. The build flags newly added images smaller than 5 KB for review. Overgrowth #5 was recovered from its recorded hash using the artist-supplied sketch; see [recovery provenance](tools/overgrowth-recovery.json) and the [reproduction tool](tools/overgrowth/README.md).

## Publish

### Original export setup instructions

The following setup script is for creating a **separate new repository** from an export. For this existing website, commit and push to **dali1986/Ralgo-web** instead.

The included `PUBLISH-TO-GITHUB.sh` creates the public repository **Dali1986/ralgo-website**, uploads this exhibition, enables GitHub Pages, and starts and watches the deployment. It checks that GitHub CLI is signed in as Dali1986. If an unrelated repository already uses that name, it stops without changing it.

Install [GitHub CLI](https://cli.github.com/) and [Git](https://git-scm.com/downloads) if they are not already on your computer. On a Mac with Homebrew, GitHub CLI can be installed with `brew install gh`. Open Terminal in the extracted `ralgo-github-pages` folder and run:

```bash
bash PUBLISH-TO-GITHUB.sh
```

Sign in as **Dali1986** if prompted. The script requests GitHub's workflow permission because the repository includes an automatic publishing workflow. Once the deployment succeeds, it prints the actual website address; the expected default address is `https://dali1986.github.io/ralgo-website/`. Node.js is only needed for local previews; GitHub runs the production build.

This package has been prepared locally. The repository has **not** been created from this chat. Running the script performs the upload and publishing through your own GitHub account. Your artwork and website source will be visible in the public repository.

The script uses the official [GitHub repository command](https://cli.github.com/manual/gh_repo_create), [browser sign-in](https://cli.github.com/manual/gh_auth_login) and [Pages configuration API](https://docs.github.com/en/rest/pages/pages#create-a-github-pages-site).

### Manual setup

1. Create an empty GitHub repository, for example `ralgo-website`. Use a public repository for GitHub Free, or a private repository if your plan supports Pages from private repositories. Leave GitHub's initial README, licence and gitignore options unchecked because the project already contains its own files.
2. Put this project's contents at the repository root. `website/`, `content/`, `tools/`, `templates/`, `package.json` and `.github/workflows/pages.yml` should be directly inside the repository. Commit and push to the `main` branch using Git or GitHub Desktop. Upload the extracted files, not the ZIP.
3. In the repository, select **Settings → Pages → Build and deployment → Source → GitHub Actions**.
4. Select **Actions → Publish Ralgo website → Run workflow**, using `main`. Subsequent pushes to `main` publish automatically.
5. The successful deployment displays the website address in the workflow and under **Settings → Pages**.

For a repository named `ralgo-website`, the default address is `https://YOUR-USERNAME.github.io/ralgo-website/`. A repository named `YOUR-USERNAME.github.io` uses `https://YOUR-USERNAME.github.io/`. The workflow reads the correct address from GitHub and adjusts all local website paths automatically.

If you use Terminal, open it in this extracted project folder. Replace the remote URL below with the HTTPS clone URL shown by your newly created repository:

```bash
git init -b main
git add .
git commit -m "Publish Ralgo exhibition and weekly briefings"
git remote add origin https://github.com/YOUR-USERNAME/ralgo-website.git
git push -u origin main
```

Use your normal GitHub authentication or GitHub Desktop. No personal token needs to be placed in this project. The deployment workflow uses GitHub's built-in short-lived token.

The project contains more than 1,000 artwork files. Git or GitHub Desktop is the practical way to upload it; do not drag the complete ZIP into GitHub's web uploader.

## Contact and analytics setup

`site-settings.json` holds two public settings. They are deliberately blank until the artist supplies the email to display and their own GoatCounter endpoint. Do not use a sign-in email, guess a mailbox or send visitors to an unverified analytics account.

- `contactEmail`: the approved public email. The build places a working mailto link and “Commissions, exhibitions and press enquiries.” in About, the exhibition footer and the briefing footers. Empty means no empty or placeholder contact block is shown.
- `goatcounterEndpoint`: copy the exact `https://SITECODE.goatcounter.com/count` value from the owner’s GoatCounter installation snippet. No API key is required. Empty means no tracking script is loaded.

Once configured, the published pages load GoatCounter only on `ralgo.art` and `www.ralgo.art`. Local copies and embedded artwork previews are excluded. It counts pageviews, including gallery navigation without a page reload, and `contact-about` / `contact-footer` clicks. These clicks indicate an opened email link, not a sent enquiry. Page paths exclude query strings and ordinary anchors, and referrers are limited to the referring origin. Blocked analytics never prevents navigation or email links from working.

Official setup and API references: [Getting started](https://www.goatcounter.com/help/start), [JavaScript API](https://www.goatcounter.com/help/js), [Single-page apps](https://www.goatcounter.com/help/spa).

## Add your next weekly briefing

Copy `content/POST-TEMPLATE.md` to a new Markdown file inside `content/posts/`. Edit its title, date, slug, excerpt and body, then commit it to `main`. You can do this directly in GitHub's file editor once the repository is published.

Each commit rebuilds the archive, full article pages and the latest briefings on the exhibition homepage. The complete Monday briefing, **The Prompt Era Is Ending**, is already included.

To use a cover, add the image to `website/assets/` and set the post's `cover` to `/assets/your-image.png`. Keep these source paths rooted at `/`; the build adds the GitHub repository prefix automatically. Use a stable lowercase slug such as `a-new-week-of-art-and-technology` for the article's permanent address.

Keep unpublished work in a local `content/drafts/` folder. That folder is ignored by Git and is not published. To remove an already published article, move its Markdown out of `content/posts/`, commit the removal and publish. Previously committed text remains in Git history.

## Edit the exhibition

| File | Purpose |
| --- | --- |
| `templates/home.html` | Homepage layout and opening text |
| `website/styles.css` | Exhibition styling |
| `website/app.js` | Galleries, pairing, collection order and viewer |
| `website/works.js` | Featured artwork descriptions and interactive links |
| `website/data/catalogue.json` | All collection items, names and Seasky/Aria pairings |
| `website/art/` | Water Kept, Chimera, Quad, Creatures, Illuminations and fireplace programs |
| `website/assets/` | Featured images, including the chosen Water Kept PNG |
| `website/artworks/` | Cached collection previews, retained alternative Arias and larger Quasi images |
| `content/posts/` | Published briefings in Markdown |
| `.github/workflows/pages.yml` | Automatic GitHub Pages publishing |

Edit the homepage template and Markdown posts, then commit them. `website/index.html` and `website/blog/` are generated during the build. The public deployment contains only the generated `_site/` folder.

Harvey Rayner remains the primary artist for Quasi Dragon Studies, with Ralgo credited for the compositions. Existing Art Blocks, Verse and artist links remain in place.

## Local preview

Install Node.js 22 or newer. There are no npm dependencies to install. From the project root:

```bash
npm run build
python3 -m http.server 8000 --directory _site
```

Open `http://localhost:8000/`. The Python command requires Python 3; any ordinary static HTTP server can serve `_site/` instead. Opening HTML directly with `file://` will not load the catalogue or JavaScript modules correctly.

To check a repository subfolder build on macOS/Linux:

```bash
PAGES_BASE_PATH=/ralgo-website npm run build
```

That output expects to be mounted at `/ralgo-website/`. Run `npm run build` without the environment variable to return to a root-address local preview. GitHub sets the variable automatically in production.

## Your own domain

Once the Pages address works, add a custom domain under the repository's **Settings → Pages**, configure the domain's DNS using GitHub's guide, and enable HTTPS when available. Run **Publish Ralgo website** again after changing the domain so the output uses the new base address.

## What this version includes

The supplied Water Kept PNG, 1,006 selected catalogue entries, the larger Quasi images, the six featured interactive experiences including Chimera Quad, and the complete Monday briefing are included. Each Seasky is paired with one selected Aria. All local generators open within this site.

Original full-resolution collection images and minted token renderers still use their original external destinations where the exhibition did so. Interface fonts use Google Fonts with system fallbacks. This is a complete website package, rather than a cache of every remote full-resolution NFT image.

GitHub Pages serves static files. Briefings are edited as Markdown and built into HTML; the former hosted sign-in/database editor is not part of this deployment. The earlier complete personal-website ZIP retains the original backend and archival backups. This GitHub project contains the publishable exhibition and its static build sources.

## Official hosting instructions

- [Configure GitHub Pages publishing](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)
- [Use custom workflows with GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)
- [Configure a custom domain](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site)
