import { createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { listPlayerRoster, savePlayerAdminNote, type PlayerRosterRow } from "@/lib/roster.functions";

export const Route = createFileRoute("/admin-roster")({
  loader: async () => {
    const { isAdmin } = await import("@/lib/gate.server");
    if (!(await isAdmin())) throw redirect({ to: "/geometry" });
    return listPlayerRoster();
  },
  component: AdminRoster,
});

const duration = (seconds: number) => {
  const totalMinutes = Math.floor(seconds / 60);
  return `${Math.floor(totalMinutes / 60)}h ${totalMinutes % 60}m`;
};
const lastSeen = (value: string | null) => value ? new Date(value).toLocaleString() : "Never";

function AdminRoster() {
  const { players } = Route.useLoaderData();
  const saveNote = useServerFn(savePlayerAdminNote);
  const router = useRouter();
  const [savingId, setSavingId] = useState<string | null>(null);

  async function editNote(player: PlayerRosterRow) {
    const note = prompt(`Private admin note for ${player.name}`, player.admin_note ?? "");
    if (note === null) return;
    setSavingId(player.id);
    try {
      await saveNote({ data: { id: player.id, note } });
      await router.invalidate();
    } catch (error) {
      alert(error instanceof Error ? error.message : "Could not save note");
    } finally {
      setSavingId(null);
    }
  }

  return <main className="mx-auto min-h-screen max-w-7xl bg-background p-5 text-foreground sm:p-8">
    <header className="mb-6">
      <h1 className="text-3xl font-bold">Player Roster</h1>
      <p className="mt-2 text-sm text-muted-foreground">Device details are browser-reported, can be unavailable or changed, and are not hardware identity. Only admins can view this roster and its notes.</p>
      <p className="mt-1 text-xs text-muted-foreground"><a className="underline" href="/admin">Back to site controls</a></p>
    </header>
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full min-w-[1100px] border-collapse text-left text-sm">
        <thead className="bg-muted/50"><tr>{["Friend", "Browser ID", "Browser / ChromeOS", "Screen", "CPU cores", "Memory", "Total playtime", "Most-played game", "Last seen", "Private admin note", ""].map((heading) => <th key={heading} className="whitespace-nowrap px-3 py-3 font-semibold">{heading}</th>)}</tr></thead>
        <tbody>
          {players.length === 0 && <tr><td colSpan={11} className="p-5 text-muted-foreground">No friends have signed in yet.</td></tr>}
          {players.map((player) => {
            const plays = player.game_playtime ?? {};
            const topGame = Object.entries(plays).sort((a, b) => b[1] - a[1])[0];
            const currentElapsed = player.current_game && player.game_started_at
              ? Math.max(0, Math.floor((Date.now() - new Date(player.game_started_at).getTime()) / 1000)) : 0;
            const currentCounts = player.current_game ? (plays[player.current_game] ?? 0) + currentElapsed : 0;
            const currentTop = player.current_game && (!topGame || currentCounts > topGame[1]) ? [player.current_game, currentCounts] as [string, number] : topGame;
            return <tr key={player.id} className="border-t border-border align-top">
              <td className="px-3 py-3 font-medium">{player.name || "(no name)"}</td>
              <td className="max-w-48 break-all px-3 py-3 font-mono text-xs">{player.device_id ?? "Not recorded"}</td>
              <td className="px-3 py-3">{player.device ?? "Unknown"}<br/><span className="text-xs text-muted-foreground">{player.browser_version ?? "Not recorded"}</span></td>
              <td className="px-3 py-3">{player.screen_size ?? "Not available"}</td>
              <td className="px-3 py-3">{player.cpu_cores ?? "Not available"}</td>
              <td className="px-3 py-3">{player.device_memory_gb ? `${player.device_memory_gb} GB` : "Not available"}</td>
              <td className="whitespace-nowrap px-3 py-3">{duration((player.playtime_seconds ?? 0) + currentElapsed)}</td>
              <td className="px-3 py-3">{currentTop ? <>{currentTop[0]}<br/><span className="text-xs text-muted-foreground">{duration(currentTop[1])}</span></> : "No game data yet"}</td>
              <td className="whitespace-nowrap px-3 py-3">{lastSeen(player.last_seen)}</td>
              <td className="max-w-48 whitespace-pre-wrap px-3 py-3">{player.admin_note || "—"}</td>
              <td className="px-3 py-3"><Button variant="outline" size="sm" disabled={savingId === player.id} onClick={() => void editNote(player)}>{savingId === player.id ? "Saving…" : "Edit note"}</Button></td>
            </tr>;
          })}
        </tbody>
      </table>
    </div>
  </main>;
}
