export type SubscriptionTier = 'free' | 'pro' | 'lifetime';

export type FeatureName =
  | 'host_multiplayer_pod'   // hosting 3–6 player games (guests can always join)
  | 'unlimited_ai'           // unlimited AI Judge questions (free = 5/day)
  | 'cloud_decks'            // cloud-synced deck storage (free = 3 local only)
  | 'full_game_history'      // unlimited history + global leaderboard
  | 'ai_deck_generation'     // AI deck generation + analysis
  | 'card_scanner';          // camera auto-scan → Vision API (costs money per call)
