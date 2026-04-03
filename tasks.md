# FluentType Clone — Task Tracker

## Project Overview
A language-learning webapp inspired by MonkeyType. Users type a **translated** version of AI-generated text in their target language. Combines typing speed with language acquisition using spaced-repetition (Anki-style) and vocabulary tracking.

## Tech Stack
- **Frontend**: Vue 3 + Vite + Tailwind CSS + Pinia + Vue Router
- **Backend**: Node.js + Express + SQLite (better-sqlite3) + JWT
- **AI**: Anthropic SDK (Claude) for sentence generation
- **Auth**: JWT (access tokens stored in memory, refresh tokens in httpOnly cookies)

## Architecture
```
/
├── frontend/        Vue 3 SPA
├── backend/         Express REST API
└── tasks.md
```

---

## Tasks

### Phase 1 — Project Setup
- [x] Write tasks.md
- [x] Init backend package (Express, node:sqlite, Anthropic SDK, JWT, dotenv)
- [x] Init frontend package (Vite, Vue 3, Tailwind, Pinia, Vue Router)

### Phase 2 — Backend Core
- [x] DB schema: users, language_profiles, vocabulary, sentences, sentence_reviews, refresh_tokens
- [x] Auth routes: POST /auth/register, POST /auth/login, POST /auth/refresh, POST /auth/logout
- [x] Profile routes: GET/POST /profiles, GET/DELETE /profiles/:id
- [x] Vocabulary routes: GET/POST/DELETE /profiles/:id/vocabulary, PATCH .../review
- [x] Sentences routes: GET /next (AI + due reviews), POST /:id/review, GET / (history)
- [x] AI service: generate sentence using skill level + known vocabulary (claude-haiku)
- [x] Spaced repetition service: SM-2 algorithm for sentence + vocabulary scheduling
- [x] Skill scoring service: update skill score + XP after challenge attempts

### Phase 3 — Frontend
- [x] Router + Pinia store setup (auth guard, token refresh interceptor)
- [x] AuthStore (login, register, token refresh) + ProfileStore
- [x] Login / Register views
- [x] Profile creation view (target language, native language, skill level)
- [x] Main typing view — Challenge Mode (char-by-char tracking, submit on Enter)
- [x] Main typing view — Practice Mode (word-by-word, space to advance)
- [x] Post-round results screen (accuracy ring, WPM, XP gained, correct answer reveal)
- [x] Vocabulary view (list all words, add manually, delete, sort, see due status)
- [x] Dashboard view (skill bar, XP, stat grid, profile switcher)
- [x] History view (sentence list with scores)
- [x] NavBar with profile skill display

### Phase 4 — Polish
- [x] Responsive design (Tailwind responsive classes throughout)
- [x] Loading / error states on all data fetches
- [x] Environment variable config (.env.example)
- [ ] Add streak tracking (future)
- [ ] Add settings page for profile management (future)

---

## Database Schema (planned)

### users
| col | type |
|---|---|
| id | INTEGER PK |
| username | TEXT UNIQUE |
| email | TEXT UNIQUE |
| password_hash | TEXT |
| created_at | INTEGER |

### language_profiles
| col | type |
|---|---|
| id | INTEGER PK |
| user_id | INTEGER FK |
| target_language | TEXT |
| native_language | TEXT |
| skill_score | REAL (0–100) |
| xp | INTEGER |
| created_at | INTEGER |

### vocabulary
| col | type |
|---|---|
| id | INTEGER PK |
| profile_id | INTEGER FK |
| word | TEXT (target lang) |
| translation | TEXT (native lang) |
| times_seen | INTEGER |
| times_correct | INTEGER |
| ease_factor | REAL (SM-2) |
| interval_days | REAL |
| next_review | INTEGER (unix ts) |
| source | TEXT ('ai' or 'manual') |
| created_at | INTEGER |

### sentences
| col | type |
|---|---|
| id | INTEGER PK |
| profile_id | INTEGER FK |
| source_text | TEXT (native lang — shown to user) |
| target_text | TEXT (target lang — what user types) |
| difficulty | REAL |
| word_count | INTEGER |
| created_at | INTEGER |

### sentence_reviews
| col | type |
|---|---|
| id | INTEGER PK |
| sentence_id | INTEGER FK |
| profile_id | INTEGER FK |
| mode | TEXT ('challenge' or 'practice') |
| score | REAL (0–1 accuracy) |
| wpm | REAL |
| ease_factor | REAL |
| interval_days | REAL |
| next_review | INTEGER (unix ts) |
| reviewed_at | INTEGER |

---

## Skill Score Logic
- Starts at 0 (total beginner)
- Range 0–100
- Controls:
  - sentence word count: `4 + floor(skill/10)` words (4 at skill 0, 14 at skill 100)
  - difficulty tag passed to AI: beginner/elementary/intermediate/upper-intermediate/advanced
  - ratio of new words introduced: `floor(skill/20)` new words per sentence (0–5)
- Increases by completing challenge mode with high accuracy
- Decreases slightly on very low accuracy in challenge mode

## Spaced Repetition (SM-2 adapted)
- Each sentence gets ease_factor (starts 2.5) and interval_days (starts 1)
- After review: new_interval = old_interval * ease_factor (capped at 90 days)
- ease_factor adjusted by score: +0.1 if score>0.9, -0.2 if score<0.6
- `next_review` = now + interval_days * 86400
