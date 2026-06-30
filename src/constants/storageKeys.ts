// Centralized localStorage key constants — import from here instead of using raw strings

export const STORAGE_KEYS = {
  GEMINI_KEY:      "nexus_judge_gemini_key",
  GEMINI_MODEL:    "nexus_judge_gemini_model",
  AI_CHAT:         "nexus_judge_ai_chat",
  AI_TAGS:         "nexus_judge_ai_tags",
  AI_RULINGS:      "nexus_judge_ai_rulings",
  PLAYER_NAMES:    "nexus_judge_player_names",
  PLAYERS:         "nexus_judge_players",
  PLAYER_COUNT:    "nexus_judge_player_count",
  STARTING_LIFE:   "nexus_judge_starting_life",
  LIFE_HISTORY:    "nexus_judge_life_history",
  ACTIVE_COUNTERS: "nexus_judge_active_counters",
  DAY_NIGHT:       "nexus_judge_day_night",
  TURN_PLAYERS:    "nexus_judge_turn_players",
  TURN_WINNER:     "nexus_judge_turn_winner",
  TURN_INDEX:      "nexus_judge_turn_index",
  TURN_ROLLOFFS:   "nexus_judge_turn_rolloffs",
  TURN_COLORS:     "nexus_judge_turn_colors",
  CARD_HISTORY:       "nexus_judge_card_history",
  SAVED_GAMES:        "nexus_judge_saved_games",
  AI_FAVORITES:       "nexus_judge_ai_favorites",
  SIDEBAR_COLLAPSED:  "nexus_judge_sidebar_collapsed",
  HISTORY_COLLAPSED:  "nexus_judge_history_collapsed",
  CONTROLS_COLLAPSED: "nexus_judge_controls_collapsed",
  THEME:              "nexus_judge_theme",
  ROOM_CODE:          "nexus_judge_room_code",
  ROOM_ROLE:          "nexus_judge_room_role",
  ACCESS_CODE:        "nexus_judge_access_code",
  DISPLAY_NAME:       "nexus_judge_display_name",  // local fallback for lobby pre-fill
  DEVICE_ID:          "nexus_device_id",            // stable random UUID per device
  MP_LOBBY_PLAYERS:   "nexus_mp_lobby_players",     // LobbyPlayer[] JSON
  MP_FIRST_PLAYER:    "nexus_mp_first_player",      // first player name from spin
  SAVED_DECKS:        "nexus_saved_decks",           // SavedDeck[] JSON
  MY_PLAYER_INDEX:    "nexus_judge_my_player_index", // which player seat is "mine" on this device
  WAKE_LOCK:           "nexus_judge_wake_lock",        // screen keep-awake preference (boolean)
  SUBSCRIPTION_TIER:  "nexus_subscription_tier",      // cached SubscriptionTier from Supabase
  ONBOARDING_DONE:      "nexus_onboarding_done",           // "1" after first-launch flow completes
  COLLECTION_GROUPS:    "nexus_collection_groups",         // CollectionGroup[] JSON
  COLLECTION_CARDS:     "nexus_collection_cards",          // CollectionCard[] JSON
  LAYOUT_MODE:          "nexus_judge_layout_mode",         // 'symmetric' | 'featured'
  TURN_TIMER_ENABLED:  "nexus_judge_turn_timer_enabled",  // "true" | "false"
  TURN_TIMER_DURATION: "nexus_judge_turn_timer_duration", // seconds per turn, default 180
  ROTATE_ENABLED:      "nexus_judge_rotate_enabled",      // "true" | "false", default true
  PROFILE_AVATAR:      "nexus_profile_avatar",            // art_crop URL chosen as profile picture
  PROFILE_NAME:        "nexus_profile_name",              // display name (profile-specific override)
} as const;
