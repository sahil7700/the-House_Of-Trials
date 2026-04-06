import { useState, useEffect, useRef, useCallback } from "react";
import { GameState } from "@/lib/services/game-service";
import { PlayerData } from "@/lib/services/player-service";
import { db } from "@/lib/firebase";
import { collection, doc, onSnapshot, query, where, writeBatch, getDocs } from "firebase/firestore";
import { motion, AnimatePresence } from "framer-motion";

interface Props {
  gameState: GameState;
  players: PlayerData[];
  onUpdateGameState?: (update: Partial<GameState>) => void;
}

export default function GameLemonsAdmin({ gameState, players, onUpdateGameState }: Props) {
  const gsc = (gameState as any).gameSpecificConfig || {};
  const slotNumber = gameState.currentSlot;
  const isLobby = gameState.phase === "lobby";
  const isActive = gameState.phase === "active";
  const isReveal = gameState.phase === "reveal" || gameState.phase === "confirm";

  const [goldPct, setGoldPct] = useState(gsc.goldPct ?? 40);
  const [sellerPct, setSellerPct] = useState(gsc.sellerPct ?? 50);
  const [assignments, setAssignments] = useState<any[]>([]);
  const [trades, setTrades] = useState<any[]>([]);
  const [isProcessing, setProcessing] = useState(false);
  const [processError, setProcessError] = useState<string | null>(null);

  const autoAssignedFiredRef = useRef(false);
  const prevPhaseRef = useRef(gameState.phase);

  useEffect(() => {
    prevPhaseRef.current = gameState.phase;
  }, [gameState.phase]);

  useEffect(() => {
    const assignmentsQ = query(collection(db, "lemonAssignments"), where("slotNumber", "==", slotNumber));
    const tradesQ = query(collection(db, "marketTrades"), where("slotNumber", "==", slotNumber));

    const unsubA = onSnapshot(assignmentsQ, snap => {
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setAssignments(docs);
    });

    const unsubT = onSnapshot(tradesQ, snap => {
      setTrades(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    return () => {
      unsubA();
      unsubT();
    };
  }, [slotNumber]);

  useEffect(() => {
    if (isLobby) {
      autoAssignedFiredRef.current = false;
    }
  }, [isLobby, slotNumber]);

  useEffect(() => {
    if (
      gameState.phase === "active" &&
      !autoAssignedFiredRef.current &&
      assignments.length === 0 &&
      players.filter(p => p.status === "alive").length >= 2
    ) {
      autoAssignedFiredRef.current = true;
      handleAssignRoles(true);
    }
  }, [gameState.phase, assignments.length, players]);

  const handleAssignRoles = async (silent = false) => {
    setProcessing(true);
    setProcessError(null);
    try {
      const alivePlayersNow = players.filter(p => p.status === "alive");
      if (alivePlayersNow.length < 2) {
        throw new Error("Need at least 2 alive players to assign roles.");
      }

      const shuffled = [...alivePlayersNow].sort(() => Math.random() - 0.5);
      const numSellers = Math.max(1, Math.ceil((sellerPct / 100) * shuffled.length));
      const sellers = shuffled.slice(0, numSellers);
      const buyers = shuffled.slice(numSellers);

      const numGold = Math.ceil((goldPct / 100) * sellers.length);
      const sellerShuffled = [...sellers].sort(() => Math.random() - 0.5);

      const batch = writeBatch(db);
      sellerShuffled.forEach((p, i) => {
        batch.set(doc(db, "lemonAssignments", `${slotNumber}_${p.id}`), {
          playerId: p.id,
          playerName: p.name,
          role: "seller",
          asset: i < numGold,
          slotNumber,
          outcome: null,
        }, { merge: true });
      });
      buyers.forEach(p => {
        batch.set(doc(db, "lemonAssignments", `${slotNumber}_${p.id}`), {
          playerId: p.id,
          playerName: p.name,
          role: "buyer",
          asset: null,
          slotNumber,
          outcome: null,
        }, { merge: true });
      });
      await batch.commit();

      if (onUpdateGameState) {
        onUpdateGameState({
          gameSpecificConfig: { ...gsc, goldPct, sellerPct, assignmentsCreated: true },
        } as any);
      }
    } catch (e: any) {
      setProcessError(e.message);
      autoAssignedFiredRef.current = false;
    } finally {
      setProcessing(false);
    }
  };

  const handleFinalizeMarket = async () => {
    setProcessing(true);
    try {
      const batch = writeBatch(db);
      for (const trade of trades) {
        if (trade.status !== "accepted") continue;
        const sellerAssign = assignments.find(a => a.playerId === trade.sellerId);
        const outcome = sellerAssign?.asset ? "GOLD" : "LEMON";
        batch.update(doc(db, "lemonAssignments", `${slotNumber}_${trade.buyerId}`), { outcome });
      }
      await batch.commit();

      if (onUpdateGameState) {
        onUpdateGameState({ phase: "reveal" } as any);
      }
    } catch (e: any) {
      setProcessError(e.message);
    } finally {
      setProcessing(false);
    }
  };

  const sellerAssignments = assignments.filter(a => a.role === "seller");
  const buyerAssignments = assignments.filter(a => a.role === "buyer");
  const acceptedCount = trades.filter(t => t.status === "accepted").length;
  const pendingCount = trades.filter(t => t.status === "pending").length;
  const aliveCount = players.filter(p => p.status === "alive").length;
  const hasAssignments = assignments.length > 0;

  return (
    <div className="w-full space-y-6 font-mono">
      {isLobby && !hasAssignments && (
        <div className="p-4 border border-secondary/40 bg-secondary/5 space-y-6">
          <h3 className="text-sm uppercase tracking-widest text-secondary font-bold">Market of Lemons — Setup</h3>
          <p className="text-xs text-textMuted">Roles are auto-assigned when the round starts. Configure below first.</p>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-[10px] text-textMuted uppercase tracking-widest block">
                Sellers ({sellerPct}%)
              </label>
              <input type="range" min="30" max="70" value={sellerPct} onChange={e => setSellerPct(+e.target.value)}
                className="w-full accent-secondary" />
              <p className="text-xs text-secondary">≈ {Math.max(1, Math.ceil((sellerPct / 100) * aliveCount))} Sellers</p>
            </div>
            <div className="space-y-2">
              <label className="text-[10px] text-textMuted uppercase tracking-widest block">
                Gold Ratio ({goldPct}%)
              </label>
              <input type="range" min="20" max="80" value={goldPct} onChange={e => setGoldPct(+e.target.value)}
                className="w-full accent-secondary" />
              <p className="text-xs text-amber-400">≈ {Math.ceil((goldPct / 100) * Math.max(1, Math.ceil((sellerPct / 100) * aliveCount)))} Gold sellers</p>
            </div>
          </div>

          <button
            onClick={() => handleAssignRoles(false)}
            disabled={isProcessing || aliveCount < 2}
            className="w-full py-4 bg-secondary text-background font-bold uppercase tracking-widest hover:bg-white transition-colors disabled:opacity-40"
          >
            {isProcessing ? "Assigning..." : `MANUALLY ASSIGN ROLES (${aliveCount} players)`}
          </button>
          {processError && <p className="text-primary text-xs">{processError}</p>}
        </div>
      )}

      {(isActive || hasAssignments) && (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-4 border border-border bg-surface p-4 text-center text-xs">
            <div>
              <p className="text-textMuted uppercase tracking-widest text-[10px] mb-1">Sellers</p>
              <p className="text-xl">{sellerAssignments.length}</p>
            </div>
            <div>
              <p className="text-textMuted uppercase tracking-widest text-[10px] mb-1">Buyers</p>
              <p className="text-xl">{buyerAssignments.length}</p>
            </div>
            <div>
              <p className="text-textMuted uppercase tracking-widest text-[10px] mb-1">Trades</p>
              <p className="text-xl text-secondary">{acceptedCount}</p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 text-center text-xs">
            <div className="border border-green-700/30 bg-green-900/10 p-2">
              <p className="text-green-400 font-bold">{sellerAssignments.filter(s => s.asset === true).length}</p>
              <p className="text-[10px] text-textMuted uppercase">Gold</p>
            </div>
            <div className="border border-primary/30 bg-primary/5 p-2">
              <p className="text-primary font-bold">{sellerAssignments.filter(s => s.asset === false).length}</p>
              <p className="text-[10px] text-textMuted uppercase">Lemons</p>
            </div>
            <div className="border border-amber-500/30 bg-amber-900/10 p-2">
              <p className="text-amber-400 font-bold">{pendingCount}</p>
              <p className="text-[10px] text-textMuted uppercase">Pending</p>
            </div>
          </div>

          {pendingCount > 0 && (
            <div className="border border-amber-500/40 bg-amber-900/10 p-3 text-center">
              <p className="text-amber-400 text-xs uppercase tracking-widest">{pendingCount} pending trades waiting for buyer response</p>
            </div>
          )}

          {isActive && (
            <button
              onClick={handleFinalizeMarket}
              disabled={isProcessing}
              className="w-full py-3 border border-primary text-primary uppercase tracking-widest text-xs hover:bg-primary hover:text-white transition-colors shadow-glow-red disabled:opacity-40"
            >
              {isProcessing ? "Finalizing..." : "CLOSE MARKET & REVEAL OUTCOMES"}
            </button>
          )}

          <div className="border border-border bg-surface p-4 max-h-64 overflow-y-auto space-y-2">
            <p className="text-[10px] text-textMuted uppercase tracking-widest mb-3">Live Trade Log</p>
            {trades.length === 0 && <p className="text-textMuted text-xs text-center py-4">No trades yet.</p>}
            {trades.map(t => {
              const seller = sellerAssignments.find(a => a.playerId === t.sellerId);
              const buyer = buyerAssignments.find(a => a.playerId === t.buyerId);
              return (
                <div key={t.id} className={`flex justify-between items-center p-2 border text-xs ${t.status === "accepted" ? "border-green-700/50 bg-green-900/10" : t.status === "declined" ? "border-primary/30 bg-primary/5 opacity-60" : "border-secondary/30"}`}>
                  <span className="text-secondary">{seller?.playerName || t.sellerId?.substring(0, 6)}</span>
                  <span className="text-textMuted">→ {buyer?.playerName || t.buyerId?.substring(0, 6)}</span>
                  <span className={t.status === "accepted" ? "text-green-400" : t.status === "declined" ? "text-primary" : "text-amber-400"}>{t.status?.toUpperCase()}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {isReveal && (
        <div className="border border-secondary bg-secondary/10 p-4 text-center">
          <p className="text-secondary font-bold uppercase tracking-widest text-sm">Market Closed — Results Revealed</p>
          <p className="text-secondary text-xs mt-1">{acceptedCount} completed trades</p>
        </div>
      )}
    </div>
  );
}
