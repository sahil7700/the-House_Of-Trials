"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useRouter } from "next/navigation";
import { subscribeToGameState, subscribeToEventConfig, GameState, EventConfig, GamePhase, GameSlotConfig } from "@/lib/services/game-service";
import { updateGameState, startTimer, confirmEliminations, emergencyPauseToggle, finalizeRoundResults, PlayerRoundUpdate, resetToSlotOne } from "@/lib/services/admin-service";
import { collection, onSnapshot, query, doc, writeBatch, getDocs, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { PlayerData } from "@/lib/services/player-service";
import AdminGameStats from "./components/AdminGameStats";

const STANDARD_PHASES: GamePhase[] = ["lobby", "active", "locked", "calculating", "reveal", "confirm", "standby"];
const C9_PHASES: GamePhase[] = ["lobby", "active_a", "locked_a", "active_b", "locked_b", "calculating", "reveal", "confirm", "standby"];

export default function AdminDashboard() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [eventConfig, setEventConfig] = useState<EventConfig | null>(null);
  const [players, setPlayers] = useState<PlayerData[]>([]);
  const [calculating, setCalculating] = useState(false);
  const [pendingUpdates, setPendingUpdates] = useState<Record<string, PlayerRoundUpdate>>({});
  
  // Next Round Config Draft
  const [nextGameId, setNextGameId] = useState("A1");
  const [nextGameTitle, setNextGameTitle] = useState("");
  const [nextGameTimer, setNextGameTimer] = useState(60);
  const [nextRoundType, setNextRoundType] = useState<"standard" | "semi-final" | "final">("standard");
  const [nextCustomOptions, setNextCustomOptions] = useState<string[]>(["Option A", "Option B", "Option C", "Option D"]);
  // A1 / A3 config
  const [nextA1Multiplier, setNextA1Multiplier] = useState(0.666);
  const [nextA3Penalty, setNextA3Penalty] = useState(5);
  const [nextA3Bonus, setNextA3Bonus] = useState(5);
  // B7 config
  const [nextB7Threshold, setNextB7Threshold] = useState(60);
  const [nextB7FixedTime, setNextB7FixedTime] = useState(25);
  // C10 config
  const [nextC10Sequence, setNextC10Sequence] = useState<number[]>([]);
  const [c10DragSrc, setC10DragSrc] = useState<number | null>(null);

  // V3 Architecture: State A - Inline Game Picker
  const [pickerSelectedGame, setPickerSelectedGame] = useState<string | null>(null);

  const GAME_LIBRARY = [
    { id: "A1", name: "Majority Trap (2/3 Average)", category: "Web", desc: "Guess 2/3 of the average." },
    { id: "A2", name: "Minority Trap (Range Hunter)", category: "Web", desc: "Select the least popular range." },
    { id: "A3", name: "Traveler's Dilemma", category: "Web", desc: "Low bid wins with penalty offsets." },
    { id: "A4", name: "Borda Sabotage", category: "Web", desc: "Four-choice vulnerability polling." },
    { id: "B5", name: "Black Hole (The Grid)", category: "Physical", desc: "Solve the grid pyramid locally." },
    { id: "B7", name: "Braess Paradox", category: "Web", desc: "Route 1 vs slow Route 2 threshold." },
    { id: "B8", name: "Information Cascade", category: "Web", desc: "Trust your signal vs Fake Majority." },
    { id: "C10", name: "Peak Finder", category: "Web", desc: "Position correctly on the curve." },
    { id: "B6", name: "Bidding Survival", category: "Web", desc: "Auction style point elimination." },
    { id: "C9", name: "Sequence Match", category: "Web", desc: "3-digit asymmetric sequence pairing." },
    { id: "LEMONS", name: "Market of Lemons", category: "Hybrid", desc: "Physical negotiation web trading." },
    { id: "SILENCE", name: "Pluralistic Silence", category: "Psychological", desc: "Visual memory fake-out pressure." },
  ];

  const generateC10Sequence = () => {
    // Build a realistic peak-finder sequence: low start, peak near position 10, taper off
    const arr: number[] = [];
    for (let i = 0; i < 20; i++) {
      let val: number;
      if (i < 7)       val = Math.floor(Math.random() * 30) + 30; // 30-59 warmup
      else if (i < 12) val = Math.floor(Math.random() * 25) + 70; // 70-94 peak window
      else if (i < 17) val = Math.floor(Math.random() * 30) + 25; // 25-54 taper
      else             val = Math.floor(Math.random() * 20) + 35; // 35-54 final
      arr.push(val);
    }
    // Ensure only ONE clear global peak in positions 8-12
    const peakPos = 7 + Math.floor(Math.random() * 5);
    arr[peakPos] = Math.floor(Math.random() * 10) + 90; // 90-99 spike
    setNextC10Sequence(arr);
  };

  const swapC10Cards = (fromIdx: number, toIdx: number) => {
    const arr = [...nextC10Sequence];
    [arr[fromIdx], arr[toIdx]] = [arr[toIdx], arr[fromIdx]];
    setNextC10Sequence(arr);
  };


  const getGamePlayCount = (id: string) => {
    return gameState?.gameHistory?.[id] || 0;
  };

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.push("/admin");
      return;
    }
    
    const unsubGame = subscribeToGameState(setGameState);
    const unsubConfig = subscribeToEventConfig(setEventConfig);
    
    const playersQuery = query(collection(db, "players"));
    const unsubPlayers = onSnapshot(playersQuery, (snapshot) => {
      const p = snapshot.docs.map(d => d.data() as PlayerData);
      setPlayers(p);
    });

    return () => {
      unsubGame();
      unsubConfig();
      unsubPlayers();
    };
  }, [user, authLoading, router]);

  // Auto-lock when all alive players have submitted
  useEffect(() => {
    if (!gameState) return;
    const isAct = gameState.phase === "active" || gameState.phase === "active_a" || gameState.phase === "active_b";
    if (!isAct) return;
    const totalAlive = players.filter(p => p.status === "alive").length;
    const submitted = players.filter(p => p.currentSubmission !== null && p.status === "alive").length;
    if (totalAlive > 0 && submitted >= totalAlive) {
      if (gameState.phase === "active") updateGameState({ phase: "locked" });
      if (gameState.phase === "active_a") updateGameState({ phase: "locked_a" });
      if (gameState.phase === "active_b") updateGameState({ phase: "locked_b" });
    }
  }, [players, gameState]);

  // Sync results to pending updates for orchestration
  useEffect(() => {
    if (gameState?.phase === "reveal" && gameState.results?.eliminatedPlayerIds) {
      const eliminatedIds = gameState.results.eliminatedPlayerIds;
      const fresh: Record<string, PlayerRoundUpdate> = {};
      players.filter(p => p.status === "alive").forEach(p => {
        const isEliminated = eliminatedIds.includes(p.id);
        const mapDelta = gameState.results.pointsDeltaMap?.[p.id];
        fresh[p.id] = {
          uid: p.id,
          status: isEliminated ? "eliminated" : "alive",
          pointsDelta: mapDelta !== undefined ? mapDelta : (isEliminated ? 0 : 10) // Fallback to 10 for generic games
        };
      });
      setPendingUpdates(fresh);
    }
  }, [gameState?.phase, players.length]); // Depend on phase and players count

  if (authLoading) return <div className="p-8 font-mono text-textMuted bg-background min-h-screen">Verifying identity...</div>;

  if (!gameState || !eventConfig) {
    return (
      <div className="p-8 font-mono text-textDefault bg-background min-h-screen flex flex-col items-center justify-center space-y-6 bg-scanlines relative">
        <div className="z-10 text-center flex flex-col items-center space-y-6">
          <p className="text-xl text-primary animate-pulse tracking-widest uppercase">System Uninitialized</p>
          <p className="text-sm text-textMuted max-w-sm">
            Event configuration is missing or invalid. Please initialize the House of Trials empty framework.
          </p>
          <button 
            onClick={async () => {
               const batch = writeBatch(db);
               batch.set(doc(db, "system", "eventConfig"), { eventName: "Live Event", totalSlots: 100, slots: [] });
               batch.set(doc(db, "system", "gameState"), { 
                  currentSlot: 1, phase: "lobby", currentGameId: "", playersAlive: 0, submissionsCount: 0, timerDuration: 60, timerStartedAt: null, phaseEndsAt: null, displayMessage: null, pendingEliminations: [], results: null, timerPaused: false, wildEntryOpen: false, roundType: "standard", winnerId: null, gameHistory: {}
               });
               await batch.commit();
            }}
            className="px-6 py-3 bg-primary/20 text-primary border border-primary hover:bg-primary hover:text-white transition-colors tracking-widest uppercase shadow-glow-red"
          >
            INITIALIZE FRAMEWORK
          </button>
        </div>
      </div>
    );
  }

  const currentSlotConfig = eventConfig.slots.find(s => s.slotNumber === gameState.currentSlot);
  // Authoritative game ID: slot config takes priority over stale gameState.currentGameId
  const activeGameId = currentSlotConfig?.gameId || gameState.currentGameId;
  
  const totalAlive = players.filter(p => p.status === "alive").length;
  const submissionsCount = players.filter(p => p.currentSubmission !== null && p.status === "alive").length;

  const setPhase = (phase: GamePhase) => updateGameState({ phase });

  const handleCalculateResult = async () => {
    setCalculating(true);
    setPhase("calculating");
    try {
      const { runGenericCalculator } = await import("@/app/api/game/calculate/calculators");
      
      if (!currentSlotConfig && (!activeGameId || activeGameId === "OFFLINE")) {
        throw new Error("Invalid slot config. An active or generic game ID must be present.");
      }

      // Build submissions from the already-loaded players state (avoids querying
      // the submissions collection which the admin may not have read access to).
      // We use 'alive' players who have a non-null currentSubmission.
      const submissions = players
        .filter(p => p.status === "alive" && p.currentSubmission !== null && p.currentSubmission !== undefined)
        .map(p => ({
          id: p.id,
          playerId: p.id,
          slotNumber: gameState.currentSlot,
          value: p.currentSubmission
        }));

      if (submissions.length === 0) {
        // No submissions — just move to reveal with empty result
        await updateGameState({ results: { eliminatedPlayerIds: [] }, phase: "reveal" });
        setCalculating(false);
        return;
      }

      // Run Dynamic Calculator
      const calcConfig = currentSlotConfig || {
        gameId: activeGameId,
        config: {
          eliminationValue: 1,
          gameSpecificConfig: {
             customOptions: gameState.customOptions,
             ...((gameState as any).gameSpecificConfig || {})
          }
        }
      };

      if (activeGameId === "B6") {
         const res = await fetch("/api/game/bidding-survival/calculate", {
            method: "POST", body: JSON.stringify({ slotNumber: gameState.currentSlot, gameId: "B6", config: calcConfig.config })
         });
         const data = await res.json();
         if (!data.success) throw new Error(data.error);
         
         await updateGameState({ results: { ...data.results, eliminatedPlayerIds: data.eliminatedPlayerIds }, phase: "reveal" });
         setCalculating(false);
         return;
      }
      
      if (activeGameId === "B8") {
         const res = await fetch("/api/game/information-cascade/calculate", {
            method: "POST", body: JSON.stringify({ slotNumber: gameState.currentSlot, gameId: "B8", config: calcConfig.config, gameSpecificConfig: gameState.gameSpecificConfig })
         });
         const data = await res.json();
         if (!data.success) throw new Error(data.error);
         
         await updateGameState({ results: { ...data.results, eliminatedPlayerIds: data.eliminatedPlayerIds }, phase: "reveal" });
         setCalculating(false);
         return;
      }

      if (activeGameId === "C9") {
         const res = await fetch("/api/game/sequence-match/calculate", {
            method: "POST", body: JSON.stringify({ slotNumber: gameState.currentSlot, gameId: "C9", config: calcConfig.config })
         });
         const data = await res.json();
         if (!data.success) throw new Error(data.error);
         
         const { writeBatch, doc } = await import("firebase/firestore");
         const { db } = await import("@/lib/firebase");
         const batch = writeBatch(db);
         batch.update(doc(db, "pairs", String(gameState.currentSlot)), { pairs: data.pairs });
         await batch.commit();

         await updateGameState({ 
            results: { pairs: data.pairs, eliminatedPlayerIds: data.eliminatedPlayerIds, pointsDeltaMap: data.pointsDeltaMap, message: "Calculations Complete" }, 
            phase: "reveal" 
         });
         
         setCalculating(false);
         return;
      }

      const { results, eliminatedPlayerIds } = runGenericCalculator(submissions, calcConfig as any);

      // Update GameState with results
      await updateGameState({
        results: { ...results, eliminatedPlayerIds },
        phase: "reveal"
      });
      
    } catch (e: any) {
      console.error("Calculate Error:", e);
      // Reset phase back to locked so admin can retry
      await updateGameState({ phase: "locked" });
      alert("Failed to calculate: " + e.message);
    }
    setCalculating(false);
  };

  const handleStartPhaseB = async () => {
    try {
      setCalculating(true);
      const { writeBatch, doc, collection, getDocs, getDoc, serverTimestamp } = await import("firebase/firestore");
      const { db } = await import("@/lib/firebase");
      
      const playersSnap = await getDocs(collection(db, "players"));
      const pairSnap = await getDoc(doc(db, "pairs", String(gameState?.currentSlot)));
      
      const batch = writeBatch(db);
      
      if (pairSnap.exists()) {
         const pairsData = pairSnap.data().pairs || [];
         pairsData.forEach((p: any) => {
            const pa: any = playersSnap.docs.find(d => d.id === p.playerAId)?.data();
            const pb: any = playersSnap.docs.find(d => d.id === p.playerBId)?.data();
            if (pa?.currentSubmission?.type === "sequence") p.playerA_sequence = pa.currentSubmission.value;
            if (pb?.currentSubmission?.type === "sequence") p.playerB_sequence = pb.currentSubmission.value;
         });
         batch.update(pairSnap.ref, { pairs: pairsData });
      }
      
      playersSnap.docs.forEach(d => batch.update(d.ref, { currentSubmission: null, submittedAt: null }));
      
      await batch.commit();
      
      await updateGameState({ 
         phase: "active_b", 
         submissionsCount: 0, 
         timerStartedAt: serverTimestamp() 
      });
      setCalculating(false);
    } catch (e: any) {
      console.error(e);
      alert("Failed to transition to Phase B");
      setCalculating(false);
    }
  };

  const handleFinalizeResults = async () => {
    const updates = Object.values(pendingUpdates);
    if (updates.length === 0) {
      alert("No updates to process. Ensure calculation was run.");
      return;
    }

    const isFinal = gameState.roundType === "final";
    const msg = isFinal 
      ? "CRITICAL: This is the FINAL ROUND. Finalizing will declare the winner and conclude the tournament. Continue?"
      : `Finalize round and apply points/eliminations for ${updates.length} players?`;

    if (confirm(msg)) {
      setCalculating(true);
      try {
        await finalizeRoundResults(updates, isFinal);
        setPendingUpdates({});
      } catch (e: any) {
        alert("Error finalizing: " + e.message);
      }
      setCalculating(false);
    }
  };

  const syncPendingUpdates = (eliminatedIds: string[]) => {
    const fresh: Record<string, PlayerRoundUpdate> = {};
    players.filter(p => p.status === "alive").forEach(p => {
      const isEliminated = eliminatedIds.includes(p.id);
      fresh[p.id] = {
        uid: p.id,
        status: isEliminated ? "eliminated" : "alive",
        pointsDelta: isEliminated ? 0 : 10 // Default 10 pts for survival
      };
    });
    setPendingUpdates(fresh);
  };



  const toggleElimination = (uid: string) => {
    setPendingUpdates(prev => ({
      ...prev,
      [uid]: {
        ...prev[uid],
        status: prev[uid].status === "alive" ? "eliminated" : "alive"
      }
    }));
  };

  const approveWildCard = async (uid: string) => {
    if (confirm("Approve this wild card player to join the game?")) {
      try {
        await updateDoc(doc(db, "players", uid), { status: "alive" });
      } catch (e: any) {
        alert("Error approving wild card: " + e.message);
      }
    }
  };

  const rejectWildCard = async (uid: string) => {
    if (confirm("Reject this wild card?")) {
      try {
        await updateDoc(doc(db, "players", uid), { status: "eliminated" });
      } catch (e: any) {
        alert("Error rejecting wild card: " + e.message);
      }
    }
  };

  const updatePoints = (uid: string, delta: number) => {
    setPendingUpdates(prev => ({
      ...prev,
      [uid]: {
        ...prev[uid],
        pointsDelta: delta
      }
    }));
  };

  const startDynamicRound = async () => {
    if (!nextGameTitle) {
      alert("Please enter a title for the round.");
      return;
    }
    
    setCalculating(true);
    try {
      const newHistory = { ...(gameState?.gameHistory || {}) };
      newHistory[nextGameId] = (newHistory[nextGameId] || 0) + 1;

      // Build game-specific config
      let gsc: any = {};
      if (nextGameId === "A1") {
        gsc = { multiplier: nextA1Multiplier };
      }
      if (nextGameId === "A3") {
        gsc = { penalty: nextA3Penalty, bonus: nextA3Bonus };
      }
      if (nextGameId === "B7") {
        if (!nextB7Threshold || nextB7Threshold < 1) { alert("B7: Please set a valid threshold."); setCalculating(false); return; }
        gsc = { threshold: nextB7Threshold, fixedRouteTime: nextB7FixedTime, revealStep: 0 };
      }
      if (nextGameId === "C10") {
        if (nextC10Sequence.length !== 20) { alert("C10: Generate a 20-number sequence first."); setCalculating(false); return; }
        gsc = { numberSequence: nextC10Sequence, currentNumberIndex: 0 };
      }

      // NEW: Update eventConfig if this slot doesn't exist or is different
      const currentSlots = [...(eventConfig?.slots || [])];
      const slotIndex = currentSlots.findIndex(s => s.slotNumber === gameState.currentSlot);
      
      const slotData: any = {
        slotNumber: gameState.currentSlot,
        gameId: nextGameId,
        gameName: nextGameTitle,
        status: "active",
        config: {
            timerSeconds: nextGameTimer,
            pointsFirst: 0,
            pointsSecond: 0,
            pointsThird: 0,
            pointsSafe: 10,
            pointsEliminated: 0,
            eliminationMode: "fixed",
            eliminationValue: 0,
            advancementCount: 0,
            tieBreaker: "eliminate_all",
            penaltyNoSubmit: 0,
            bonusTopN: 0,
            visibleToPlayers: true,
            gameSpecificConfig: gsc
        }
      };

      if (slotIndex === -1) {
        currentSlots.push(slotData);
      } else {
        currentSlots[slotIndex] = slotData;
      }
      
      const batchCombined = writeBatch(db);
      
      // Update eventConfig
      batchCombined.update(doc(db, "system", "eventConfig"), { slots: currentSlots });

      // Update Game State
      batchCombined.update(doc(db, "system", "gameState"), {
        currentGameId: nextGameId,
        currentRoundTitle: nextGameTitle,
        phase: "lobby",
        timerDuration: nextGameTimer,
        roundType: nextRoundType,
        customOptions: nextGameId === "A4" || nextGameId === "C9" ? nextCustomOptions : [],
        gameSpecificConfig: (nextGameId === "A1" || nextGameId === "A3" || nextGameId === "B7" || nextGameId === "C10") ? gsc : (nextGameId === "B8" ? {} : null),
        gameHistory: newHistory,
        results: null,
        submissionsCount: 0,
        phaseEndsAt: null, // Reset timers
        timerStartedAt: null
      });

      // Clear player submissions
      const pSnap = await getDocs(collection(db, "players"));
      pSnap.docs.forEach(d => batchCombined.update(d.ref, { currentSubmission: null, submittedAt: null }));
      
      await batchCombined.commit();
      
      alert(`Round "${nextGameTitle}" started!`);
    } catch (e: any) {
      alert("Error starting round: " + e.message);
    }
    setCalculating(false);
  };

  const advanceToNextSlot = () => {
    const nextSlotIndex = gameState.currentSlot;
    if (nextSlotIndex >= eventConfig.slots.length) {
      alert("End of event sequence!");
      return;
    }
    const nextSlot = eventConfig.slots[nextSlotIndex];
    updateGameState({
      currentSlot: nextSlot.slotNumber,
      currentGameId: nextSlot.gameId,
      phase: "lobby",
      results: null,
      displayMessage: null,
      submissionsCount: 0  // reset for new round
    });
    // Clear currentSubmission on all players for the new round
    import("firebase/firestore").then(({ writeBatch, doc, collection, getDocs }) => {
      import("@/lib/firebase").then(({ db }) => {
        getDocs(collection(db, "players")).then(snap => {
          const batch = writeBatch(db);
          snap.docs.forEach(d => batch.update(d.ref, { currentSubmission: null, submittedAt: null }));
          batch.commit();
        });
      });
    });
  };

  const handleEndEvent = async () => {
    const confirmed = confirm(
      "⚠️ END EVENT — This will permanently delete ALL players, submissions, and game data, and reset to 0 slots. This cannot be undone.\n\nType OK to confirm."
    );
    if (!confirmed) return;

    try {
      // 1. Delete all players
      const pSnap = await getDocs(collection(db, "players"));
      const b1 = writeBatch(db);
      pSnap.docs.forEach(d => b1.delete(d.ref));
      await b1.commit();

      // 2. Delete all submissions
      const sSnap = await getDocs(collection(db, "submissions"));
      const b2 = writeBatch(db);
      sSnap.docs.forEach(d => b2.delete(d.ref));
      await b2.commit();

      // 3. Delete lemonAssignments and marketTrades
      const laSnap = await getDocs(collection(db, "lemonAssignments"));
      const mtSnap = await getDocs(collection(db, "marketTrades"));
      const b3 = writeBatch(db);
      laSnap.docs.forEach(d => b3.delete(d.ref));
      mtSnap.docs.forEach(d => b3.delete(d.ref));
      await b3.commit();

      // 4. Reset system docs — clean slate, 0 slots, slot 1 ready
      const b4 = writeBatch(db);
      b4.set(doc(db, "system", "eventConfig"), {
        eventName: "New Event",
        totalSlots: 100,
        slots: []
      });
      b4.set(doc(db, "system", "gameState"), {
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
        gameHistory: {}
      });
      await b4.commit();

      alert("✅ Event ended. Database cleared. You can now create slots and start a new event.");
    } catch (e: any) {
      alert("Error ending event: " + e.message);
    }
  };

  return (
    <main className="min-h-screen bg-background text-textDefault flex flex-col font-mono">
      <header className="bg-surface border-b border-border p-4 flex justify-between items-center z-10 sticky top-0">
        <div>
          <h1 className="font-serif text-2xl tracking-widest uppercase text-textDefault">Live Control Room</h1>
          <p className="text-xs text-secondary tracking-widest mt-1">
            {eventConfig.eventName} • Slot {gameState.currentSlot} / {eventConfig.totalSlots}
          </p>
        </div>
        
        <div className="flex gap-8 text-center text-sm">
          <div>
            <p className="text-textMuted text-xs tracking-widest mb-1">Alive / Total</p>
            <p className="text-xl text-textDefault">{totalAlive} / {players.length}</p>
          </div>
          <div>
            <p className="text-textMuted text-xs tracking-widest mb-1">Phase</p>
            <p className="text-xl text-primary font-bold animate-pulse uppercase">{gameState.phase}</p>
          </div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => updateGameState({ wildEntryOpen: !gameState.wildEntryOpen })}
            className={`${gameState.wildEntryOpen ? 'bg-secondary text-background font-bold shadow-glow-gold' : 'bg-secondary/20 hover:bg-secondary/40 text-secondary'} border border-secondary px-4 py-2 uppercase text-xs transition-colors`}
          >
            {gameState.wildEntryOpen ? "⚡ CLOSE WILD ENTRY" : "⚡ OPEN WILD ENTRY"}
          </button>
          <button
            onClick={() => { if(confirm("Reset current slot to 1?")) resetToSlotOne(); }}
            className="bg-surface border border-border px-4 py-2 uppercase text-xs hover:bg-border transition-colors"
          >
            ↺ RESET SLOT
          </button>
          <button 
            onClick={() => emergencyPauseToggle(gameState.emergencyPause)}
            className={`${gameState.emergencyPause ? 'bg-primary text-white' : 'bg-primary/20 hover:bg-primary/50 text-primary'} border border-primary px-4 py-2 uppercase text-xs font-bold transition-colors shadow-glow-red`}
          >
            {gameState.emergencyPause ? "RESUME EVENT" : "EMERGENCY PAUSE"}
          </button>
          <button
            onClick={handleEndEvent}
            className="bg-red-900/40 border border-red-700 text-red-400 hover:bg-red-800 hover:text-white px-4 py-2 uppercase text-xs font-bold transition-colors ml-4"
          >
            ✕ END EVENT
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        
        <aside className="w-64 border-r border-border bg-surface/50 p-4 space-y-2 overflow-y-auto hidden md:block">
          <div className="flex items-center justify-between border-b border-border pb-2 mb-4">
            <p className="text-textMuted uppercase tracking-widest text-xs">Sequence</p>
            <span className="text-[10px] text-textMuted font-mono">{eventConfig.slots.length} slots</span>
          </div>

          {eventConfig.slots.length === 0 && (
            <div className="border border-dashed border-secondary/30 p-4 text-center space-y-2">
              <p className="text-[10px] text-textMuted uppercase tracking-widest">No slots yet</p>
              <p className="text-[10px] text-secondary">Pick a game below to create Slot 1 →</p>
            </div>
          )}

          {eventConfig.slots.map(s => {
            const isPast = s.slotNumber < gameState.currentSlot;
            const isCurrent = s.slotNumber === gameState.currentSlot;
            return (
              <div key={s.slotNumber} className={`p-3 border text-xs leading-relaxed ${isCurrent ? 'bg-secondary/20 border-secondary text-secondary shadow-glow-gold' : isPast ? 'bg-primary/10 border-primary/50 text-textMuted/50' : 'bg-background border-border text-textMuted'}`}>
                <div className="flex items-center justify-between">
                  <span className="uppercase tracking-widest font-bold">Slot {s.slotNumber}</span>
                  {isCurrent && <span className="text-[8px] text-secondary bg-secondary/20 px-1 uppercase">Active</span>}
                  {isPast && <span className="text-[8px] text-textMuted/50">Done</span>}
                </div>
                <div className="truncate mt-0.5 text-[10px]">{s.gameName}</div>
              </div>
            );
          })}

          {/* Next slot indicator */}
          {eventConfig.slots.length > 0 && (
            <div className="border border-dashed border-secondary/20 p-3 text-center mt-2">
              <p className="text-[10px] text-secondary/60 uppercase tracking-widest">Slot {gameState.currentSlot + eventConfig.slots.filter(s => s.slotNumber >= gameState.currentSlot).length} — Pick next</p>
            </div>
          )}
        </aside>

        <div className="flex-1 p-6 overflow-auto bg-scanlines relative">
          <div className="w-full max-w-5xl mx-auto space-y-8 relative z-10 border border-border bg-background p-8 shadow-2xl">
              
              <h2 className="font-serif text-3xl tracking-widest uppercase text-primary border-b border-border pb-4 drop-shadow-glow-red flex justify-between items-center">
                <span>{gameState.currentRoundTitle || currentSlotConfig?.gameName}</span>
                <span className="text-xs text-textMuted font-mono">ID: {activeGameId}</span>
              </h2>

              <div className="flex gap-2 w-full text-[10px] sm:text-xs overflow-x-auto pb-2">
                {(activeGameId === "C9" ? C9_PHASES : STANDARD_PHASES).map((p, i) => {
                  const isActive = gameState.phase === p;
                  return (
                    <div key={p} className={`flex-1 border p-2 text-center uppercase tracking-widest whitespace-nowrap min-w-[80px] ${isActive ? 'bg-secondary text-background font-bold' : 'bg-surface border-border text-textMuted'}`}>
                      {i + 1}. {p}
                    </div>
                  );
                })}
              </div>

              <section className="bg-surface border border-border p-6 min-h-[200px]">
                {!currentSlotConfig && (
                   <div className="space-y-6">
                      <div className="text-center space-y-2 mb-8">
                         <h3 className="text-xl uppercase tracking-widest text-primary">State A — Empty Slot {gameState.currentSlot}</h3>
                         <p className="text-xs text-textMuted uppercase tracking-widest">Select a game from the library to configure and activate.</p>
                      </div>
                      
                      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                         {GAME_LIBRARY.map(game => (
                            <button
                               key={game.id}
                               onClick={() => setPickerSelectedGame(game.id)}
                               className={`p-4 border text-left flex flex-col items-start transition-all ${pickerSelectedGame === game.id ? 'bg-secondary/20 border-secondary shadow-glow-gold' : 'bg-background border-border hover:border-secondary/50'}`}
                            >
                               <span className="text-[10px] text-secondary font-bold uppercase mb-2">{game.category} • {game.id}</span>
                               <span className="text-sm font-bold truncate w-full mb-1">{game.name}</span>
                               <span className="text-[10px] text-textMuted line-clamp-2 leading-tight">{game.desc}</span>
                            </button>
                         ))}
                      </div>

                      {pickerSelectedGame && (
                         <div className="mt-8 p-6 border border-secondary bg-secondary/5 space-y-4">
                            <h4 className="text-sm text-secondary uppercase tracking-widest border-b border-border pb-2">Initialize Slot Configuration</h4>
                            <div className="flex items-center justify-between bg-background border border-border p-4">
                               <span className="text-xs text-textMuted uppercase">Initial Timer Duration (Seconds)</span>
                               <input type="number" min="10" value={nextGameTimer} onChange={e => setNextGameTimer(parseInt(e.target.value)||60)} className="bg-surface border border-border px-3 py-1 w-24 outline-none focus:border-secondary text-right" />
                            </div>
                            <button
                               onClick={async () => {
                                  const gameDef = GAME_LIBRARY.find(g => g.id === pickerSelectedGame)!;
                                  const newSlot: GameSlotConfig = {
                                     slotNumber: gameState.currentSlot,
                                     gameId: gameDef.id,
                                     gameName: gameDef.name,
                                     status: "pending",
                                     config: { timerSeconds: nextGameTimer, pointsFirst: 30, pointsSecond: 20, pointsThird: 10, pointsSafe: 0, pointsEliminated: -30, eliminationMode: "percentage", eliminationValue: 20, advancementCount: 1, tieBreaker: "admin", penaltyNoSubmit: -10, bonusTopN: 0, visibleToPlayers: true, gameSpecificConfig: {} }
                                  };
                                  const slots = [...eventConfig.slots, newSlot].sort((a,b) => a.slotNumber - b.slotNumber);
                                  
                                  const batch = writeBatch(db);
                                  batch.update(doc(db, "system", "eventConfig"), { slots });
                                  batch.update(doc(db, "system", "gameState"), { currentGameId: gameDef.id, currentRoundTitle: gameDef.name });
                                  await batch.commit();
                               }}
                               className="w-full bg-secondary/80 text-background py-4 font-bold tracking-widest uppercase hover:bg-white shadow-glow-gold transition-colors text-sm"
                            >
                               Configure & Activate Slot {gameState.currentSlot}
                            </button>
                         </div>
                      )}
                   </div>
                )}

                {currentSlotConfig && gameState.phase === "lobby" && (
                  <div className="flex flex-col items-center justify-center space-y-6 w-full p-4">
                    <div className="flex flex-col items-center justify-center space-y-2 mb-6">
                       <p className="text-sm text-textMuted text-center uppercase tracking-widest">
                          Lobby: {gameState.currentRoundTitle}
                       </p>
                       <button onClick={async () => {
                          const slots = eventConfig.slots.filter(s => s.slotNumber !== gameState.currentSlot);
                          const batch = writeBatch(db);
                          batch.update(doc(db, "system", "eventConfig"), { slots });
                          batch.update(doc(db, "system", "gameState"), { currentGameId: "", currentRoundTitle: "" });
                          await batch.commit();
                       }} className="text-[10px] text-primary uppercase border-b border-primary/30 hover:border-primary transition-colors pb-0.5">
                          [ Reset Slot & Pick Different Game ]
                       </button>
                    </div>
                    <div className="w-full max-w-2xl space-y-4">
                      {/* A1 Config */}
                      {activeGameId === "A1" && (
                        <div className="w-full space-y-3 p-4 border border-secondary/50 bg-secondary/5 shadow-glow-gold">
                          <label className="text-[10px] text-secondary uppercase tracking-widest block font-bold">A1 — Average Multiplier</label>
                          <div className="space-y-1">
                            <label className="text-[10px] text-textMuted uppercase tracking-widest">Multiplier (Target = Average * Multiplier)</label>
                            <input type="number" step="0.01" value={nextA1Multiplier} onChange={e => setNextA1Multiplier(parseFloat(e.target.value)||0)}
                              className="w-full bg-background border border-border px-3 py-2 text-textDefault focus:border-secondary outline-none text-sm" />
                            <p className="text-[9px] text-textMuted">Default is 0.666 (2/3)</p>
                          </div>
                        </div>
                      )}

                      {/* A2 Config */}
                      {activeGameId === "A2" && (
                        <div className="w-full space-y-3 p-4 border border-secondary/50 bg-secondary/5 shadow-glow-gold text-center">
                          <p className="text-[10px] text-secondary uppercase tracking-widest block font-bold mb-2">A2 — Range Minority</p>
                          <p className="text-xs text-textMuted uppercase">No game-specific variables required to configure.</p>
                        </div>
                      )}

                      {/* A3 Config */}
                      {activeGameId === "A3" && (
                        <div className="w-full space-y-4 p-4 border border-secondary/50 bg-secondary/5 shadow-glow-gold">
                          <label className="text-[10px] text-secondary uppercase tracking-widest block font-bold">A3 — Pair Match Variables</label>
                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1">
                              <label className="text-[10px] text-textMuted uppercase tracking-widest">Winner Bonus (+Pts)</label>
                              <input type="number" value={nextA3Bonus} onChange={e => setNextA3Bonus(parseInt(e.target.value)||0)}
                                className="w-full bg-background border border-border px-3 py-2 text-textDefault focus:border-secondary outline-none text-sm" />
                            </div>
                            <div className="space-y-1">
                              <label className="text-[10px] text-textMuted uppercase tracking-widest">Loser Penalty (-Pts)</label>
                              <input type="number" value={nextA3Penalty} onChange={e => setNextA3Penalty(parseInt(e.target.value)||0)}
                                className="w-full bg-background border border-border px-3 py-2 text-textDefault focus:border-secondary outline-none text-sm" />
                            </div>
                          </div>
                        </div>
                      )}

                      {/* A4 Custom Options Config */}
                      {activeGameId === "A4" && (
                        <div className="w-full space-y-3 p-4 border border-secondary/50 bg-secondary/5 shadow-glow-gold">
                          <label className="text-[10px] text-secondary uppercase tracking-widest block font-bold">Custom Option Labels</label>
                          {[0, 1, 2, 3].map(i => (
                             <input 
                                key={i}
                                type="text"
                                placeholder={`Option ${String.fromCharCode(65 + i)}`}
                                value={nextCustomOptions[i]}
                                onChange={(e) => {
                                  const nextOpts = [...nextCustomOptions];
                                  nextOpts[i] = e.target.value;
                                  setNextCustomOptions(nextOpts);
                                }}
                                className="w-full bg-background border border-border px-3 py-2 text-textDefault focus:border-secondary outline-none text-xs"
                             />
                          ))}
                        </div>
                      )}

                      {/* B7 Config */}
                      {activeGameId === "B7" && (
                        <div className="w-full space-y-4 p-4 border border-primary/50 bg-primary/5">
                          <label className="text-[10px] text-primary uppercase tracking-widest block font-bold">B7 — Route 2 Threshold</label>
                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1">
                              <label className="text-[10px] text-textMuted uppercase tracking-widest">Threshold (Route 2 slower when ≥)</label>
                              <input type="number" value={nextB7Threshold} onChange={e => setNextB7Threshold(parseInt(e.target.value)||1)}
                                className="w-full bg-background border border-border px-3 py-2 text-textDefault focus:border-primary outline-none text-sm" />
                              <p className="text-[9px] text-textMuted">≈ 40–60% of expected player count</p>
                            </div>
                            <div className="space-y-1">
                              <label className="text-[10px] text-textMuted uppercase tracking-widest">Route 1 Fixed Time (min, display)</label>
                              <input type="number" value={nextB7FixedTime} onChange={e => setNextB7FixedTime(parseInt(e.target.value)||25)}
                                className="w-full bg-background border border-border px-3 py-2 text-textDefault focus:border-primary outline-none text-sm" />
                            </div>
                          </div>
                        </div>
                      )}

                      {/* C10 Config */}
                      {activeGameId === "C10" && (
                        <div className="w-full space-y-4 p-4 border border-secondary/50 bg-secondary/5 shadow-glow-gold">
                          <div className="flex items-center justify-between">
                            <label className="text-[10px] text-secondary uppercase tracking-widest block font-bold">C10 — 20-Number Sequence</label>
                            <button onClick={generateC10Sequence} className="text-[10px] border border-secondary px-3 py-1 text-secondary hover:bg-secondary hover:text-background transition-colors uppercase tracking-widest">
                              Generate Curve
                            </button>
                          </div>
                          {nextC10Sequence.length === 20 ? (
                            <div>
                              <p className="text-[9px] text-textMuted mb-2 uppercase tracking-widest">Drag a number onto another to swap positions</p>
                              <div className="grid grid-cols-10 gap-1">
                                {nextC10Sequence.map((n, i) => (
                                  <div
                                    key={i}
                                    draggable
                                    onDragStart={() => setC10DragSrc(i)}
                                    onDragOver={e => e.preventDefault()}
                                    onDrop={() => { if (c10DragSrc !== null && c10DragSrc !== i) swapC10Cards(c10DragSrc, i); setC10DragSrc(null); }}
                                    className={`flex flex-col items-center justify-center aspect-square border cursor-grab active:cursor-grabbing transition-all
                                      ${i >= 7 && i <= 11 ? 'border-secondary/70 bg-secondary/10' : 'border-border bg-background'}
                                      ${n >= 90 ? 'text-secondary font-bold' : 'text-textMuted'}
                                      ${c10DragSrc === i ? 'opacity-40 scale-95' : 'hover:border-textDefault'}`}
                                  >
                                    <span className="text-[10px] font-mono leading-none">{n}</span>
                                    <span className="text-[7px] text-textMuted/50">{i+1}</span>
                                  </div>
                                ))}
                              </div>
                              <p className="text-[10px] text-secondary mt-3">Optimal Window (Gold): Positions 8–12. Peak should be inside.</p>
                            </div>
                          ) : (
                            <p className="text-xs text-textMuted">No sequence generated yet. Click Generate Curve.</p>
                          )}
                        </div>
                      )}

                      {/* B6 / B8 / C9 Complex Natively Routed Configs */}
                      {["B6", "B8", "C9"].includes(activeGameId) && (
                         <div className="w-full">
                            <AdminGameStats gameState={gameState} players={players} onUpdateGameState={updateGameState} activeGameId={activeGameId} />
                         </div>
                      )}
                    </div>

                    {!["B6", "B8", "C9"].includes(activeGameId) && (
                      <button 
                         onClick={() => {
                          let gsc: any = {};
                          if (activeGameId === "A1") {
                            gsc = { multiplier: nextA1Multiplier };
                          }
                          if (activeGameId === "A3") {
                            gsc = { penalty: nextA3Penalty, bonus: nextA3Bonus };
                          }
                          if (activeGameId === "B7") {
                            if (!nextB7Threshold || nextB7Threshold < 1) { alert("B7: Please set a valid threshold."); return; }
                            gsc = { threshold: nextB7Threshold, fixedRouteTime: nextB7FixedTime, revealStep: 0 };
                          }
                          if (activeGameId === "C10") {
                            if (nextC10Sequence.length !== 20) { alert("C10: Generate a 20-number sequence first."); return; }
                            gsc = { numberSequence: nextC10Sequence, currentNumberIndex: 0 };
                          }

                          updateGameState({ 
                            phase: "active",
                            playersAlive: totalAlive,
                            submissionsCount: 0,
                            customOptions: activeGameId === "A4" ? nextCustomOptions : [],
                            gameSpecificConfig: (activeGameId === "A1" || activeGameId === "A3" || activeGameId === "B7" || activeGameId === "C10") ? gsc : null,
                          });
                          startTimer(gameState.timerDuration || 60);
                       }}
                       className="bg-primary/20 border border-primary text-primary hover:bg-primary hover:text-white px-8 py-3 tracking-widest uppercase transition-colors shadow-glow-red mt-8"
                    >
                      START ROUND TIMER
                    </button>
                    )}
                  </div>
                )}
                
                {(gameState.phase === "active" || gameState.phase === "active_a" || gameState.phase === "active_b") && (
                  <div className="flex flex-col items-center space-y-6">
                    <div className="flex w-full justify-between items-end border-b border-border pb-4">
                       <div>
                         <p className="text-secondary text-xs uppercase tracking-widest mb-1">Submissions Received</p>
                         <p className="text-3xl">{submissionsCount} <span className="text-sm text-textMuted">/ {totalAlive} alive</span></p>
                       </div>
                       <div className="flex gap-2">
                         {gameState.phase === "active" && (
                           <button onClick={() => setPhase("locked")} className="bg-surface border border-border hover:bg-border px-6 py-2 tracking-widest uppercase transition-colors text-xs">
                              Force Lock Submissions
                           </button>
                         )}
                         {gameState.phase === "active_a" && (
                           <button onClick={() => setPhase("locked_a")} className="bg-surface border border-border hover:bg-border px-6 py-2 tracking-widest uppercase transition-colors text-xs">
                              Lock A & Open B
                           </button>
                         )}
                         {gameState.phase === "active_b" && (
                           <button onClick={() => setPhase("locked_b")} className="bg-surface border border-border hover:bg-border px-6 py-2 tracking-widest uppercase transition-colors text-xs">
                              Force Lock B
                           </button>
                         )}
                       </div>
                    </div>
                     <div className="w-full bg-background h-6 border border-border relative overflow-hidden">
                       <div 
                         className="absolute left-0 top-0 bottom-0 bg-secondary transition-all duration-500" 
                         style={{ width: `${totalAlive > 0 ? (submissionsCount / totalAlive) * 100 : 0}%` }}
                       />
                     </div>
                     
                     <div className="w-full flex justify-end gap-2">
                         <button 
                             onClick={() => updateGameState({ timerDuration: (gameState.timerDuration || 60) + 30 })}
                             className="text-[10px] uppercase border border-border px-3 py-1 text-textMuted hover:text-secondary hover:border-secondary transition-colors"
                         >
                             +30s Timer
                         </button>
                     </div>

                     <div className="w-full pt-4">
                        <AdminGameStats gameState={gameState} players={players} onUpdateGameState={updateGameState} activeGameId={activeGameId} />
                     </div>
                  </div>
                )}
                
                {(gameState.phase === "locked" || gameState.phase === "locked_a" || gameState.phase === "locked_b") && (
                  <div className="flex flex-col items-center justify-center space-y-6 h-full p-4">
                    <p className="text-sm text-textMuted text-center">Input is locked. {submissionsCount} submissions captured.</p>
                    
                    {gameState.phase === "locked_a" && (
                      <button 
                         onClick={handleStartPhaseB} disabled={calculating}
                         className="bg-secondary/20 text-secondary border border-secondary px-8 py-3 tracking-widest uppercase transition-colors hover:bg-secondary hover:text-background"
                      >
                        {calculating ? "Processing..." : "Start Phase B (Guess Opponent)"}
                      </button>
                    )}

                    {(gameState.phase === "locked" || gameState.phase === "locked_b") && (
                      <button 
                         onClick={handleCalculateResult} disabled={calculating}
                         className="bg-surface border border-border border-l-4 border-l-secondary px-8 py-3 tracking-widest uppercase transition-colors hover:bg-white/5"
                      >
                        {calculating ? "Processing logic..." : "RUN CALCULATION LOGIC"}
                      </button>
                    )}
                  </div>
                )}

                {gameState.phase === "calculating" && (
                  <div className="flex flex-col items-center justify-center h-full text-secondary animate-pulse text-sm tracking-widest uppercase">
                    Crunching Data Server-Side...
                  </div>
                )}

                {gameState.phase === "reveal" && (
                   <div className="space-y-8">
                      <div className="bg-background border border-border p-4 text-sm grid grid-cols-3 gap-4">
                        <div className="col-span-3 text-center border-b border-border pb-2 text-xs uppercase text-secondary">Automation Snapshot</div>
                        <div className="text-center">
                          <p className="text-textMuted text-[10px] uppercase">Suggestion</p>
                          <p className="text-primary text-xl font-bold">{gameState.results?.eliminatedPlayerIds?.length || 0} dead</p>
                        </div>
                        <div className="text-center">
                          <p className="text-textMuted text-[10px] uppercase">Avg/Metric</p>
                          <p className="text-xl">{gameState.results?.average?.toFixed(2) ?? gameState.results?.majorityRange ?? "N/A"}</p>
                        </div>
                        <div className="text-center">
                          <p className="text-textMuted text-[10px] uppercase">Target</p>
                          <p className="text-xl text-secondary">{gameState.results?.target?.toFixed(2) ?? "N/A"}</p>
                        </div>
                      </div>

                      {activeGameId === "A3" && gameState.results?.pairs && (
                         <div className="space-y-4">
                            <h3 className="text-xs uppercase tracking-widest text-secondary border-b border-secondary pb-2">A3 Pair Results ({gameState.results.pairs.length} pairs)</h3>
                            <div className="overflow-x-auto max-h-[300px] border border-border">
                              <table className="w-full text-[10px] uppercase tracking-tighter">
                                 <thead className="bg-surface text-textMuted">
                                    <tr>
                                       <th className="p-2 text-left">P1 (Bid)</th>
                                       <th className="p-2 text-right">P2 (Bid)</th>
                                       <th className="p-2 text-center">Outcome</th>
                                    </tr>
                                 </thead>
                                 <tbody className="divide-y divide-border">
                                    {gameState.results.pairs.map((pair: any, i: number) => {
                                       const p1Name = players.find(p => p.id === pair.player1Uid)?.name || pair.player1Id;
                                       const p2Name = pair.player2Uid ? (players.find(p => p.id === pair.player2Uid)?.name || pair.player2Id) : "UNMATCHED";
                                       return (
                                         <tr key={i} className="hover:bg-surface/50">
                                            <td className="p-2">
                                              <span className="font-bold text-textDefault">{p1Name}</span> <br/>
                                              <span className="text-secondary">Bid: {pair.val1}</span> | Score: {pair.score1} {pair.p1Bonus ? `(+${pair.p1Bonus})` : ''}
                                            </td>
                                            <td className="p-2 text-right">
                                              <span className="font-bold text-textDefault">{p2Name}</span> <br/>
                                              <span className="text-primary">Bid: {pair.val2 ?? '—'}</span> | Score: {pair.score2 ?? '—'} {pair.p2Bonus ? `(+${pair.p2Bonus})` : ''}
                                            </td>
                                            <td className="p-2 text-center text-textMuted">
                                              {pair.val1 === pair.val2 ? "Tie" : (pair.val2 === null ? "Safe" : (pair.val1 < pair.val2 ? "P1 Won Bonus" : "P2 Won Bonus"))}
                                            </td>
                                         </tr>
                                       );
                                    })}
                                 </tbody>
                              </table>
                            </div>
                         </div>
                      )}

                      <div className="space-y-4">
                        <h3 className="text-xs uppercase tracking-widest text-textMuted border-b border-border pb-2">Manual Override Table</h3>
                        <div className="overflow-x-auto max-h-[400px] border border-border">
                          <table className="w-full text-[10px] uppercase tracking-tighter">
                            <thead className="bg-surface text-textMuted">
                              <tr>
                                <th className="p-2 text-left">Player</th>
                                <th className="p-2">Input</th>
                                <th className="p-2">Points</th>
                                <th className="p-2 text-right">Action</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                              {players.filter(p => p.status === "alive").map(p => {
                                const update = pendingUpdates[p.id];
                                if (!update) return null;
                                return (
                                  <tr key={p.id} className={update.status === "eliminated" ? "bg-primary/10" : ""}>
                                    <td className="p-2 font-bold">{p.name} <span className="opacity-50 font-normal">({p.playerId})</span></td>
                                    <td className="p-2 text-center text-secondary font-mono">{typeof p.currentSubmission === "object" && p.currentSubmission !== null ? (p.currentSubmission.value ?? JSON.stringify(p.currentSubmission)) : (p.currentSubmission ?? "—")}</td>
                                    <td className="p-2 text-center">
                                      <input 
                                        type="number" 
                                        className="w-12 bg-background border border-border text-center p-1"
                                        value={update.pointsDelta}
                                        onChange={(e) => updatePoints(p.id, parseInt(e.target.value) || 0)}
                                      />
                                    </td>
                                    <td className="p-2 text-right">
                                      <button 
                                        onClick={() => toggleElimination(p.id)}
                                        className={`px-3 py-1 border text-[8px] tracking-widest ${update.status === "eliminated" ? "bg-primary text-white border-primary" : "border-textMuted text-textMuted"}`}
                                      >
                                        {update.status === "eliminated" ? "ELIMINATED" : "KEEP ALIVE"}
                                      </button>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>

                      <div className="flex gap-4 justify-center pt-4">
                        <button onClick={handleFinalizeResults} disabled={calculating} className={`border px-8 py-3 tracking-widest uppercase transition-colors shadow-glow-red ${gameState.roundType === 'final' ? 'bg-secondary text-background border-secondary font-bold' : 'bg-primary/20 border-primary text-primary hover:bg-primary hover:text-white'}`}>
                          {calculating ? "Processing Batch..." : (gameState.roundType === 'final' ? "🏆 FINALIZE EVENT & DECLARE WINNER" : "FINALIZE & COMMIT ROUND")}
                        </button>
                      </div>
                   </div>
                )}


                
                {gameState.phase === "standby" && (
                   <div className="flex flex-col items-center space-y-8 h-full p-4">
                     <div className="text-center space-y-2">
                        <h3 className="text-secondary tracking-widest uppercase shadow-glow-gold">Prepare Round {gameState.currentSlot}</h3>
                        <p className="text-[10px] text-textMuted font-mono">Create the next trial on the spot</p>
                     </div>

                     <div className="w-full max-w-md grid grid-cols-2 gap-4 text-xs">
                        <div className="col-span-2 space-y-2">
                          <label className="text-[10px] text-textMuted uppercase tracking-widest">Select Game Type</label>
                          <select 
                            value={nextGameId} 
                            onChange={(e) => setNextGameId(e.target.value)}
                            className="w-full bg-surface border border-border p-3 text-textDefault focus:border-secondary outline-none transition-colors"
                          >
                            <option value="A1">A1: Majority Trap (Numerical) {getGamePlayCount("A1") > 0 ? `[Played ${getGamePlayCount("A1")}]` : ""}</option>
                            <option value="A2">A2: Minority Trap (Range Hunter) {getGamePlayCount("A2") > 0 ? `[Played ${getGamePlayCount("A2")}]` : ""}</option>
                            <option value="A3">A3: Traveler's Dilemma {getGamePlayCount("A3") > 0 ? `[Played ${getGamePlayCount("A3")}]` : ""}</option>
                            <option value="A4">A4: Borda Sabotage (Strategic Vote) {getGamePlayCount("A4") > 0 ? `[Played ${getGamePlayCount("A4")}]` : ""}</option>
                            <option value="B5">B5: Nashify / Black Hole (Physical puzzle) {getGamePlayCount("B5") > 0 ? `[Played ${getGamePlayCount("B5")}]` : ""}</option>
                            <option value="B6">B6: Bidding Survival {getGamePlayCount("B6") > 0 ? `[Played ${getGamePlayCount("B6")}]` : ""}</option>
                            <option value="B7">B7: Braess Paradox {getGamePlayCount("B7") > 0 ? `[Played ${getGamePlayCount("B7")}]` : ""}</option>
                            <option value="B8">B8: Information Cascade {getGamePlayCount("B8") > 0 ? `[Played ${getGamePlayCount("B8")}]` : ""}</option>
                            <option value="C9">C9: Sequence Match {getGamePlayCount("C9") > 0 ? `[Played ${getGamePlayCount("C9")}]` : ""}</option>
                            <option value="C10">C10: Peak Finder {getGamePlayCount("C10") > 0 ? `[Played ${getGamePlayCount("C10")}]` : ""}</option>
                            <option value="OFFLINE">Offline: Manual/Physical Trial {getGamePlayCount("OFFLINE") > 0 ? `[Played ${getGamePlayCount("OFFLINE")}]` : ""}</option>
                          </select>
                        </div>

                        <div className="col-span-2 space-y-2">
                          <label className="text-[10px] text-textMuted uppercase tracking-widest">Custom Round Title</label>
                          <input 
                            type="text"
                            placeholder="e.g. The Hunger Games"
                            value={nextGameTitle}
                            onChange={(e) => setNextGameTitle(e.target.value)}
                            className="w-full bg-surface border border-border p-3 text-textDefault focus:border-secondary outline-none transition-colors"
                          />
                        </div>

                        <div className="space-y-2">
                          <label className="text-[10px] text-textMuted uppercase tracking-widest">Round Type</label>
                          <select 
                            value={nextRoundType} 
                            onChange={(e) => setNextRoundType(e.target.value as any)}
                            className="w-full bg-surface border border-border p-3 text-textDefault focus:border-secondary outline-none transition-colors"
                          >
                            <option value="standard">Standard Round</option>
                            <option value="semi-final">Semi-Final</option>
                            <option value="final">Final Round</option>
                          </select>
                        </div>

                        <div className="space-y-2">
                          <label className="text-[10px] text-textMuted uppercase tracking-widest">Timer (sec)</label>
                          <input 
                            type="number"
                            value={nextGameTimer}
                            onChange={(e) => setNextGameTimer(parseInt(e.target.value) || 0)}
                            className="w-full bg-surface border border-border p-3 text-textDefault focus:border-secondary outline-none transition-colors"
                          />
                        </div>

                        {/* A1 Config */}
                        {nextGameId === "A1" && (
                          <div className="col-span-2 space-y-3 p-4 border border-secondary/50 bg-secondary/5 shadow-glow-gold">
                            <label className="text-[10px] text-secondary uppercase tracking-widest block font-bold">A1 — Average Multiplier</label>
                            <div className="space-y-1">
                              <label className="text-[10px] text-textMuted uppercase tracking-widest">Multiplier (Target = Average * Multiplier)</label>
                              <input type="number" step="0.01" value={nextA1Multiplier} onChange={e => setNextA1Multiplier(parseFloat(e.target.value)||0)}
                                className="w-full bg-background border border-border px-3 py-2 text-textDefault focus:border-secondary outline-none text-sm" />
                              <p className="text-[9px] text-textMuted">Default is 0.666 (2/3)</p>
                            </div>
                          </div>
                        )}

                        {/* A2 Config */}
                        {nextGameId === "A2" && (
                          <div className="col-span-2 space-y-3 p-4 border border-secondary/50 bg-secondary/5 shadow-glow-gold text-center">
                            <p className="text-[10px] text-secondary uppercase tracking-widest block font-bold mb-2">A2 — Range Minority</p>
                            <p className="text-xs text-textMuted uppercase">No game-specific variables required to configure.</p>
                          </div>
                        )}

                        {/* A3 Config */}
                        {nextGameId === "A3" && (
                          <div className="col-span-2 space-y-4 p-4 border border-secondary/50 bg-secondary/5 shadow-glow-gold">
                            <label className="text-[10px] text-secondary uppercase tracking-widest block font-bold">A3 — Pair Match Variables</label>
                            <div className="grid grid-cols-2 gap-4">
                              <div className="space-y-1">
                                <label className="text-[10px] text-textMuted uppercase tracking-widest">Winner Bonus (+Pts)</label>
                                <input type="number" value={nextA3Bonus} onChange={e => setNextA3Bonus(parseInt(e.target.value)||0)}
                                  className="w-full bg-background border border-border px-3 py-2 text-textDefault focus:border-secondary outline-none text-sm" />
                              </div>
                              <div className="space-y-1">
                                <label className="text-[10px] text-textMuted uppercase tracking-widest">Loser Penalty (-Pts)</label>
                                <input type="number" value={nextA3Penalty} onChange={e => setNextA3Penalty(parseInt(e.target.value)||0)}
                                  className="w-full bg-background border border-border px-3 py-2 text-textDefault focus:border-secondary outline-none text-sm" />
                              </div>
                            </div>
                          </div>
                        )}

                        {nextGameId === "A4" && (
                          <div className="col-span-2 space-y-3 p-4 border border-secondary/50 bg-secondary/5 shadow-glow-gold">
                            <label className="text-[10px] text-secondary uppercase tracking-widest block font-bold">Custom Option Labels</label>
                            {[0, 1, 2, 3].map(i => (
                               <input 
                                  key={i}
                                  type="text"
                                  placeholder={`Option ${String.fromCharCode(65 + i)}`}
                                  value={nextCustomOptions[i]}
                                  onChange={(e) => {
                                    const nextOpts = [...nextCustomOptions];
                                    nextOpts[i] = e.target.value;
                                    setNextCustomOptions(nextOpts);
                                  }}
                                  className="w-full bg-background border border-border px-3 py-2 text-textDefault focus:border-secondary outline-none text-xs"
                               />
                            ))}
                          </div>
                        )}

                        {/* B7 Config */}
                        {nextGameId === "B7" && (
                          <div className="col-span-2 space-y-4 p-4 border border-primary/50 bg-primary/5">
                            <label className="text-[10px] text-primary uppercase tracking-widest block font-bold">B7 — Route 2 Threshold</label>
                            <div className="grid grid-cols-2 gap-4">
                              <div className="space-y-1">
                                <label className="text-[10px] text-textMuted uppercase tracking-widest">Threshold (Route 2 slower when ≥)</label>
                                <input type="number" value={nextB7Threshold} onChange={e => setNextB7Threshold(parseInt(e.target.value)||1)}
                                  className="w-full bg-background border border-border px-3 py-2 text-textDefault focus:border-primary outline-none text-sm" />
                                <p className="text-[9px] text-textMuted">≈ 40–60% of expected player count</p>
                              </div>
                              <div className="space-y-1">
                                <label className="text-[10px] text-textMuted uppercase tracking-widest">Route 1 Fixed Time (min, display)</label>
                                <input type="number" value={nextB7FixedTime} onChange={e => setNextB7FixedTime(parseInt(e.target.value)||25)}
                                  className="w-full bg-background border border-border px-3 py-2 text-textDefault focus:border-primary outline-none text-sm" />
                              </div>
                            </div>
                          </div>
                        )}

                        {/* C10 Config */}
                        {nextGameId === "C10" && (
                          <div className="col-span-2 space-y-4 p-4 border border-secondary/50 bg-secondary/5 shadow-glow-gold">
                            <div className="flex items-center justify-between">
                              <label className="text-[10px] text-secondary uppercase tracking-widest block font-bold">C10 — 20-Number Sequence</label>
                              <button onClick={generateC10Sequence} className="text-[10px] border border-secondary px-3 py-1 text-secondary hover:bg-secondary hover:text-background transition-colors uppercase tracking-widest">
                                Generate Curve
                              </button>
                            </div>
                            {nextC10Sequence.length === 20 ? (
                              <div>
                                <p className="text-[9px] text-textMuted mb-2 uppercase tracking-widest">Drag a number onto another to swap positions</p>
                                <div className="grid grid-cols-10 gap-1">
                                  {nextC10Sequence.map((n, i) => (
                                    <div
                                      key={i}
                                      draggable
                                      onDragStart={() => setC10DragSrc(i)}
                                      onDragOver={e => e.preventDefault()}
                                      onDrop={() => { if (c10DragSrc !== null && c10DragSrc !== i) swapC10Cards(c10DragSrc, i); setC10DragSrc(null); }}
                                      className={`flex flex-col items-center justify-center aspect-square border cursor-grab active:cursor-grabbing transition-all
                                        ${i >= 7 && i <= 11 ? 'border-secondary/70 bg-secondary/10' : 'border-border bg-background'}
                                        ${n >= 90 ? 'text-secondary font-bold' : 'text-textMuted'}
                                        ${c10DragSrc === i ? 'opacity-40 scale-95' : 'hover:border-textDefault'}`}
                                    >
                                      <span className="text-[10px] font-mono leading-none">{n}</span>
                                      <span className="text-[7px] text-textMuted/50">{i+1}</span>
                                    </div>
                                  ))}
                                </div>
                                <div className="flex justify-between text-[9px] text-textMuted mt-2">
                                  <span>Peak: {Math.max(...nextC10Sequence)} at pos {nextC10Sequence.indexOf(Math.max(...nextC10Sequence))+1}</span>
                                  <span className="text-secondary">█ = optimal window (pos 8–12)</span>
                                </div>
                                {nextC10Sequence.map((n, i) => (
                                  <input key={i} type="hidden" />
                                ))}
                              </div>
                            ) : (
                              <p className="text-xs text-textMuted">Click "Generate Curve" to build a sequence, then drag cells to rearrange.</p>
                            )}
                          </div>
                        )}

                        <div className="flex items-end col-span-2 mt-4">
                           <button 
                             onClick={startDynamicRound}
                             disabled={calculating}
                             className="w-full bg-secondary/20 border border-secondary text-secondary hover:bg-secondary hover:text-background p-3 tracking-widest uppercase transition-colors shadow-glow-gold font-bold"
                           >
                             {calculating ? "Initializing..." : "START THIS ROUND"}
                           </button>
                        </div>
                     </div>
                   </div>
                )}
              </section>

              <section className="space-y-4 pt-4">
                 <h3 className="text-sm text-textMuted tracking-widest uppercase">Active Player Roster Feed</h3>
                 
                 {/* WILD CARD PROCESSING SECTION */}
                 {players.filter(p => p.status === "waiting" && p.isWildCard).length > 0 && (
                   <div className="mb-8 border border-secondary shadow-glow-gold p-4 bg-secondary/10">
                     <h4 className="text-secondary text-xs tracking-widest uppercase mb-4 animate-pulse">⚡ Pending Wild Card Requests</h4>
                     <table className="w-full text-left text-xs bg-background border border-secondary/50">
                       <thead className="bg-surface text-textMuted uppercase tracking-widest border-b border-secondary/50">
                         <tr>
                            <th className="p-2">Name</th>
                            <th className="p-2">College</th>
                            <th className="p-2">Phone</th>
                            <th className="p-2 text-right">Actions</th>
                         </tr>
                       </thead>
                       <tbody className="divide-y divide-secondary/20">
                         {players.filter(p => p.status === "waiting" && p.isWildCard).map(p => (
                            <tr key={p.id}>
                               <td className="p-2 font-bold text-secondary">{p.name}</td>
                               <td className="p-2">{p.college}</td>
                               <td className="p-2">{p.phone || "—"}</td>
                               <td className="p-2 text-right space-x-2">
                                  <button onClick={() => approveWildCard(p.id)} className="px-3 py-1 bg-secondary text-background font-bold hover:bg-secondary/80">APPROVE</button>
                                  <button onClick={() => rejectWildCard(p.id)} className="px-3 py-1 border border-primary text-primary hover:bg-primary hover:text-white">REJECT</button>
                               </td>
                            </tr>
                         ))}
                       </tbody>
                     </table>
                   </div>
                 )}

                 <div className="overflow-x-auto border border-border">
                   <table className="w-full text-left text-xs bg-surface/50">
                     <thead className="bg-surface border-b border-border text-textMuted uppercase tracking-widest">
                       <tr>
                         <th className="p-3">ID</th>
                         <th className="p-3">Name</th>
                         <th className="p-3">Status</th>
                         <th className="p-3 bg-secondary/10 text-secondary" title="Wild Card Origin">★ WC</th>
                         <th className="p-3">Score/Pts</th>
                         <th className="p-3">Current Input</th>
                       </tr>
                     </thead>
                     <tbody className="divide-y divide-border/50">
                       {players.sort((a,b) => {
                         // Sort so waiting wild cards are top, then alive, then eliminated
                         if (a.status === 'waiting' && b.status !== 'waiting') return -1;
                         if (b.status === 'waiting' && a.status !== 'waiting') return 1;
                         if (a.status === 'eliminated' && b.status !== 'eliminated') return 1;
                         if (b.status === 'eliminated' && a.status !== 'eliminated') return -1;
                         return 0;
                       }).map(p => (
                         <tr key={p.id} className="hover:bg-surface transition-colors">
                           <td className="p-3 text-secondary font-bold">{p.playerId}</td>
                           <td className="p-3">{p.name}</td>
                           <td className="p-3">
                             <span className={`${p.status === 'eliminated' ? 'text-primary' : p.status === 'waiting' ? 'text-secondary animate-pulse' : 'text-success'} uppercase tracking-widest`}>
                               {p.status}
                             </span>
                           </td>
                           <td className="p-3 text-secondary">{p.isWildCard ? "★" : ""}</td>
                           <td className="p-3">{p.points || 0}</td>
                           <td className="p-3">
                             {typeof p.currentSubmission === 'object' ? JSON.stringify(p.currentSubmission) : p.currentSubmission ?? "—"}
                           </td>
                         </tr>
                       ))}
                     </tbody>
                   </table>
                 </div>
              </section>

          </div>
        </div>

      </div>
    </main>
  );
}
