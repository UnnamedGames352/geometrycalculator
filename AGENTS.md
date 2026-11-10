<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Gate decisions and admin operations must verify the encrypted server session and browser restrictions server-side; browser UUIDs and User-Agent are resettable/spoofable signals, not hardware identity.
- Persist failed-attempt windows and global eviction in service-role-only PostgreSQL RPCs for atomic cross-worker enforcement; keep gate data inaccessible to anonymous Data API clients.
- Inject browser-safe disguise and guard scripts before streamed game code; use pagehide and explicit same-origin navigation markers rather than assuming unload reliably fires.
- Playtime is credited in app code (settlePlaytime) from game_started_at to last_seen, never via a DB trigger, so closed tabs don't keep accruing time.
