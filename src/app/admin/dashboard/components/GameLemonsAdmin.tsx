import { useState, useEffect } from "react";
import { GameState } from "@/lib/services/game-service";
import { PlayerData } from "@/lib/services/player-service";
import { db } from "@/lib/firebase";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { motion } from "framer-motion";

interface Props {
  gameState: GameState;
  players: PlayerData[];
  onUpdateGameState?: (update: Partial<GameState>) => void;
}

export default function GameLemonsAdmin({ gameState, players, onUpdateGameState }: Props) {
  const alivePlayers = players.filter(p => p.status === "alive");
  const marketConfig = (gameState as any).marketConfig || {};
  const marketRoles: any = (gameState as any).marketRoles || {};
  const revealStep: number = (gameState as any).revealStep || 0;
  const phase: string = gameState.phase || "lobby";
  const cardFlashStartedAt = (gameState as any).cardFlashStartedAt;
  const tradingStartedAt = (gameState as any).tradingStartedAt;
  const results: any[] = (gameState as any).results || [];
  const pendingEliminations: string[] = (gameState as any).pendingEliminations || [];

  // Config state
  const [numSellers, setNumSellers] = useState(Math.max(1, Math.ceil(alivePlayers.length * 0.2)));
  const [numGold, setNumGold] = useState(Math.ceil(Math.max(1, Math.ceil(alivePlayers.length * 0.2)) * 0.6));
  const [cardFlashSeconds, setCardFlashSeconds] = useState(2);
  const [tradingSeconds, setTradingSeconds] = useState(300);
  const [saving, setSaving] = useState(false);
  const [assignedData, setAssignedData] = useState<any>(null);
  const [trades, setTrades] = useState<any[]>([]);
  const [timerLeft, setTimerLeft] = useState<number | null>(null);
  const [flashLeft, setFlashLeft] = useState<number | null>(null);

  // Live trades listener
  useEffect(() => {
    if (phase !== "trading_open" && phase !== "trading_locked" && phase !== "reveal") return;
    const q = query(collection(db, "marketTrades"), where("slotNumber", "==", gameState.currentSlot));
    const unsub = onSnapshot(q, snap => setTrades(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
    return () => unsub();
  }, [phase, gameState.currentSlot]);

  // Trading countdown
  useEffect(() => {
    if (phase !== "trading_open" || !tradingStartedAt) return;
    const tradingSecs = marketConfig.tradingSeconds || 300;
    const start = tradingStartedAt?.toDate?.()?.getTime() || Date.now();
    const tick = () => {
      const elapsed = (Date.now() - start) / 1000;
      const remaining = Math.max(0, tradingSecs - elapsed);
      setTimerLeft(Math.ceil(remaining));
    };
    tick();
    const interval = setInterval(tick, 500);
    return () => clearInterval(interval);
  }, [phase, tradingStartedAt, marketConfig.tradingSeconds]);

  // Card flash countdown
  useEffect(() => {
    if (phase !== "card_flash" || !cardFlashStartedAt) return;
    const flashSecs = marketConfig.cardFlashSeconds || 2;
    const start = cardFlashStartedAt?.toDate?.()?.getTime() || Date.now();
    const tick = () => {
      const elapsed = (Date.now() - start) / 1000;
      const remaining = Math.max(0, flashSecs - elapsed);
      setFlashLeft(Math.ceil(remaining));
    };
    tick();
    const interval = setInterval(tick, 100);
    return () => clearInterval(interval);
  }, [phase, cardFlashStartedAt, marketConfig.cardFlashSeconds]);

  const sellers = marketRoles.sellers || [];
  const buyers = marketRoles.buyers || [];
  const completedTrades = trades.filter(t => t.status === "accepted");
  const pendingTrades = trades.filter(t => t.status === "pending");
  const rejectedTrades = trades.filter(t => t.status === "rejected" || t.status === "expired");
  const sellersWhoSold = completedTrades.map(t => t.sellerId);
  const eliminatedCount = pendingEliminations.length;

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  // ── STEP 1: LOBBY CONFIG ──
  if (phase === "lobby") {
    return (
      <div className="w-full space-y-6 p-4 border border-secondary/40 bg-secondary/5">
        <h3 className="text-sm uppercase tracking-widest text-secondary font-bold">Market of Lemons — Setup</h3>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-[10px] text-textMuted uppercase tracking-widest block">Number of Sellers</label>
            <input type="number" min={1} max={alivePlayers.length - 1} value={numSellers}
              onChange={e => {
                const n = parseInt(e.target.value) || 1;
                setNumSellers(n);
                setNumGold(Math.ceil(n * 0.6));
              }}
              className="w-full bg-background border border-border px-3 py-2 text-sm outline-none focus:border-secondary" />
            <p className="text-[10px] text-textMuted">{alivePlayers.length - numSellers} buyers</p>
          </div>
          <div className="space-y-2">
            <label className="text-[10px] text-textMuted uppercase tracking-widest block">Gold Cards</label>
            <input type="number" min={0} max={numSellers} value={numGold}
              onChange={e => setNumGold(parseInt(e.target.value) || 0)}
              className="w-full bg-background border border-border px-3 py-2 text-sm outline-none focus:border-secondary" />
            <p className="text-[10px] text-amber-400">{numSellers - numGold} Lead cards</p>
          </div>
          <div className="space-y-2">
            <label className="text-[10px] text-textMuted uppercase tracking-widest block">Card Flash (seconds)</label>
            <input type="number" min={1} max={10} value={cardFlashSeconds}
              onChange={e => setCardFlashSeconds(parseInt(e.target.value) || 2)}
              className="w-full bg-background border border-border px-3 py-2 text-sm outline-none focus:border-secondary" />
          </div>
          <div className="space-y-2">
            <label className="text-[10px] text-textMuted uppercase tracking-widest block">Trading Time (seconds)</label>
            <input type="number" min={30} max={600} value={tradingSeconds}
              onChange={e => setTradingSeconds(parseInt(e.target.value) || 300)}
              className="w-full bg-background border border-border px-3 py-2 text-sm outline-none focus:border-secondary" />
            <p className="text-[10px] text-textMuted">{formatTime(tradingSeconds)}</p>
          </div>
        </div>

        <button
          onClick={async () => {
            if (!onUpdateGameState) return;
            setSaving(true);
            try {
              const { writeBatch, doc } = await import("firebase/firestore");
              const { db } = await import("@/lib/firebase");
              
              const batch = writeBatch(db);
              const shuffled = [...alivePlayers].sort(() => Math.random() - 0.5);
              const sellerDocs = shuffled.slice(0, numSellers);
              const buyerDocs = shuffled.slice(numSellers);
              
              const goldSellerDocs = sellerDocs.slice(0, numGold);
              const leadSellerDocs = sellerDocs.slice(numGold);
              
              sellerDocs.forEach(p => {
                const isGold = goldSellerDocs.some(g => g.id === p.id);
                batch.update(doc(db, "players", p.id), {
                  marketRole: "seller", marketCard: isGold ? "gold" : "lead", marketCardSeen: false, marketTradeId: null, marketTradesReceived: 0, marketTradesAccepted: 0,
                });
              });
              
              buyerDocs.forEach(p => {
                batch.update(doc(db, "players", p.id), {
                  marketRole: "buyer", marketCard: null, marketCardSeen: false, marketTradeId: null, marketTradesReceived: 0, marketTradesAccepted: 0,
                });
              });
              
              batch.update(doc(db, "system", "gameState"), {
                phase: "roles_assigned", revealStep: 0, pendingEliminations: [],
                marketConfig: { numSellers, numGoldCards: numGold, numLeadCards: numSellers - numGold, cardFlashSeconds, tradingSeconds, pointsBuyerGold: 80, pointsBuyerLead: 0, pointsSellerSold: 60, pointsSellerUnsold: 20 },
                marketRoles: { sellers: sellerDocs.map(d => d.id), buyers: buyerDocs.map(d => d.id) }
              });
              
              await batch.commit();
              const assignedData = {
                sellers: sellerDocs.map(d => ({ id: d.id, name: d.name, card: goldSellerDocs.some(g => g.id === d.id) ? "gold" : "lead" })),
                buyers: buyerDocs.map(d => ({ id: d.id, name: d.name }))
              };
              setAssignedData(assignedData);
              onUpdateGameState({ phase: "roles_assigned" } as any);
            } catch (e: any) {
              alert(e.message);
            } finally {
              setSaving(false);
            }
          }}
          disabled={saving || alivePlayers.length < 2}
          className="w-full py-4 bg-secondary text-background font-bold uppercase tracking-widest hover:bg-white transition-colors disabled:opacity-40"
        >
          {saving ? "Assigning..." : `Assign Roles (${alivePlayers.length} players)`}
        </button>
      </div>
    );
  }

  // ── STEP 2: ROLES ASSIGNED ──
  if (phase === "roles_assigned") {
    const data = assignedData || { sellers: sellers.map((id: string) => {
      const p = players.find(pl => pl.id === id);
      return { id, name: p?.name || id, card: (p as any)?.marketCard || "?" };
    }), buyers: buyers.map((id: string) => {
      const p = players.find(pl => pl.id === id);
      return { id, name: p?.name || id };
    })};

    return (
      <div className="w-full space-y-6 p-4">
        <div className="border border-secondary bg-secondary/5 p-4">
          <h3 className="text-sm uppercase tracking-widest text-secondary font-bold mb-4">Roles Assigned — Admin Cheat Sheet</h3>

          <div className="grid grid-cols-2 gap-4 text-xs mb-4">
            <div className="border border-amber-500/30 bg-amber-900/10 p-3 text-center">
              <p className="text-amber-400 font-bold text-xl">{data.sellers?.filter((s: any) => s.card === "gold").length || 0}</p>
              <p className="text-textMuted uppercase">Gold Cards</p>
            </div>
            <div className="border border-gray-500/30 bg-gray-900/10 p-3 text-center">
              <p className="text-gray-400 font-bold text-xl">{data.sellers?.filter((s: any) => s.card === "lead").length || 0}</p>
              <p className="text-textMuted uppercase">Lead Cards</p>
            </div>
          </div>

          <div className="space-y-3">
            <div className="border-b border-border pb-2">
              <p className="text-[10px] text-secondary uppercase tracking-widest mb-2">Sellers</p>
              <div className="space-y-1">
                {(data.sellers || []).map((s: any) => (
                  <div key={s.id} className="flex justify-between items-center text-xs py-1">
                    <span>{s.name} <span className="text-textMuted/50">({s.id?.substring(0, 6)})</span></span>
                    <span className={`font-bold uppercase ${s.card === "gold" ? "text-amber-400" : "text-gray-400"}`}>
                      {s.card === "gold" ? "GOLD" : "LEAD"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <p className="text-[10px] text-textMuted uppercase tracking-widest mb-2">{data.buyers?.length || 0} Buyers</p>
            </div>
          </div>
        </div>

        <button
          onClick={async () => {
            setSaving(true);
            try {
              const { writeBatch, doc, serverTimestamp } = await import("firebase/firestore");
              const { db } = await import("@/lib/firebase");
              const batch = writeBatch(db);
              batch.update(doc(db, "system", "gameState"), { phase: "card_flash", cardFlashStartedAt: serverTimestamp() });
              await batch.commit();
              onUpdateGameState?.({ phase: "card_flash", cardFlashStartedAt: new Date() } as any);
            } catch (e: any) { alert(e.message); }
            finally { setSaving(false); }
          }}
          disabled={saving}
          className="w-full py-4 bg-primary text-white font-bold uppercase tracking-widest hover:bg-primary/80 transition-colors disabled:opacity-40 shadow-glow-red"
        >
          {saving ? "..." : "Start Card Flash"}
        </button>
      </div>
    );
  }

  // ── STEP 3: CARD FLASH ──
  if (phase === "card_flash") {
    return (
      <div className="w-full space-y-6 p-4 text-center">
        <div className="border border-secondary bg-secondary/5 p-6">
          <h3 className="text-xl font-serif text-secondary uppercase tracking-widest mb-4">Card Flash in Progress</h3>
          {flashLeft !== null && (
            <p className="text-6xl font-mono font-bold text-secondary animate-pulse">{flashLeft}s</p>
          )}
          <p className="text-textMuted text-sm mt-4 uppercase tracking-widest">Sellers are viewing their cards.</p>
          <p className="text-textMuted/50 text-xs mt-1">Buyers see a waiting screen.</p>
        </div>

        <button
          onClick={async () => {
            setSaving(true);
            try {
              const { writeBatch, doc, serverTimestamp } = await import("firebase/firestore");
              const { db } = await import("@/lib/firebase");
              const batch = writeBatch(db);
              batch.update(doc(db, "system", "gameState"), { phase: "trading_open", tradingStartedAt: serverTimestamp() });
              await batch.commit();
              onUpdateGameState?.({ phase: "trading_open", tradingStartedAt: new Date() } as any);
            } catch (e: any) { alert(e.message); }
            finally { setSaving(false); }
          }}
          disabled={saving}
          className="w-full py-4 bg-primary text-white font-bold uppercase tracking-widest hover:bg-primary/80 transition-colors disabled:opacity-40 shadow-glow-red"
        >
          {saving ? "..." : "Open Trading Manually"}
        </button>
      </div>
    );
  }

  // ── STEP 4: TRADING OPEN ──
  if (phase === "trading_open") {
    return (
      <div className="w-full space-y-4 p-4">
        {/* Stats */}
        <div className="grid grid-cols-4 gap-2 text-center text-xs">
          <div className="border border-border bg-surface p-3">
            <p className="text-secondary font-bold text-xl">{completedTrades.length}</p>
            <p className="text-textMuted uppercase text-[10px]">Completed</p>
          </div>
          <div className="border border-border bg-surface p-3">
            <p className="text-amber-400 font-bold text-xl">{pendingTrades.length}</p>
            <p className="text-textMuted uppercase text-[10px]">Pending</p>
          </div>
          <div className="border border-border bg-surface p-3">
            <p className="text-textMuted font-bold text-xl">{sellersWhoSold.length}/{sellers.length}</p>
            <p className="text-textMuted uppercase text-[10px]">Sold</p>
          </div>
          <div className={`border bg-surface p-3 ${(timerLeft ?? 0) <= 30 ? "border-primary" : "border-border"}`}>
            <p className={`font-mono font-bold text-xl ${(timerLeft ?? 0) <= 30 ? "text-primary animate-pulse" : "text-primary"}`}>
              {timerLeft !== null ? formatTime(timerLeft) : "--:--"}
            </p>
            <p className="text-textMuted uppercase text-[10px]">Time Left</p>
          </div>
        </div>

        {/* Seller board */}
        <div className="border border-border bg-surface p-3">
          <p className="text-[10px] text-textMuted uppercase tracking-widest mb-2">Seller Board</p>
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {sellers.map((sellerId: string) => {
              const trade = completedTrades.find(t => t.sellerId === sellerId);
              const sellerPlayer = players.find(p => p.id === sellerId);
              const sellerCard = (sellerPlayer as any)?.marketCard || "?";
              return (
                <div key={sellerId} className={`flex justify-between items-center p-2 border-b border-border/20 text-xs ${trade ? "border-l-2 border-l-green-500 bg-green-900/10" : ""}`}>
                  <span>{sellerPlayer?.name || sellerId?.substring(0, 6)}</span>
                  <span className={`font-bold uppercase ${sellerCard === "gold" ? "text-amber-400" : "text-gray-400"}`}>
                    {sellerCard} {trade ? `→ ${trade.buyerName?.substring(0, 6) || "?"}` : ""}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Trade log */}
        <div className="border border-border bg-surface p-3">
          <p className="text-[10px] text-textMuted uppercase tracking-widest mb-2">Live Trade Log</p>
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {trades.length === 0 && <p className="text-textMuted/50 text-xs text-center py-4">No trades yet.</p>}
            {trades.map(t => (
              <div key={t.id} className={`flex justify-between items-center p-2 border-b border-border/20 text-xs ${t.status === "accepted" ? "text-green-400" : t.status === "pending" ? "text-amber-400" : "text-primary/60"}`}>
                <span>{t.buyerName?.substring(0, 8)} → {t.sellerName?.substring(0, 8)}</span>
                <span className="uppercase font-bold">{t.status}</span>
              </div>
            ))}
          </div>
        </div>

        <button
          onClick={async () => {
            setSaving(true);
            try {
              const { writeBatch, doc, serverTimestamp } = await import("firebase/firestore");
              const { db } = await import("@/lib/firebase");
              const batch = writeBatch(db);
              
              // Set pending trades to expired
              const pending = trades.filter(t => t.status === "pending");
              pending.forEach(t => batch.update(doc(db, "marketTrades", t.id), { status: "expired", resolvedAt: serverTimestamp() }));
              
              batch.update(doc(db, "system", "gameState"), { phase: "trading_locked" });
              await batch.commit();
              onUpdateGameState?.({ phase: "trading_locked" } as any);
            } catch (e: any) { alert(e.message); }
            finally { setSaving(false); }
          }}
          disabled={saving}
          className="w-full py-3 border border-primary text-primary uppercase tracking-widest text-xs font-bold hover:bg-primary hover:text-white transition-colors shadow-glow-red disabled:opacity-40"
        >
          {saving ? "..." : "End Trading Early"}
        </button>
      </div>
    );
  }

  // ── STEP 5: TRADING LOCKED ──
  if (phase === "trading_locked") {
    return (
      <div className="w-full space-y-6 p-4 text-center">
        <div className="border border-secondary bg-secondary/5 p-6">
          <h3 className="text-xl font-serif text-secondary uppercase tracking-widest mb-2">Trading Ended</h3>
          <p className="text-textMuted text-sm">{completedTrades.length} trades completed · {pendingTrades.length} expired</p>
        </div>

        <button
          onClick={async () => {
            setSaving(true);
            try {
              const res = await fetch("/api/game/lemons/calculate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ slotNumber: gameState.currentSlot }),
              });
              const data = await res.json();
              if (!data.success) {
                alert(data.error || "Calculation failed.");
              } else {
                onUpdateGameState?.({ results: data.results } as any);
              }
            } catch (e: any) { alert(e.message); }
            finally { setSaving(false); }
          }}
          disabled={saving}
          className="w-full py-4 bg-secondary text-background font-bold uppercase tracking-widest hover:bg-white transition-colors disabled:opacity-40 shadow-glow-gold"
        >
          {saving ? "Calculating..." : "Calculate Results"}
        </button>
      </div>
    );
  }

  // ── STEP 6: REVEAL ──
  if (phase === "reveal") {
    return (
      <div className="w-full space-y-4 p-4">
        <div className="border border-secondary bg-secondary/5 p-4">
          <h3 className="text-sm uppercase tracking-widest text-secondary font-bold mb-3">Results Preview</h3>
          <div className="space-y-2 text-xs max-h-48 overflow-y-auto">
            {(results || []).map((r: any, i: number) => (
              <div key={i} className={`flex justify-between items-center p-2 border-b border-border/20 ${r.outcome === "eliminated" ? "text-primary" : "text-secondary"}`}>
                <span>{r.buyerName || r.buyerId?.substring(0, 6)} — {r.sellerName ? `← ${r.sellerName?.substring(0, 6)}` : "No trade"}</span>
                <span className="uppercase font-bold">
                  {r.cardType ? r.cardType.toUpperCase() : r.outcome === "no_trade" ? "NO TRADE" : r.outcome?.toUpperCase()}
                </span>
              </div>
            ))}
            {results.length === 0 && <p className="text-textMuted/50 text-center py-4">No results yet.</p>}
          </div>
        </div>

        {/* Reveal step buttons */}
        <div className="grid grid-cols-3 gap-2 text-xs">
          <button
            onClick={async () => {
              const { writeBatch, doc } = await import("firebase/firestore"); const { db } = await import("@/lib/firebase"); const batch = writeBatch(db); batch.update(doc(db, "system", "gameState"), { revealStep: 1 }); await batch.commit(); onUpdateGameState?.({ revealStep: 1 } as any);
            }}
            disabled={revealStep >= 1}
            className={`py-3 border font-bold uppercase tracking-widest transition-colors ${revealStep >= 1 ? "bg-secondary/20 border-secondary text-secondary cursor-not-allowed" : "border-secondary text-secondary hover:bg-secondary hover:text-background"}`}
          >
            1. Seller Cards
          </button>
          <button
            onClick={async () => {
              const { writeBatch, doc } = await import("firebase/firestore"); const { db } = await import("@/lib/firebase"); const batch = writeBatch(db); batch.update(doc(db, "system", "gameState"), { revealStep: 2 }); await batch.commit(); onUpdateGameState?.({ revealStep: 2 } as any);
            }}
            disabled={revealStep >= 2}
            className={`py-3 border font-bold uppercase tracking-widest transition-colors ${revealStep >= 2 ? "bg-secondary/20 border-secondary text-secondary cursor-not-allowed" : "border-secondary text-secondary hover:bg-secondary hover:text-background"}`}
          >
            2. Trade Results
          </button>
          <button
            onClick={async () => {
              const { writeBatch, doc } = await import("firebase/firestore"); const { db } = await import("@/lib/firebase"); const batch = writeBatch(db); batch.update(doc(db, "system", "gameState"), { revealStep: 3 }); await batch.commit(); onUpdateGameState?.({ revealStep: 3 } as any);
            }}
            disabled={revealStep >= 3}
            className={`py-3 border font-bold uppercase tracking-widest transition-colors ${revealStep >= 3 ? "bg-secondary/20 border-secondary text-secondary cursor-not-allowed" : "border-secondary text-secondary hover:bg-secondary hover:text-background"}`}
          >
            3. Verdict
          </button>
        </div>

        {revealStep >= 3 && (
          <button
            onClick={async () => {
              setSaving(true);
              try {
                const { confirmEliminations } = await import("@/lib/services/admin-service");
                await confirmEliminations(pendingEliminations, "adminId");
                const { writeBatch, doc } = await import("firebase/firestore"); const { db } = await import("@/lib/firebase");
                const batch = writeBatch(db);
                results.forEach((r: any) => {
                   if (r.buyerId) batch.update(doc(db, "players", r.buyerId), { pointsDelta: r.delta });
                   else if (r.sellerId) batch.update(doc(db, "players", r.sellerId), { pointsDelta: r.delta });
                });
                batch.update(doc(db, "system", "gameState"), { phase: "confirmed" });
                await batch.commit();
                onUpdateGameState?.({ phase: "confirmed" } as any);
              } catch (e: any) { alert(e.message); }
              finally { setSaving(false); }
            }}
            disabled={saving}
            className="w-full py-4 bg-primary text-white font-bold uppercase tracking-widest hover:bg-primary/80 transition-colors disabled:opacity-40 shadow-glow-red"
          >
            {saving ? "..." : `Confirm Eliminations (${eliminatedCount} eliminated)`}
          </button>
        )}
      </div>
    );
  }

  // ── CONFIRMED ──
  if (phase === "confirmed") {
    return (
      <div className="w-full space-y-6 p-4 text-center">
        <div className="border border-secondary bg-secondary/10 p-6">
          <h3 className="text-xl font-serif text-secondary uppercase tracking-widest">Results Confirmed</h3>
          <p className="text-textMuted text-sm mt-2">{eliminatedCount} players eliminated.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 text-textMuted text-sm uppercase tracking-widest">
      Lemons — phase: {phase}
    </div>
  );
}
