# Sage on ralgo.art

## Repository placement

The public website files are in `website/sage/`. The editable artwork and server sources are kept here, outside the published website folder. The website is running with its starting answers until `website/sage/config.js` is given the deployed Worker URL. Run `build.py sage.html` here when updating the source artwork, then copy its generated `site/sage/index.html` to `website/sage/index.html`, preserving the site metadata and return link.


Sage runs as two parts:

- **The work** (`site/sage/`): plain files on GitHub Pages. It shows the questions and answers, collects star ratings and has the Ask Sage screen. It contains no secrets.
- **The server** (`worker/`): a small Cloudflare Worker with a database. It stores ratings, answers visitors' questions and runs a nightly job. Your Anthropic API key lives only here.

## How Sage learns

- **Choosing answers.** Every question has three or more answers from different voices. The work picks one at random, tilted towards voices and answers with better ratings.
- **Sage's voice.** Sage is a blend of the twelve voices, in proportion to their ratings (three stars is neutral). Under each of its answers the work shows the mix it was written in, such as "SAGE · 33% CHILD, 9% MYSTIC, 9% ELDER". When someone asks a question on the Ask screen, Sage answers in its current blend, using the highest-rated answers as examples.
- **Every night** the server:
  - retires answers with at least five ratings that average under 2.5
  - writes replacements for any question left with fewer than three answers
  - writes five new answers in Sage's current blend.

  New answers wait on your admin page until you approve them.

## The questioners

On this screen Sage and Anti-Sage talk to each other with no one steering. The work asks one of its own questions and one of them answers it. From then on, each replies to the whole of what the other just said, both its argument and its closing question, and ends with a question of its own. The finished reply scrolls up into the questioner's place and the other's reply types in beneath it. The screen stacks top and bottom at every screen shape so the scroll runs straight up. After 20 turns the work asks a new question. About 3% of the time, the question a voice asks back is swapped for one of the work's own starting questions, so the work breaks back into the conversation.
- **Anti-Sage** is Sage's mirror: the same twelve voices, weighted by how *poorly* people rate them, and it learns from the lowest-rated answers. It speaks in the opposite colour to Sage.
- **One shared conversation:** everyone watching sees the same one. The server only writes a new turn when someone has reached the end, at most one every 15 seconds, so the cost depends on how long it's watched, not on how many people watch.
- **When the daily limit is reached,** viewers are shown earlier conversations until the next day.
- **No visitor text** goes into these prompts.
- **Ratings:** people can rate every turn. The report compares Sage with Anti-Sage.
- **Admin page:** shows the recent conversations, with each turn's rating.

## The creed

Every night Sage rewrites its creed: three to five short statements of what it currently believes. It works from its previous creed, the answers and questioner moments people rated highest, and its current blend.
- **Holding to it:** keeps what still holds and changes or drops what the ratings no longer support.
- **Who uses it:** Sage answers from its creed, and Anti-Sage is told to push against it.
- **Where it shows:** every version is kept. The work's "What Sage has learned" screen shows the current creed and the earlier versions, and your admin page lists them too.

## Botto's original

The "Botto's original" button shows the work exactly as minted. Botto's code runs untouched in its own frame: the square canvas and only its own 29 questions. The page adds only a stand-in for the fxhash random functions the minting platform supplied.

## Randomness and style

- **Mix:** every time Sage or Anti-Sage writes, its mix of voices is nudged at random away from the rated blend. No two answers come from exactly the same mixture, and the label under each answer shows the mix actually used.
- **No dashes:** the voices are told never to use dashes. Any em or en dash that still gets through is turned into a comma before it's saved or shown.

## How your API key stays safe

- The key is set as a Worker secret with `wrangler secret put`. It is never in the website, never in this folder and never in git. GitHub only ever holds the website files, which have nothing secret in them.
- The browser never talks to Anthropic. It sends a question of at most 120 characters to your Worker, and the Worker builds the whole prompt itself. Nobody can send it their own instructions, so it can't be used as a free general-purpose model: the most it ever produces is one short Sage answer.
- The Worker only accepts requests from ralgo.art. Each visitor gets 8 Ask Sage questions an hour. The questioners write at most one turn every 15 seconds in total. Everyone together gets 600 model calls a day; after that, Ask Sage rests and the questioners replay earlier conversations until tomorrow.
- Optionally, Cloudflare Turnstile (free and invisible) checks that a person is asking, which stops scripts.
- **The backstop:** give Sage its own workspace in the Claude Console with a monthly spend limit. Even if everything above failed, the bill can't go past that limit. When it's reached, Sage rests until the next month.
- Visitors' addresses are stored only as salted hashes. Ratings use an anonymous random ID kept in the visitor's browser.

## Setting it up (about 30 minutes, once)

You need Node.js (the LTS version from nodejs.org) installed.

**1. Anthropic: a key that can only spend so much**
1. In the Claude Console (platform.claude.com), create a workspace called `Sage`.
2. In that workspace's limits, set a monthly spend limit you're comfortable with.
3. Create an API key inside that workspace. Keep it open for step 3. Don't paste it anywhere else.

**2. Cloudflare: the database**
In a terminal, inside the `worker` folder:
```
npx wrangler login
npx wrangler d1 create sage
```
Copy the `database_id` it prints into `wrangler.toml`, replacing `PASTE-THE-ID-FROM-wrangler-d1-create-HERE`. Then:
```
npx wrangler d1 execute sage --remote --file=schema.sql
npx wrangler d1 execute sage --remote --file=seed.sql
```

**3. The secrets.** Each command asks you to paste a value:
```
npx wrangler secret put ANTHROPIC_API_KEY     # the key from step 1
npx wrangler secret put ADMIN_TOKEN           # a long random password for your admin page
npx wrangler secret put IP_SALT               # any other long random string
```
For the two random strings, `openssl rand -hex 24` in a terminal makes a good one.

**4. Deploy the server**
Check `ALLOWED_ORIGINS` in `wrangler.toml` lists the address the work is served from. If you also use `yourname.github.io`, add it. Then:
```
npx wrangler deploy
```
It prints an address like `https://sage-api.yourname.workers.dev`.

**5. Put the work on your site**
1. Copy the `site/sage` folder into your GitHub Pages repository, so the work is at `ralgo.art/sage/`.
2. Open `sage/config.js` and set `api` to the address from step 4.
3. Commit and push.

Open `ralgo.art/sage/` to see the work. Open `ralgo.art/sage/admin.html` and enter your ADMIN_TOKEN to approve answers, read what visitors asked and run the nightly job by hand.

**6. Optional but recommended: Turnstile**
1. In the Cloudflare dashboard, go to Turnstile and add a widget for `ralgo.art` with the mode set to Invisible.
2. Put its **site key** in `config.js` under `turnstile`, and push.
3. Run `npx wrangler secret put TURNSTILE_SECRET` and paste its **secret key**.

## Day to day

- **Approving answers:** use the admin page. Once you trust the nightly answers, set `REQUIRE_APPROVAL = "false"` in `wrangler.toml` and run `npx wrangler deploy`.
- **Removing an answer by hand:**
  ```
  npx wrangler d1 execute sage --remote --command "UPDATE answers SET status='retired' WHERE t LIKE '%some words%'"
  ```
- **Already set up before the questioners were added?** Run the new tables in once:
  ```
  npx wrangler d1 execute sage --remote --file=schema.sql
  ```
  It only adds what's missing. Then redeploy and copy the new `site/sage` files across.
- **Settings** in `wrangler.toml` (redeploy after changing):
  - `MODEL`
  - the question limits
  - the retire threshold
  - how many answers are written each night
- **If the key is ever exposed:** delete it in the Console, create a new one and run `npx wrangler secret put ANTHROPIC_API_KEY` again. Nothing else changes.
- **Changing the work itself:** edit `sage.html`, which is the same file as the Claude version, then run `python3 build.py sage.html` and copy `site/sage/index.html` across again.

## Testing on your own computer

Copy `worker/.dev.vars.example` to `worker/.dev.vars`. That file stays on your computer and is git-ignored. Run the same two `d1 execute` lines with `--local` instead of `--remote`, then `npx wrangler dev`. With `MOCK_LLM=1`, the server writes placeholder answers instead of calling the model, so testing costs nothing.
