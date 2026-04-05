"use client";

import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/lib/auth-context";
import { useRouter } from "next/navigation";
import {
  collection,
  doc,
  getDocs,
  writeBatch,
  onSnapshot,
  setDoc,
} from "firebase/firestore";
import { db } from "@/lib/firebase";

// ─────────────────────────────────────────────
// Types (inline to avoid import issues)
// ─────────────────────────────────────────────
interface SlotEntry {
  slotNumber: number;
  gameId: string;
  gameName: string;
  status: string;
}

interface LiveState {
  slots: SlotEntry[];
  currentSlot: number;
  phase: string;
  currentGameId: string;
  currentRoundTitle: string;
  playerCount: number;
}

const GAME_LIBRARY = [
  { id: "A1", name: "Majority Trap (2/3 Average)",   category: "Web" },
  { id: "A2", name: "Minority Trap (Range Hunter)",  category: "Web" },
  { id: "A3", name: "Traveler's Dilemma",            category: "Web" },
  { id: "A4", name: "Borda Sabotage",                category: "Web" },
  { id: "B5", name: "Black Hole (Physical Grid)",    category: "Physical" },
  { id: "B6", name: "Bidding Survival",              category: "Web" },
  { id: "B7", name: "Braess Paradox",                category: "Web" },
  { id: "B8", name: "Information Cascade",           category: "Web" },
  { id: "C9", name: "Sequence Match",                category: "Web" },
  { id: "C10", name: "Peak Finder",                  category: "Web" },
  { id: "LEMONS", name: "Market of Lemons",          category: "Hybrid" },
  { id: "SILENCE", name: "Pluralistic Silence",      category: "Psychological" },
  { id: "OFFLINE", name: "Manual / Physical Trial",  category: "Offline" },
];

// ─────────────────────────────────────────────
// The clean eventConfig + gameState defaults
// ─────────────────────────────────────────────
const CLEAN_EVENT_CONFIG = {
  eventName: "New Event",
  totalSlots: 100,
  slots: [],
};

const CLEAN_GAME_STATE = {
  currentSlot: 1,
  phase: "lobby",
  currentGameId: "",
  currentRoundTitle: "",
  playersAlive: 0,
  totalRegistered: 0,
  submissionsCount: 0,
  timerDuration: 60,
  timerStartedAt: null,
  phaseEndsAt: null,
  timerPaused: false,
  results: null,
  pendingEliminations: [],
  displayMessage: null,
  emergencyPause: false,
  wildEntryOpen: false,
  roundType: "standard",
  winnerId: null,
  gameHistory: {},
  customOptions: [],
  gameSpecificConfig: null,
  pairingComplete: false,
};

// ─────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────
export default function AdminBuilderPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [live, setLive] = useState<LiveState | null>(null);
  const [playerCount, setPlayerCount] = useState(0);
  const [isBusy, setIsBusy] = useState(false);
  const [pickedGame, setPickedGame] = useState<string | null>(null);
  const [timer, setTimer] = useState(60);
  const [status, setStatus] = useState("");

  // ── Auth guard ──────────────────────────────
  useEffect(() => {
    if (authLoading) return;
    if (!user) router.push("/admin");
  }, [user, authLoading, router]);

  // ── Live subscription ───────────────────────
  useEffect(() => {
    if (!user) return;

    const unsubConfig = onSnapshot(doc(db, "system", "eventConfig"), (snap) => {
      if (!snap.exists()) return;
      const data = snap.data();
      setLive((prev) => ({
        slots: data.slots || [],
        currentSlot: prev?.currentSlot ?? 1,
        phase: prev?.phase ?? "lobby",
        currentGameId: prev?.currentGameId ?? "",
        currentRoundTitle: prev?.currentRoundTitle ?? "",
        playerCount: prev?.playerCount ?? 0,
      }));
    });

    const unsubState = onSnapshot(doc(db, "system", "gameState"), (snap) => {
      if (!snap.exists()) return;
      const data = snap.data();
      setLive((prev) => ({
        slots: prev?.slots ?? [],
        currentSlot: data.currentSlot ?? 1,
        phase: data.phase ?? "lobby",
        currentGameId: data.currentGameId ?? "",
        currentRoundTitle: data.currentRoundTitle ?? "",
        playerCount: prev?.playerCount ?? 0,
      }));
    });

    const unsubPlayers = onSnapshot(collection(db, "players"), (snap) => {
      setPlayerCount(snap.size);
      setLive((prev) =>
        prev ? { ...prev, playerCount: snap.size } : null
      );
    });

    return () => {
      unsubConfig();
      unsubState();
      unsubPlayers();
    };
  }, [user]);

  // ── END EVENT — nuclear reset ───────────────
  const handleEndEvent = useCallback(async () => {
    if (!confirm("⚠️ END EVENT\n\nThis will:\n• Delete ALL player accounts\n• Clear ALL game slots\n• Reset to a brand-new event\n\nThis CANNOT be undone. Continue?")) return;

    setIsBusy(true);
    setStatus("Deleting players...");

    try {
      // Step 1 — delete players (in chunks of 490 to stay under 500 batch limit)
      const pSnap = await getDocs(collection(db, "players"));
      for (let i = 0; i < pSnap.docs.length; i += 490) {
        const chunk = pSnap.docs.slice(i, i + 490);
        const b = writeBatch(db);
        chunk.forEach((d) => b.delete(d.ref));
        await b.commit();
      }

      // Step 2 — delete submissions
      setStatus("Deleting submissions...");
      const sSnap = await getDocs(collection(db, "submissions"));
      for (let i = 0; i < sSnap.docs.length; i += 490) {
        const chunk = sSnap.docs.slice(i, i + 490);
        const b = writeBatch(db);
        chunk.forEach((d) => b.delete(d.ref));
        await b.commit();
      }

      // Step 3 — delete idempotency keys
      setStatus("Clearing idempotency keys...");
      const iSnap = await getDocs(collection(db, "idempotencyKeys"));
      if (!iSnap.empty) {
        for (let i = 0; i < iSnap.docs.length; i += 490) {
          const chunk = iSnap.docs.slice(i, i + 490);
          const b = writeBatch(db);
          chunk.forEach((d) => b.delete(d.ref));
          await b.commit();
        }
      }

      // Step 4 — delete rate limits
      const rSnap = await getDocs(collection(db, "rateLimits"));
      if (!rSnap.empty) {
        const b = writeBatch(db);
        rSnap.docs.forEach((d) => b.delete(d.ref));
        await b.commit();
      }

      // Step 5 — delete lemon / trade data
      const laSnap = await getDocs(collection(db, "lemonAssignments"));
      const mtSnap = await getDocs(collection(db, "marketTrades"));
      const b3 = writeBatch(db);
      laSnap.docs.forEach((d) => b3.delete(d.ref));
      mtSnap.docs.forEach((d) => b3.delete(d.ref));
      await b3.commit();

      // Step 6 — OVERWRITE system docs with setDoc (NOT updateDoc — ensures full reset)
      setStatus("Resetting event system...");
      await setDoc(doc(db, "system", "eventConfig"), CLEAN_EVENT_CONFIG);
      await setDoc(doc(db, "system", "gameState"), CLEAN_GAME_STATE);

      setStatus("✅ Done! Reloading...");

      // Step 7 — hard reload so ALL React state is wiped
      setTimeout(() => {
        window.location.href = "/admin/builder";
      }, 800);
    } catch (err: any) {
      setStatus("❌ Error: " + err.message);
      setIsBusy(false);
    }
  }, []);

  // ── ADD NEXT SLOT ───────────────────────────
  const handleAddSlot = useCallback(async () => {
    if (!pickedGame) { alert("Pick a game first."); return; }
    if (!live) return;

    setIsBusy(true);
    try {
      // Always read slots FRESH from Firestore
      const configSnap = await getDocs(collection(db, "system"));
      const freshSlots: SlotEntry[] =
        configSnap.docs.find((d) => d.id === "eventConfig")?.data()?.slots ?? [];

      // Next slot number = max existing + 1, or 1 if none
      const nextSlotNum =
        freshSlots.length > 0
          ? Math.max(...freshSlots.map((s) => s.slotNumber)) + 1
          : 1;

      const gameDef = GAME_LIBRARY.find((g) => g.id === pickedGame)!;
      const newSlot: SlotEntry & { config: any } = {
        slotNumber: nextSlotNum,
        gameId: gameDef.id,
        gameName: gameDef.name,
        status: "pending",
        config: {
          timerSeconds: timer,
          pointsFirst: 30,
          pointsSecond: 20,
          pointsThird: 10,
          pointsSafe: 0,
          pointsEliminated: -30,
          eliminationMode: "percentage",
          eliminationValue: 20,
          advancementCount: 1,
          tieBreaker: "admin",
          penaltyNoSubmit: -10,
          bonusTopN: 0,
          visibleToPlayers: true,
          gameSpecificConfig: {},
        },
      };

      const updatedSlots = [...freshSlots, newSlot].sort(
        (a, b) => a.slotNumber - b.slotNumber
      );

      const b = writeBatch(db);
      b.update(doc(db, "system", "eventConfig"), { slots: updatedSlots });

      // If this is slot 1 and gameState has no game configured yet, wire it up
      if (nextSlotNum === 1 && (!live.currentGameId || live.currentGameId === "")) {
        b.update(doc(db, "system", "gameState"), {
          currentGameId: gameDef.id,
          currentRoundTitle: gameDef.name,
          currentSlot: 1,
          phase: "lobby",
        });
      }

      await b.commit();
      setPickedGame(null);
    } catch (err: any) {
      alert("Error adding slot: " + err.message);
    }
    setIsBusy(false);
  }, [pickedGame, timer, live]);

  // ── DELETE individual slot ──────────────────
  const handleDeleteSlot = useCallback(
    async (slotNumber: number) => {
      if (!confirm(`Delete Slot ${slotNumber}?`)) return;
      setIsBusy(true);
      try {
        const configSnap = await getDocs(collection(db, "system"));
        const freshSlots: SlotEntry[] =
          configSnap.docs.find((d) => d.id === "eventConfig")?.data()?.slots ?? [];
        const updated = freshSlots.filter((s) => s.slotNumber !== slotNumber);
        const bDel = writeBatch(db);
        bDel.update(doc(db, "system", "eventConfig"), { slots: updated });
        await bDel.commit();
      } catch (err: any) {
        alert("Error: " + err.message);
      }
      setIsBusy(false);
    },
    []
  );

  // ── GO TO DASHBOARD ─────────────────────────
  const goToDashboard = () => router.push("/admin/dashboard");

  // ══════════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════════

  if (authLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center font-mono text-primary text-sm tracking-widest uppercase animate-pulse">
        Verifying identity...
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-background text-textDefault font-mono flex flex-col">
      {/* ── Header ── */}
      <header className="bg-surface border-b border-border px-6 py-4 flex items-center justify-between sticky top-0 z-20">
        <div>
          <h1 className="font-serif text-2xl tracking-widest uppercase text-textDefault">
            Event Builder
          </h1>
          <p className="text-xs text-secondary tracking-widest mt-0.5">
            House of Trials — Slot Configurator
          </p>
        </div>

        <div className="flex items-center gap-4">
          {/* Live indicators */}
          <div className="hidden md:flex gap-6 text-center text-xs border border-border px-4 py-2 bg-background">
            <div>
              <p className="text-textMuted uppercase tracking-widest mb-0.5">Players</p>
              <p className="text-xl font-bold text-textDefault">{playerCount}</p>
            </div>
            <div>
              <p className="text-textMuted uppercase tracking-widest mb-0.5">Slots</p>
              <p className="text-xl font-bold text-secondary">{live?.slots.length ?? 0}</p>
            </div>
            <div>
              <p className="text-textMuted uppercase tracking-widest mb-0.5">Phase</p>
              <p className="text-xl font-bold text-primary uppercase animate-pulse">{live?.phase ?? "—"}</p>
            </div>
          </div>

          <button
            onClick={goToDashboard}
            className="border border-border px-4 py-2 text-xs uppercase tracking-widest hover:bg-border transition-colors"
          >
            ⚡ Live Dashboard
          </button>

          <button
            onClick={handleEndEvent}
            disabled={isBusy}
            className="bg-red-900/40 border border-red-600 text-red-400 hover:bg-red-700 hover:text-white px-5 py-2 text-xs uppercase font-bold tracking-widest transition-colors disabled:opacity-40"
          >
            {isBusy ? status : "✕ END EVENT"}
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* ── Left: Slot list ── */}
        <aside className="w-72 border-r border-border bg-surface/50 flex flex-col overflow-y-auto">
          <div className="p-4 border-b border-border">
            <p className="text-xs text-textMuted uppercase tracking-widest">
              Sequence — {live?.slots.length ?? 0} slot(s)
            </p>
          </div>

          <div className="flex-1 p-3 space-y-2">
            {(!live || live.slots.length === 0) && (
              <div className="border border-dashed border-secondary/30 p-6 text-center mt-4">
                <p className="text-xs text-textMuted uppercase tracking-widest mb-1">
                  No Slots
                </p>
                <p className="text-[10px] text-secondary">
                  Pick a game on the right to add Slot 1 →
                </p>
              </div>
            )}

            {live?.slots.map((s) => {
              const isCurrent = s.slotNumber === live.currentSlot;
              const isPast = s.slotNumber < live.currentSlot;
              return (
                <div
                  key={s.slotNumber}
                  className={`p-3 border text-xs leading-relaxed flex items-center justify-between group ${
                    isCurrent
                      ? "bg-secondary/20 border-secondary text-secondary"
                      : isPast
                      ? "bg-primary/10 border-primary/40 text-textMuted/50"
                      : "bg-background border-border text-textMuted"
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-bold uppercase tracking-widest">
                        Slot {s.slotNumber}
                      </span>
                      {isCurrent && (
                        <span className="text-[8px] bg-secondary/20 text-secondary px-1 uppercase">
                          Active
                        </span>
                      )}
                      {isPast && (
                        <span className="text-[8px] text-textMuted/40">Done</span>
                      )}
                    </div>
                    <div className="truncate text-[10px] mt-0.5 opacity-70">
                      {s.gameId} — {s.gameName}
                    </div>
                  </div>
                  {!isPast && !isCurrent && (
                    <button
                      onClick={() => handleDeleteSlot(s.slotNumber)}
                      className="opacity-0 group-hover:opacity-100 text-primary text-[10px] uppercase px-2 py-0.5 border border-primary/30 hover:bg-primary/20 transition-all ml-2"
                    >
                      ✕
                    </button>
                  )}
                </div>
              );
            })}

            {live && live.slots.length > 0 && (
              <div className="border border-dashed border-secondary/20 p-3 text-center mt-2">
                <p className="text-[10px] text-secondary/60 uppercase tracking-widest">
                  Slot {(live.slots[live.slots.length - 1]?.slotNumber ?? 0) + 1} — Add below
                </p>
              </div>
            )}
          </div>
        </aside>

        {/* ── Right: Add slot panel ── */}
        <div className="flex-1 p-8 overflow-auto">
          <div className="max-w-3xl mx-auto space-y-8">

            {/* Status banner */}
            {isBusy && status && (
              <div className="border border-secondary bg-secondary/10 px-4 py-3 text-sm text-secondary uppercase tracking-widest animate-pulse">
                {status}
              </div>
            )}

            {/* Current event state */}
            <div className="border border-border bg-surface p-6 grid grid-cols-3 gap-6 text-center">
              <div>
                <p className="text-[10px] text-textMuted uppercase tracking-widest mb-1">Current Slot</p>
                <p className="text-3xl font-bold text-textDefault">{live?.currentSlot ?? 1}</p>
              </div>
              <div>
                <p className="text-[10px] text-textMuted uppercase tracking-widest mb-1">Phase</p>
                <p className="text-3xl font-bold text-primary uppercase animate-pulse">{live?.phase ?? "—"}</p>
              </div>
              <div>
                <p className="text-[10px] text-textMuted uppercase tracking-widest mb-1">Total Slots Built</p>
                <p className="text-3xl font-bold text-secondary">{live?.slots.length ?? 0}</p>
              </div>
            </div>

            {/* Add slot section */}
            <div className="border border-border bg-surface p-6 space-y-6">
              <div className="border-b border-border pb-4">
                <h2 className="text-sm uppercase tracking-widest text-textDefault font-bold">
                  Add Next Slot
                </h2>
                <p className="text-xs text-textMuted mt-1">
                  Pick a game below to configure and add it to the sequence.
                </p>
              </div>

              {/* Game picker */}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {GAME_LIBRARY.map((game) => (
                  <button
                    key={game.id}
                    onClick={() => setPickedGame(game.id)}
                    className={`p-4 border text-left transition-all ${
                      pickedGame === game.id
                        ? "bg-secondary/20 border-secondary shadow-glow-gold"
                        : "bg-background border-border hover:border-secondary/50 hover:bg-surface"
                    }`}
                  >
                    <span className="text-[9px] text-secondary font-bold uppercase block mb-1">
                      {game.category} · {game.id}
                    </span>
                    <span className="text-xs font-bold text-textDefault leading-tight">
                      {game.name}
                    </span>
                  </button>
                ))}
              </div>

              {/* Timer config */}
              {pickedGame && (
                <div className="border border-secondary/30 bg-secondary/5 p-4 space-y-4">
                  <p className="text-xs text-secondary uppercase tracking-widest font-bold">
                    Configuring: {GAME_LIBRARY.find((g) => g.id === pickedGame)?.name}
                  </p>
                  <div className="flex items-center gap-4">
                    <label className="text-[10px] text-textMuted uppercase tracking-widest w-40">
                      Timer (seconds)
                    </label>
                    <input
                      type="number"
                      min={10}
                      max={600}
                      value={timer}
                      onChange={(e) => setTimer(parseInt(e.target.value) || 60)}
                      className="bg-background border border-border px-3 py-1.5 w-24 outline-none focus:border-secondary text-sm text-right"
                    />
                  </div>
                  <button
                    onClick={handleAddSlot}
                    disabled={isBusy}
                    className="w-full bg-secondary/80 text-background py-3 font-bold tracking-widest uppercase hover:bg-secondary shadow-glow-gold transition-colors text-sm disabled:opacity-40"
                  >
                    {isBusy
                      ? "Adding..."
                      : `+ Add Slot ${(live?.slots.length ?? 0) + 1} — ${GAME_LIBRARY.find((g) => g.id === pickedGame)?.id}`}
                  </button>
                </div>
              )}
            </div>

            {/* END EVENT big button */}
            <div className="border border-red-800/50 bg-red-950/20 p-6 space-y-4">
              <div>
                <h2 className="text-sm uppercase tracking-widest text-red-400 font-bold">Danger Zone</h2>
                <p className="text-xs text-textMuted mt-1">
                  End Event wipes ALL players, submissions, and slots. Players are returned to the registration page. A completely new event can start from Slot 1.
                </p>
              </div>
              <button
                onClick={handleEndEvent}
                disabled={isBusy}
                className="w-full border border-red-600 bg-red-900/30 text-red-400 hover:bg-red-700 hover:text-white py-4 font-bold tracking-[0.2em] uppercase text-sm transition-colors disabled:opacity-40"
              >
                {isBusy ? status : "✕ END EVENT & RESET EVERYTHING"}
              </button>
            </div>

          </div>
        </div>
      </div>
    </main>
  );
}
