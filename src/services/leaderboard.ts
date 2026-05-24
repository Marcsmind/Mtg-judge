/**
 * Leaderboard service — record game results and query stats.
 * All functions gracefully no-op when Supabase is not configured.
 *
 * DB tables required (see MIGRATION.md):
 *   profiles, game_sessions, game_participants, player_stats (view)
 */

import { supabase, isSupabaseConfigured } from "./supabase";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface GamePlayer {
  userId?: string;        // auth.uid() — undefined for unlinked seats
  playerName: string;
  finalLife: number;
  isWinner: boolean;
  commanderName?: string; // set from multiplayer lobby
}

export interface RecordGameParams {
  roomCode?: string;
  playerCount: number;
  startingLife: number;
  durationSeconds: number;
  players: GamePlayer[];
}

export interface PlayerStats {
  displayName: string;
  avatarEmoji: string;
  totalGames: number;
  wins: number;
  winRate: number;             // 0–100
  lastPlayedAt: string | null; // ISO date string
}

export interface RecentGame {
  id: string;
  completedAt: string;
  playerCount: number;
  startingLife: number;
  durationSecs: number;
  isWinner: boolean;
  finalLife: number;
}

export interface LeaderboardEntry {
  userId: string;
  displayName: string;
  avatarEmoji: string;
  totalGames: number;
  wins: number;
  winRate: number; // 0–100
}

// ── Write ─────────────────────────────────────────────────────────────────────

/**
 * Record a completed game.
 * Inserts one game_sessions row + N game_participants rows atomically.
 * Returns the new game ID, or null on failure.
 */
export async function recordGame(params: RecordGameParams): Promise<string | null> {
  if (!isSupabaseConfigured) return null;

  const now = new Date().toISOString();

  // 1. Insert the session
  const { data: session, error: sessionErr } = await supabase
    .from("game_sessions")
    .insert({
      room_code:     params.roomCode ?? null,
      player_count:  params.playerCount,
      starting_life: params.startingLife,
      duration_secs: params.durationSeconds,
      completed_at:  now,
    })
    .select("id")
    .single();

  if (sessionErr || !session) {
    console.error("[leaderboard] insert game_sessions:", sessionErr?.message);
    return null;
  }

  // 2. Insert participants
  const { error: partErr } = await supabase.from("game_participants").insert(
    params.players.map(p => ({
      game_id:        session.id,
      user_id:        p.userId ?? null,
      player_name:    p.playerName,
      final_life:     p.finalLife,
      is_winner:      p.isWinner,
      commander_name: p.commanderName ?? null,
    })),
  );

  if (partErr) {
    console.error("[leaderboard] insert game_participants:", partErr.message);
  }

  return session.id;
}

// ── Read ──────────────────────────────────────────────────────────────────────

/** Fetch win/loss stats for a user. Returns null when not available. */
export async function getMyStats(userId: string): Promise<PlayerStats | null> {
  if (!isSupabaseConfigured) return null;

  const [partsResult, profileResult] = await Promise.all([
    supabase
      .from("game_participants")
      .select("is_winner, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false }),
    supabase
      .from("profiles")
      .select("display_name, avatar_emoji")
      .eq("id", userId)
      .single(),
  ]);

  const parts = partsResult.data ?? [];
  const wins = parts.filter(p => p.is_winner).length;

  return {
    displayName:  profileResult.data?.display_name ?? "Player",
    avatarEmoji:  profileResult.data?.avatar_emoji  ?? "",
    totalGames:   parts.length,
    wins,
    winRate:      parts.length > 0 ? (wins / parts.length) * 100 : 0,
    lastPlayedAt: parts[0]?.created_at ?? null,
  };
}

/** Fetch the last 10 games for a user. */
export async function getRecentGames(userId: string): Promise<RecentGame[]> {
  if (!isSupabaseConfigured) return [];

  // PostgREST foreign-table join: game_participants + game_sessions
  const { data, error } = await supabase
    .from("game_participants")
    .select(`
      final_life, is_winner, created_at,
      game_sessions!inner ( id, completed_at, player_count, starting_life, duration_secs )
    `)
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(10);

  if (error) {
    console.error("[leaderboard] getRecentGames:", error.message);
    return [];
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((row: any) => ({
    id:           row.game_sessions.id,
    completedAt:  row.game_sessions.completed_at,
    playerCount:  row.game_sessions.player_count,
    startingLife: row.game_sessions.starting_life,
    durationSecs: row.game_sessions.duration_secs,
    isWinner:     row.is_winner,
    finalLife:    row.final_life,
  }));
}

/**
 * Global leaderboard — top 10 players by win rate (minimum 3 games).
 * Queries the `player_stats` DB view (see MIGRATION.md — Migration 4)
 * instead of fetching all rows and aggregating in JS.
 */
export async function getLeaderboard(): Promise<LeaderboardEntry[]> {
  if (!isSupabaseConfigured) return [];

  // player_stats view does GROUP BY + HAVING COUNT(*) >= 3 server-side
  const { data: stats, error } = await supabase
    .from("player_stats")
    .select("user_id, total_games, wins, win_rate")
    .order("win_rate", { ascending: false })
    .limit(10);

  if (error || !stats || stats.length === 0) {
    if (error) console.error("[leaderboard] getLeaderboard:", error.message);
    return [];
  }

  // Fetch display names for those users
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, display_name, avatar_emoji")
    .in("id", stats.map(s => s.user_id));

  const profileMap: Record<string, { display_name: string; avatar_emoji: string }> = {};
  for (const p of profiles ?? []) profileMap[p.id] = p;

  return stats.map(s => ({
    userId:      s.user_id as string,
    displayName: profileMap[s.user_id as string]?.display_name ?? "Player",
    avatarEmoji: profileMap[s.user_id as string]?.avatar_emoji  ?? "",
    totalGames:  s.total_games as number,
    wins:        s.wins        as number,
    winRate:     s.win_rate    as number,
  }));
}
