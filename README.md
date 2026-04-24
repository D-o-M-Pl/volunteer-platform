# Platforma Wolontariatu z integracją AI

Monorepo łączące wolontariuszy z organizacjami przy pomocy Claude AI.

## Struktura

```
volunteer-platform/
├── apps/
│   ├── api/          # Fastify REST API (Node.js + TypeScript)
│   └── web/          # Next.js 14 frontend
├── packages/
│   ├── shared/       # Typy, schematy Zod, kontrakty eventów
│   └── database/     # Prisma schema + klient PostgreSQL
```

## Uruchomienie

```bash
# Wymagania: Node.js 20+, pnpm 9+, PostgreSQL

pnpm install
cp .env.example .env        # uzupełnij DATABASE_URL i ANTHROPIC_API_KEY

pnpm db:generate
pnpm db:migrate
pnpm db:seed

pnpm dev
```

- **API:** http://localhost:3001
- **Web:** http://localhost:3000

## Funkcje

- Rejestracja wolontariuszy z umiejętnościami i lokalizacją
- Publikowanie zadań przez organizacje (NGO)
- **Dopasowanie AI** — Claude analizuje umiejętności i wybiera najlepszych wolontariuszy
- Zgłoszenia i zarządzanie statusami (PENDING → ACCEPTED / REJECTED)
- Event-driven architektura z Outbox Pattern (audytowalność)

## Tech Stack

- **Monorepo:** Turborepo + pnpm workspaces
- **Backend:** Fastify + TypeScript + Prisma
- **Frontend:** Next.js 14 (App Router) + Tailwind CSS
- **Baza danych:** PostgreSQL
- **AI:** Anthropic Claude API
