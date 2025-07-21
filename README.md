# Torrent Catalog

Simple Node.js web service that merges TMDB trending titles with top Pirate Bay magnet links.

## Quick start

```bash
cp .env.example .env   # fill in TMDB_KEY (and TPB_PROXY if needed)

# Local dev
npm install
npm run dev
```

## Obtaining a TMDB API key

1. Go to https://www.themoviedb.org and create a free account.
2. Verify your email address, then open your profile menu ➜ *Settings*.
3. In the left-hand sidebar select *API* and click *Create* to request a v3 Developer API key.
4. Fill in the short form (you can choose "Personal" usage).
5. Once approved, copy the **API Key (v3 auth)** string.
6. Open `env.sample`, paste the key after `TMDB_KEY=`, then rename the file to `.env` (or copy it):
   ```bash
   cp env.sample .env
   # edit .env and paste your key
   ```
7. (Optional) If you need a custom Pirate Bay proxy, set `TPB_PROXY` in the same file.

Now you can run:
```bash
npm install
npm run dev
```
The server will be available at `http://localhost:3000/catalog`. Front-end UI coming next.

## Front-end (React)

The project contains a `frontend/` folder built with Vite + React.

```bash
# in a new terminal window
cd frontend
npm install
npm run dev   # opens http://localhost:5173
```

The UI fetches the catalog and shows a Netflix-style poster grid; clicking a poster launches the magnet link. 