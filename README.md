# Browser Radar

A lightweight, public, bilingual (English/Russian) discovery dashboard for desktop browsers, built with plain HTML, CSS and JavaScript.

**Site:** https://inchigor.github.io/browsers-radar/

## What it does

- Curated browser listings, including projects for macOS, Windows and Linux.
- Weekly GitHub discovery of **unverified candidates** and refresh of project activity metrics.
- Filters by engine, text search and sorting.
- **EN / RU** switcher; the language is saved in this browser.
- Personal status and notes for each browser, stored **only in the visitor's browser**.
- JSON import/export for manual backup and transfer between devices.
- No account, backend, analytics, telemetry or third-party fonts.

### Public catalog vs. private reviews

The repository contains browser listings, scanner code and public GitHub metrics. **It never contains visitor reviews.** There is deliberately no `site/data/reviews.json` and no code that uploads reviews.

Your notes and classifications use `localStorage` under the key `browsers-radar-public-reviews-v1`, separately from the earlier private Browser Radar project. All visitors get their own independent review state; even the curated browsers start as *Unreviewed* until personally assessed. Data belongs to the browser profile and website origin, not to a GitHub account.

**Caution:** Clearing site data, using private browsing or switching browsers/devices can remove or separate your reviews. Use **Export reviews** regularly and keep the JSON backups somewhere private. **Import reviews** previews new, identical and conflicting entries, supports keeping or replacing conflicts, and preserves entries for browsers not currently in the catalog. Don't commit exported review files to public repositories.

### Language

English is the default unless your browser language starts with `ru`; you can switch with the **EN / RU** selector. The selection persists on the current device. Curated descriptions are bilingual; descriptions retrieved from third-party GitHub repositories are shown as published, usually in English.

## Local development

Requires a browser and Python 3, without `npm install` or a build step:

```bash
python3 -m http.server 8080 --bind 127.0.0.1 --directory site
```

Open http://127.0.0.1:8080/ . Opening `site/index.html` via `file://` will not work because the page fetches JSON.

Run the tests using Node.js 22 or later:

```bash
node --test scripts/*.test.mjs
```

For a live scanner update (requires GitHub API access):

```bash
GITHUB_TOKEN=... node scripts/scan.mjs
```

The scanner only writes `site/data/discovered.json` and `site/data/metrics.json`. A token is optional for local runs but helps with rate limits; avoid personal tokens with broad permissions.

## GitHub Actions and Pages

- **Publish Browser Radar** deploys the contents of `site/` using GitHub Pages on commits that change the site and through manual dispatch. GitHub repository **Settings → Pages → Build and deployment → Source: GitHub Actions** must be selected.
- **Browser Radar - weekly discovery** runs every Monday at **08:17 UTC** and can be triggered manually. It needs GitHub Actions permission to commit its resulting public discovery and metrics JSON.
- The deployment checks Node tests and asserts that no reviews JSON was added to the public website.

GitHub API searches are heuristic. A new candidate is not a verified working browser. Stars, commit activity and contributor counts do not prove a project is safe or actively maintained, and the scan may miss projects or yield false positives. The user chooses what to install; this project never downloads or runs browser installers.

## Notes on contributions and privacy

Please report incorrect browser metadata or candidates via GitHub issues. Do not include private browsing data, personal review JSON or credentials in issues or pull requests.

Concept inspired by [Awesome Arc Alternatives](https://github.com/igorsyrbu/awesome-arc-alternatives) (CC0-1.0). Browser Radar's code is independently authored and does not copy that project's README.

---

## Русский

Browser Radar - открытый каталог браузеров с автоматическим поиском проектов на GitHub и переключателем **EN / RU**.

**Личные оценки и заметки хранятся только в вашем браузере** (`localStorage`). В публичный GitHub они не отправляются, не синхронизируются и не входят в файлы сайта. При очистке данных сайта оценки могут исчезнуть - используйте кнопки **«Экспорт оценок»** и **«Импорт оценок»**. Исходный каталог общий, но все личные статусы независимы для каждого посетителя.

Новые находки автоматического сканера требуют проверки: появление в каталоге не означает рекомендацию устанавливать приложение.
