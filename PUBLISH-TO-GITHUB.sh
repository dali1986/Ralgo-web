#!/usr/bin/env bash
set -euo pipefail

# Run from the extracted website package. Authentication stays on your computer.
cd -- "$(dirname -- "${BASH_SOURCE[0]}")"
ralgo_repo='Dali1986/ralgo-website'
ralgo_remote="https://github.com/${ralgo_repo}.git"
export GH_HOST=github.com

for ralgo_command in git gh; do
  if ! command -v "$ralgo_command" >/dev/null 2>&1; then
    printf 'Please install %s, then run this script again.\n' "$ralgo_command"
    printf 'Git: https://git-scm.com/downloads\nGitHub CLI: https://cli.github.com/\n'
    exit 1
  fi
done
if [[ ! -f website/index.html || ! -f .github/workflows/pages.yml ]]; then
  printf 'Run the script inside the complete, extracted Ralgo website package.\n'
  exit 1
fi
if ! gh auth status --hostname github.com >/dev/null 2>&1; then
  gh auth login --hostname github.com --git-protocol https --web --scopes workflow
fi
ralgo_login=$(gh api --hostname github.com user --jq .login)
case "$ralgo_login" in
  [Dd][Aa][Ll][Ii]1986) ;;
  *) printf 'Sign in to GitHub CLI as Dali1986, then run this script again. No repository was changed.\n'; exit 1 ;;
esac

ralgo_origin=''
if [[ -d .git ]]; then
  ralgo_origin=$(git remote get-url origin 2>/dev/null || true)
  if [[ -n "$ralgo_origin" && "$ralgo_origin" != "$ralgo_remote" ]]; then
    printf 'This folder already points to another repository. Use a fresh extracted package.\n'
    exit 1
  fi
elif [[ -e .git ]]; then
  printf 'Use a fresh extracted package outside an existing Git worktree.\n'
  exit 1
fi

ralgo_exists=false
if gh repo view "$ralgo_repo" --json name >/dev/null 2>&1; then
  ralgo_exists=true
  if [[ "$ralgo_origin" != "$ralgo_remote" ]]; then
    printf '%s already exists. Stopping rather than changing an existing repository.\n' "$ralgo_repo"
    exit 1
  fi
fi

if [[ ! -d .git ]]; then git init -b main; fi
if [[ "$(git symbolic-ref --short HEAD)" != main ]]; then
  printf 'The local branch must be main. Use a fresh extracted package.\n'
  exit 1
fi
if ! git config user.name >/dev/null; then git config user.name 'Ralgo'; fi
if ! git config user.email >/dev/null; then
  ralgo_email=$(gh api --hostname github.com user --jq '"\(.id)+\(.login)@users.noreply.github.com"')
  git config user.email "$ralgo_email"
fi
git add -- website content/posts content/POST-TEMPLATE.md templates tools .github .gitignore package.json README.md EXPORT-MANIFEST.json PUBLISH-TO-GITHUB.sh
if ! git diff --cached --quiet; then
  git commit -m 'Publish Ralgo exhibition and weekly briefings'
fi
if [[ "$ralgo_exists" == false ]]; then
  printf 'Creating public repository %s.\n' "$ralgo_repo"
  gh repo create "$ralgo_repo" --public --source=. --remote=origin \
    --description 'Ralgo — interactive artworks, collections and weekly art and technology briefings'
  git remote set-url origin "$ralgo_remote"
fi
gh auth setup-git --hostname github.com
if ! git push -u origin main; then
  printf 'The upload did not complete. If GitHub reports a missing workflow scope, run:\n'
  printf 'gh auth refresh --hostname github.com --scopes workflow\n'
  printf 'Then run this script again. No force push or deletion is used.\n'
  exit 1
fi
gh repo edit "$ralgo_repo" --default-branch main
if gh api --hostname github.com "repos/$ralgo_repo/pages" >/dev/null 2>&1; then
  gh api --hostname github.com --method PUT "repos/$ralgo_repo/pages" -f build_type=workflow --silent
else
  gh api --hostname github.com --method POST "repos/$ralgo_repo/pages" -f build_type=workflow --silent
fi

# Start a fresh run after enabling Pages, including when the first push ran early.
ralgo_dispatched=false
for ralgo_attempt in 1 2 3 4 5 6; do
  if gh workflow run pages.yml --repo "$ralgo_repo" --ref main; then
    ralgo_dispatched=true
    break
  fi
  sleep 5
done
if [[ "$ralgo_dispatched" != true ]]; then
  printf 'Files are uploaded and Pages is enabled. Start Publish Ralgo website from the repository Actions tab.\n'
  exit 1
fi
ralgo_commit=$(git rev-parse HEAD)
ralgo_run=''
for ralgo_attempt in 1 2 3 4 5 6; do
  ralgo_run=$(gh run list --repo "$ralgo_repo" --workflow pages.yml --event workflow_dispatch \
    --commit "$ralgo_commit" --limit 1 --json databaseId --jq '.[0].databaseId // empty')
  [[ -n "$ralgo_run" ]] && break
  sleep 5
done
if [[ -z "$ralgo_run" ]]; then
  printf 'Deployment requested. Follow its progress: https://github.com/%s/actions\n' "$ralgo_repo"
  exit 0
fi
gh run watch "$ralgo_run" --repo "$ralgo_repo" --exit-status
ralgo_url=$(gh api --hostname github.com "repos/$ralgo_repo/pages" --jq .html_url)
printf '\nWebsite deployed: %s\nRepository: https://github.com/%s\n' "$ralgo_url" "$ralgo_repo"
