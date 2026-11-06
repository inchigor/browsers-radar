# Browser Radar

A lightweight, public, bilingual (English/Russian) discovery dashboard for desktop browsers, built with plain HTML, CSS and JavaScript.

**Site:** https://inchigor.github.io/browsers-radar/

## What it does

- Curated browser listings, including projects for macOS, Windows and Linux.
- Weekly GitHub discovery of **unverified candidates** in a separate review queue and refresh of project activity metrics.
- Desktop platform filters: **macOS, Windows, Linux**, plus engine search.
- Filters for observed GitHub contributors, license (SPDX), first public release date and most recent non-prerelease release.
- Sort by GitHub stars, last code push, observed contributors, and release dates.
- Text search and separate personal review statuses.
- **EN / RU** switcher; the language is saved in this browser.
- Personal status and notes for each browser, stored **only in the visitor's browser**.
- JSON import/export for manual backup and transfer between devices.
- No account, backend, analytics, telemetry or third-party fonts.

### Public catalog vs. private reviews

The repository contains browser listings, scanner code and public GitHub metrics. **It never contains visitor reviews.** There is deliberately no `site/data/reviews.json` and no code that uploads reviews.

Your notes and classifications use `localStorage` under the key `browsers-radar-public-reviews-v1`, separately from the earlier private Browser Radar project. All visitors get their own independent review state; even the curated browsers start as *Unreviewed* until personally assessed. Data belongs to the browser profile and website origin, not to a GitHub account.

**Caution:** Clearing site data, using private browsing or switching browsers/devices can remove or separate your reviews. Use **Export reviews** regularly and keep the JSON backups somewhere private. **Import reviews** previews new, identical and conflicting entries, supports keeping or replacing conflicts, and preserves entries for browsers not currently in the catalog. Don't commit exported review files to public repositories.

### Official browser releases (without GitHub)

Browser Radar supports two independent data sources:

- **GitHub API** for projects with public source repositories: stars, SPDX license, distinct commit authors in a capped 90-day sample, release history and last code push.
- **Official release notes** for browsers without public GitHub source repositories. This provides verified published versions, dates and source links, but **not** GitHub stars, public developer counts or the first release date.

Initial official-only browsers: **Dia (macOS / Windows)**, **Orion (macOS)**, and **Arc** (included for lifecycle tracking). Arc is scheduled to shut down on **December 22, 2026** according to its own announcement.

The file `site/data/official.json` holds public, non-personal version observations by stable browser ID and platform. It was seeded from the official release notes; the `origin` field distinguishes a manually verified snapshot from a successful automatic check. The site never estimates unsupported figures. For official sources the displayed release means **published**, not necessarily stable.

`scripts/scan-official.mjs` checks a strict list of HTTPS release-note pages: Dia's macOS and Windows changelogs, and the Orion macOS release notes. The `official.yml` GitHub Action runs on Tuesdays at **09:43 UTC** and on demand. It uses only Node.js standard APIs, no credentials and no third-party dependencies. The extractor fails closed: an unreachable page, a changed HTML structure, a source that reports an older release, or an implausible future date **does not overwrite** the last good data. The action records whether checks were successful, partial or failed.

Official pages are less stable than GitHub's API: changes to HTML can require a small parser update. If an official source cannot be reliably parsed, it remains a **manual verification** source rather than being populated from guessed versions. Published release dates for different platforms are tracked separately. A first release date is not inferred from the repository creation date or the first changelog entry.

This does not mirror a user's installed browser, download executables, query private data, or send their personal reviews anywhere.

## Reading the project metrics

- **GitHub stars** are the repository's star count at the last successful scan.
- **Last updated** means `pushed_at` from GitHub, a code push - **not** a published release.
- **Contributors (90d)** means distinct author identities in **up to the first 100 commits in the previous 90 days** (obvious bots excluded). A `+` indicates that the 100-commit sample limit was reached. This is **not total team size**.
- **First release** means the earliest **published GitHub Release**, which can be an early prerelease. If history has more than 600 Releases or the API is incomplete, the date stays unknown.
- **Latest non-prerelease** means the newest published GitHub Release GitHub does not mark as prerelease and whose tag does not clearly identify beta/alpha/RC/nightly. It is not a guarantee of a production-grade stable build.
- **License** is the SPDX identifier exposed by GitHub's repository API. If missing or `NOASSERTION`, it is displayed as unknown. It is not a legal audit.
- For platforms, **unverified** projects are excluded from platform-specific filters rather than guessed from their repository description.
- Blank release dates are **unknown**, never treated as zero or as the date the repository was created.

The scanner searches for desktop browsers on macOS, Windows and Linux using conservative heuristics. Newly found candidates are unverified until manually reviewed. Clearly unrelated reviewed entries are hidden from the catalog while discovery history and personal reviews remain intact; heuristic filtering can still miss genuine projects or admit false positives.

## Language

English is the default unless your browser language starts with `ru`; you can switch with the **EN / RU** selector. The selection persists on the current device. Curated descriptions are bilingual; descriptions retrieved from third-party GitHub repositories are shown as published, usually in English.

## Local development

Requires a browser and Python 3, without `npm install` or a build step:

```bash
python3 -m http.server 8080 --bind 127.0.0.1 --directory site
```

Open http://127.0.0.1:8080/ . Opening `site/index.html` via `file://` will not work because the page fetches JSON.

Run the tests using Node.js 22 or later (catalog, scanner, translations and privacy):

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
- **Browser Radar - weekly discovery** runs every Monday at **08:17 UTC**, after scanner/catalog changes, and can be triggered manually. It needs GitHub Actions permission to commit its resulting public discovery and metrics JSON.
- The deployment checks Node tests and asserts that no reviews JSON was added to the public website.

GitHub API searches are heuristic. A new candidate is not a verified working browser. Stars, commit activity and contributor counts do not prove a project is safe or actively maintained, and the scan may miss projects or yield false positives. The user chooses what to install; this project never downloads or runs browser installers.

## Notes on contributions and privacy

Please report incorrect browser metadata or candidates via GitHub issues. Do not include private browsing data, personal review JSON or credentials in issues or pull requests.

Concept inspired by [Awesome Arc Alternatives](https://github.com/igorsyrbu/awesome-arc-alternatives) (CC0-1.0). Browser Radar's code is independently authored and does not copy that project's README.

---

## Русский

Browser Radar - открытый каталог браузеров с автоматическим поиском проектов на GitHub и переключателем **EN / RU**.

**Личные оценки и заметки хранятся только в вашем браузере** (`localStorage`). В публичный GitHub они не отправляются, не синхронизируются и не входят в файлы сайта. При очистке данных сайта оценки могут исчезнуть - используйте кнопки **«Экспорт оценок»** и **«Импорт оценок»**. Исходный каталог общий, но все личные статусы независимы для каждого посетителя.

Новые находки автоматического сканера требуют проверки: появление в каталоге не означает рекомендацию устанавливать приложение. Фильтры поддерживают macOS, Windows и Linux, движок, число наблюдаемых авторов, лицензию и даты первого и последнего стабильного релиза. Последнее обновление означает push в GitHub, а число авторов - ограниченную выборку коммитов за 90 дней.

## Candidate review and evidence

Automatic discoveries appear under **Awaiting review**, not in the main catalog. Existing discovery records and visitor reviews stay intact. A maintainer can confirm a standalone desktop browser by adding its exact `owner/repository` ID to `site/data/approved.json` and committing the change. The ID must be a JSON string in the array; never put personal reviews in this public file. Removing an ID returns the entry to the queue. Curated records in `browsers.json` are already catalog entries. Excluded non-browser IDs remain hidden and cannot be approved without reviewing the exclusion list.

Browser cards show macOS, Apple Silicon, vertical tabs and extensions as unverified until supported by manually checked evidence. Curated records can include `verification`, with feature keys `macos`, `appleSilicon`, `verticalTabs`, `extensions`; each value is an object such as `{ "value": "yes", "checkedAt": "2026-11-06", "source": "https://example.org/source" }`. Use `yes` or `no` only with a valid date and a direct HTTPS source; otherwise the site displays unverified. These are public facts, separate from private visitor reviews.
