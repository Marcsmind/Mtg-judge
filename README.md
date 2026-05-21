# ⚖️ Nexus Judge — Commander Companion

A sleek, browser-based Magic: The Gathering companion app built for **Commander (EDH)** gameplay. Combines an AI rules judge, life tracker, dice roller, card library, and turn-order picker in one glassmorphism-styled interface.

---

## ✨ Features

### 🤖 AI Rules Judge
- Powered by **Google Gemini** with RAG (Retrieval-Augmented Generation)
- Tag up to **5 cards** per question — pulls exact oracle text + official Gatherer rulings from the Scryfall API before querying the AI
- Fully optimized system prompt for **Commander/EDH format** rules
- Bold card names in responses are **clickable** → opens Card Codex search
- MTG keywords (**lifelink**, **deathtouch**, etc.) show hover tooltips with rule definitions
- Markdown-formatted responses with proper headers, lists, and code blocks
- Persistent chat history between sessions

### 🃏 Card Codex
- Search any Magic card with live autocomplete (Scryfall API)
- View high-resolution card art, oracle text, mana cost, and color identity
- Official **Gatherer rulings** displayed below each card
- **History tab** — tracks every card you've searched or tagged; click to re-view; one-tap "Tag in AI Judge" button
- Escape key closes the panel; full-width on mobile

### ❤️ Life Counter
- Supports **2–8 players** with per-player Commander color themes
- Tracks: **Life total**, **Commander Tax** (with Partner support), **Commander Damage** (21-loss threshold with progress bars), **Poison counters** (10-loss), **Radiation counters** (Fallout)
- **Per-player token tracking** — each player independently enables Treasure 🪙, Food 🍎, Clue 🔍, or Blood 🩸 tokens from their own card panel
- **Monarch** and **Initiative** global mechanics with prominent badges
- **City's Blessing**, **Day/Night** cycle tracker
- Full timestamped game history log

### 🎲 Dice & Coins
- Roll D4, D6, D8, D10, D12, D20, and D100
- Flip a coin with animation
- Roll multiple dice at once

### 🔀 Turn Order
- **Roulette Spin** — animated slot-machine style random selection
- **Simultaneous D20 Roll-Off** — rolls for all players at once, ranks by result
- **Tie detection** — highlights tied players and shows a dedicated Re-Roll button
- Player roster auto-synced from Life Counter names

### 📖 Quick Rules Reference
- 15+ collapsible rule sections covering key Commander interactions
- Each section is independently scrollable
- Covers: Zones, State-Based Actions, Commander Rules, Color Identity, the Stack, Turn Phases, Keywords, and more

### ⚙️ Settings
- Google Gemini API key management (stored only in browser `localStorage`)
- Model selector with "Test Key & Fetch Models" to verify your API key
- Zero data leakage — keys never leave your browser except to Google's official API endpoint

---

## 🛠️ Tech Stack

| Layer | Library |
|---|---|
| Framework | React 19 + TypeScript |
| Build | Vite 8 |
| State | Zustand 5 (with `persist` middleware) |
| Markdown | react-markdown 10 |
| Icons | Lucide React |
| Card Data | [Scryfall API](https://scryfall.com/docs/api) |
| AI | [Google Gemini API](https://ai.google.dev/) |
| Styling | Custom CSS glassmorphism design system |

---

## 🚀 Getting Started

### Prerequisites
- Node.js 18+
- A free [Google Gemini API key](https://aistudio.google.com/)

### Installation

```bash
# Clone the repo
git clone https://github.com/your-username/nexus-judge.git
cd nexus-judge

# Install dependencies
npm install

# Start the dev server
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

### Configure your API Key
1. Go to **Settings** in the sidebar
2. Paste your Gemini API key (starts with `AIzaSy…`)
3. Click **"Test Key & Fetch Models"** to verify and choose a model
4. Click **"Save Configuration"**

Don't have a key? Get one free at [aistudio.google.com](https://aistudio.google.com/):
1. Sign in with your Google account
2. Click **"Get API key"** → **"Create API key"**
3. Copy the generated key and paste it into Settings

---

## 🔒 Privacy

All processing happens in your browser. Your Gemini API key is stored exclusively in browser `localStorage` and is only ever sent directly to `https://generativelanguage.googleapis.com`. No backend, no tracking, no data collection.

---

## 📁 Project Structure

```
src/
  components/       # Shared UI components (Sidebar, CardCodex, SettingsPanel)
  constants/        # Centralized constants (storageKeys, mtgKeywords)
  services/         # API clients (scryfall.ts, gemini.ts)
  store/            # Zustand global store (useAppStore.ts)
  views/
    AIJudge.tsx     # AI rules judge orchestrator
    LifeCounter.tsx # Life tracking with all mechanics
    DiceAndCoins.tsx
    TurnOrder.tsx
    QuickRules.tsx
    ai-judge/       # ChatMessage (react-markdown), CardTagBar sub-components
    life-counter/   # GameHistoryLedger, CommanderDamageModal sub-components
```

---

## 📄 License

MIT
