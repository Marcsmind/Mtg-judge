/** Discriminated union of all top-level app tab identifiers.
 *  Use this instead of `string` for `activeTab` props to get
 *  compile-time safety when adding or renaming tabs.
 */
export type TabId = "judge" | "life" | "dice" | "turns" | "rules" | "settings" | "deck" | "leaderboard";
