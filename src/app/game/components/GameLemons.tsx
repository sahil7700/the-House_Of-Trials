"use client";
import { useState, useEffect, useRef } from "react";
import { db } from "@/lib/firebase";
import { doc, onSnapshot, collection, query, where, serverTimestamp } from "firebase/firestore";
import { motion, AnimatePresence } from "framer-motion";

interface Props {
  playerId: string;
  gameState: any;
  isLocked: boolean;
}

type Phase = "lobby" | "roles_assigned" | "card_flash" | "trading_open" | "trading_locked" | "reveal" | "confirmed";

export default function GameLemons({ playerId, gameState, isLocked }: Props) {
  const [marketRole, setMarketRole] = useState<"seller" | "buyer" | null>(null);
  const [marketCard, setMarketCard] = useState<"gold" | "lead" | null>(null);
  const [marketCardSeen, setMarketCardSeen] = useState(false);
  const [marketTradeId, setMarketTradeId] = useState<string | null>(null);
  const [myTrade, setMyTrade] = useState<any>(null);
  const [pendingRequest, setPendingRequest] = useState<any>(null);
  const [tradesReceived, setTradesReceived] = useState<any[]>([]);
  const [sellerIdInput, setSellerIdInput] = useState("");
  const [tradeError, setTradeError] = useState<string | null>(null);
  const [tradeSending, setTradeSending] = useState(false);
  const [tradeAccepted, setTradeAccepted] = useState(false);
  const [tradeRejected, setTradeRejected] = useState(false);
  const [timerLeft, setTimerLeft] = useState<number | null>(null);
  const [cardFlashLeft, setCardFlashLeft] = useState<number | null>(null);
  const [reconnectBanner, setReconnectBanner] = useState(false);
  const prevPhaseRef = useRef<string>("");

  const phase: Phase = gameState?.phase || "lobby";
  const marketConfig = gameState?.marketConfig || {};
  const revealStep: number = gameState?.revealStep || 0;
  const tradingStartedAt = gameState?.tradingStartedAt;
  const cardFlashStartedAt = gameState?.cardFlashStartedAt;
  const results: any[] = gameState?.results || [];
  const pendingEliminations: string[] = gameState?.pendingEliminations || [];

  // Listen to own player doc
  useEffect(() => {
    if (!playerId) return;
    const unsub = onSnapshot(doc(db, "players", playerId), (snap) => {
      if (!snap.exists()) return;
      const d = snap.data();
      setMarketRole(d.marketRole || null);
      setMarketCard(d.marketCard || null);
      setMarketCardSeen(d.marketCardSeen || false);
      setMarketTradeId(d.marketTradeId || null);
      if (d.marketRole === "buyer" && d.marketTradeId) {
        setTradeAccepted(true);
      }
    }, () => {});
    return () => unsub();
  }, [playerId]);

  // Listen to my accepted trade (buyer)
  useEffect(() => {
    if (!playerId || marketRole !== "buyer" || !marketTradeId) return;
    const unsub = onSnapshot(doc(db, "marketTrades", marketTradeId), (snap) => {
      if (snap.exists()) setMyTrade({ id: snap.id, ...snap.data() });
    }, () => {});
    return () => unsub();
  }, [playerId, marketRole, marketTradeId]);

  // Listen to incoming pending trades (seller)
  useEffect(() => {
    if (!playerId || marketRole !== "seller") return;
    const q = query(
      collection(db, "marketTrades"),
      where("sellerId", "==", playerId),
      where("status", "==", "pending")
    );
    const unsub = onSnapshot(q, (snap) => {
      const trades = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setTradesReceived(trades);
    }, () => {});
    return () => unsub();
  }, [playerId, marketRole]);

  // Reconnect banner
  useEffect(() => {
    if (prevPhaseRef.current && prevPhaseRef.current !== phase) {
      setReconnectBanner(true);
      const t = setTimeout(() => setReconnectBanner(false), 3000);
      return () => clearTimeout(t);
    }
    prevPhaseRef.current = phase;
  }, [phase]);

  // Card flash countdown
  useEffect(() => {
    if (phase !== "card_flash" || !cardFlashStartedAt) return;
    const flashSecs = marketConfig.cardFlashSeconds || 2;
    const start = cardFlashStartedAt?.toDate?.()?.getTime() || Date.now();

    const tick = () => {
      const elapsed = (Date.now() - start) / 1000;
      const remaining = Math.max(0, flashSecs - elapsed);
      setCardFlashLeft(remaining);

      if (remaining <= 0) {
        setCardFlashLeft(0);
      }
    };

    tick();
    const interval = setInterval(tick, 100);
    return () => clearInterval(interval);
  }, [phase, cardFlashStartedAt, marketConfig.cardFlashSeconds]);

  // Card flash auto-complete: mark card seen after flash
  useEffect(() => {
    if (phase !== "card_flash" || cardFlashLeft !== 0 || marketCardSeen) return;
    import("firebase/firestore").then(({ updateDoc, doc }) => {
      updateDoc(doc(db, "players", playerId), { marketCardSeen: true }).catch(() => {});
    });
  }, [phase, cardFlashLeft, marketCardSeen, playerId]);

  // Trading countdown
  useEffect(() => {
    if (phase !== "trading_open" || !tradingStartedAt) return;
    const tradingSecs = marketConfig.tradingSeconds || 300;
    const start = tradingStartedAt?.toDate?.()?.getTime() || Date.now();

    const tick = () => {
      const elapsed = (Date.now() - start) / 1000;
      const remaining = Math.max(0, tradingSecs - elapsed);
      setTimerLeft(Math.ceil(remaining));

      if (remaining <= 0) {
        setTimerLeft(0);
      }
    };

    tick();
    const interval = setInterval(tick, 500);
    return () => clearInterval(interval);
  }, [phase, tradingStartedAt, marketConfig.tradingSeconds]);

  const sendTradeRequest = async () => {
    let targetId = sellerIdInput.trim().replace(/^#/, "");
    setTradeError(null);
    setTradeSending(true);
    try {
      const res = await fetch("/api/game/lemons/send-trade-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ buyerId: playerId, sellerId: targetId, slotNumber: gameState.currentSlot }),
      });
      const data = await res.json();
      if (!data.success) {
        setTradeError(data.error || "Failed to send request.");
      } else {
        setPendingRequest({ id: data.tradeId, sellerId: targetId, status: "pending" });
        setSellerIdInput("");
      }
    } catch (e: any) {
      setTradeError(e.message);
    } finally {
      setTradeSending(false);
    }
  };

  const cancelRequest = async () => {
    if (!pendingRequest) return;
    try {
      await fetch("/api/game/lemons/respond-to-trade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tradeId: pendingRequest.id, sellerId: pendingRequest.sellerId, response: "expired" }),
      });
    } catch {}
    setPendingRequest(null);
  };

  const respondToTrade = async (tradeId: string, sellerId: string, response: "accepted" | "rejected") => {
    try {
      const res = await fetch("/api/game/lemons/respond-to-trade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tradeId, sellerId, response }),
      });
      const data = await res.json();
      if (data.success) {
        if (response === "accepted") setTradeAccepted(true);
        if (response === "rejected") {
          setTradeRejected(true);
          setTimeout(() => setTradeRejected(false), 2000);
        }
        setTradesReceived(prev => prev.filter(t => t.id !== tradeId));
      }
    } catch {}
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  // ── LOBBY ──
  if (phase === "lobby") {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4 font-mono text-center">
        <div className="w-8 h-8 border-2 border-secondary border-t-transparent rounded-full animate-spin" />
        <p className="text-textMuted uppercase tracking-widest text-sm">Get ready...</p>
        <p className="text-[10px] text-textMuted/50 uppercase tracking-widest max-w-xs">Market of Lemons — Roles will be assigned shortly.</p>
      </div>
    );
  }

  // ── ROLES ASSIGNED ──
  if (phase === "roles_assigned") {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 relative">
        <AnimatePresence>
          {reconnectBanner && (
            <motion.div initial={{ y: -50, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -50, opacity: 0 }}
              className="absolute top-4 left-1/2 -translate-x-1/2 bg-secondary/20 border border-secondary px-4 py-2 text-secondary text-xs uppercase tracking-widest z-50">
              Reconnected
            </motion.div>
          )}
        </AnimatePresence>

        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8 }}
          className="w-full max-w-md text-center space-y-8"
        >
          <p className="text-[10px] text-textMuted uppercase tracking-widest">Your Role</p>
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.3, type: "spring", stiffness: 200 }}
            className="w-full py-16 border-2 border-secondary bg-secondary/10 flex flex-col items-center justify-center"
          >
            <p className="text-5xl font-serif text-secondary uppercase tracking-widest">Seller</p>
          </motion.div>
          <p className="text-textMuted text-sm">Your card will be revealed shortly.</p>
          <p className="text-secondary text-lg font-mono">ID: {playerId}</p>
        </motion.div>
      </div>
    );
  }

  // ── CARD FLASH ──
  if (phase === "card_flash") {
    const isGold = marketCard === "gold";
    const isFlipped = cardFlashLeft === null || cardFlashLeft > 0;

    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 relative">
        <AnimatePresence>
          {reconnectBanner && (
            <motion.div initial={{ y: -50, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -50, opacity: 0 }}
              className="absolute top-4 left-1/2 -translate-x-1/2 bg-secondary/20 border border-secondary px-4 py-2 text-secondary text-xs uppercase tracking-widest z-50">
              Reconnected
            </motion.div>
          )}
        </AnimatePresence>

        <div className="w-full max-w-sm text-center space-y-8">
          {marketRole === "seller" ? (
            <>
              <p className="text-[10px] text-textMuted uppercase tracking-widest">Your Card</p>
              <motion.div
                className="relative w-48 h-72 mx-auto"
                initial={false}
                animate={{ rotateY: isFlipped ? 0 : 180 }}
                transition={{ duration: 0.8, ease: "easeInOut" }}
                style={{ transformStyle: "preserve-3d" }}
              >
                {/* Back */}
                <div
                  className="absolute inset-0 rounded-xl border-4 border-secondary bg-[#1a1a2e] flex items-center justify-center"
                  style={{ backfaceVisibility: "hidden" }}
                >
                  <span className="text-6xl text-secondary">♠</span>
                </div>
                {/* Front */}
                <div
                  className={`absolute inset-0 rounded-xl border-4 flex flex-col items-center justify-center ${isGold ? "border-amber-400 bg-gradient-to-b from-amber-600 to-amber-800" : "border-gray-500 bg-gradient-to-b from-gray-600 to-gray-800"}`}
                  style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}
                >
                  <p className={`text-6xl font-serif font-bold ${isGold ? "text-amber-100" : "text-gray-300"}`}>
                    {isGold ? "GOLD" : "LEAD"}
                  </p>
                  <p className={`text-sm mt-4 ${isGold ? "text-amber-200" : "text-gray-400"}`}>
                    {isGold ? "100 pts" : "0 pts"}
                  </p>
                </div>
              </motion.div>

              {cardFlashLeft !== null && (
                <div className="w-full h-2 bg-background border border-border overflow-hidden">
                  <motion.div
                    className="h-full bg-secondary"
                    animate={{ width: `${(cardFlashLeft / (marketConfig.cardFlashSeconds || 2)) * 100}%` }}
                    transition={{ duration: 0.1 }}
                  />
                </div>
              )}

              <p className="text-xs text-textMuted">Your ID: <span className="text-secondary font-bold">{playerId}</span></p>
            </>
          ) : (
            <div className="space-y-6">
              <div className="w-16 h-16 border-2 border-amber-400 border-t-transparent rounded-full animate-spin mx-auto" />
              <p className="text-amber-400 text-xl uppercase tracking-widest">Stand by</p>
              <p className="text-textMuted text-sm">Sellers are viewing their cards.</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── TRADING OPEN ──
  if (phase === "trading_open") {
    return (
      <div className="min-h-screen bg-background flex flex-col p-4 relative">
        <AnimatePresence>
          {reconnectBanner && (
            <motion.div initial={{ y: -50, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -50, opacity: 0 }}
              className="absolute top-4 left-1/2 -translate-x-1/2 bg-secondary/20 border border-secondary px-4 py-2 text-secondary text-xs uppercase tracking-widest z-50">
              Reconnected
            </motion.div>
          )}
        </AnimatePresence>

        {/* Top bar */}
        <div className="flex justify-between items-center border-b border-border pb-3 mb-4">
          <div>
            <p className="text-[10px] text-textMuted uppercase">Your ID</p>
            <p className="text-secondary font-bold font-mono text-lg">{playerId}</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] text-textMuted uppercase">Time Left</p>
            <p className={`font-mono font-bold text-2xl ${(timerLeft ?? 0) <= 30 ? "text-primary animate-pulse" : "text-primary"}`}>
              {timerLeft !== null ? formatTime(timerLeft) : "--:--"}
            </p>
          </div>
        </div>

        {/* SELLER VIEW */}
        {marketRole === "seller" && (
          <div className="flex-1 space-y-4">
            {tradeAccepted ? (
              <div className="flex-1 flex flex-col items-center justify-center space-y-4 text-center">
                <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="w-20 h-20 border-2 border-secondary bg-secondary/20 rounded-full flex items-center justify-center">
                  <span className="text-4xl text-secondary">✓</span>
                </motion.div>
                <p className="text-secondary font-serif text-xl uppercase tracking-widest">Trade Complete</p>
                <p className="text-textMuted text-sm">You sold your {marketCard?.toUpperCase()} card.</p>
              </div>
            ) : (
              <>
                <div className="text-center space-y-1">
                  <p className="text-[10px] text-textMuted uppercase">Share your ID with buyers</p>
                  <p className="text-4xl font-mono text-secondary font-bold tracking-widest">{playerId}</p>
                </div>

                {tradeRejected && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    className="border border-primary bg-primary/10 p-3 text-center">
                    <p className="text-primary text-sm">You declined a request.</p>
                  </motion.div>
                )}

                {tradesReceived.length > 0 && (
                  <div className="space-y-3">
                    {tradesReceived.map(trade => (
                      <motion.div
                        key={trade.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="border border-secondary bg-secondary/5 p-5 space-y-4"
                      >
                        <div className="text-center">
                          <p className="text-[10px] text-textMuted uppercase tracking-widest">Trade Request From</p>
                          <p className="text-xl font-serif text-secondary">{trade.buyerName || trade.buyerId}</p>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => respondToTrade(trade.id, playerId, "accepted")}
                            className="flex-1 py-4 bg-secondary text-background font-bold uppercase tracking-widest text-sm hover:bg-white transition-colors shadow-glow-gold"
                          >
                            Accept
                          </button>
                          <button
                            onClick={() => respondToTrade(trade.id, playerId, "rejected")}
                            className="flex-1 py-4 bg-primary/10 border border-primary text-primary font-bold uppercase tracking-widest text-sm hover:bg-primary hover:text-white transition-colors"
                          >
                            Decline
                          </button>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                )}

                {tradesReceived.length === 0 && (
                  <div className="border border-border bg-surface p-8 text-center">
                    <p className="text-textMuted text-sm uppercase tracking-widest">Waiting for buyers...</p>
                    <p className="text-textMuted/50 text-xs mt-2">Share your ID — buyers will contact you.</p>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* BUYER VIEW */}
        {marketRole === "buyer" && (
          <div className="flex-1 space-y-4">
            {tradeAccepted && myTrade ? (
              <div className="flex-1 flex flex-col items-center justify-center space-y-4 text-center">
                <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="w-20 h-20 border-2 border-secondary bg-secondary/20 rounded-full flex items-center justify-center">
                  <span className="text-4xl text-secondary">✓</span>
                </motion.div>
                <p className="text-secondary font-serif text-xl uppercase tracking-widest">Trade Confirmed</p>
                <p className="text-textMuted text-sm">You traded with {myTrade.sellerName || myTrade.sellerId}.</p>
                <p className="text-textMuted/50 text-xs">Card revealed at end of round.</p>
              </div>
            ) : pendingRequest ? (
              <div className="space-y-4">
                <div className="border border-amber-500/50 bg-amber-900/10 p-6 text-center space-y-2">
                  <p className="text-amber-400 font-serif text-lg uppercase tracking-widest">Request Sent</p>
                  <p className="text-textMuted text-sm">Waiting for {pendingRequest.sellerId}...</p>
                  <div className="w-6 h-6 border-2 border-amber-400 border-t-transparent rounded-full animate-spin mx-auto" />
                </div>
                <button onClick={cancelRequest}
                  className="w-full py-3 border border-border text-textMuted uppercase tracking-widest text-xs hover:border-primary hover:text-primary transition-colors">
                  Cancel Request
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-textMuted text-sm text-center uppercase tracking-widest">Find a Seller — enter their ID below</p>
                <div className="space-y-2">
                  <input
                    type="text"
                    value={sellerIdInput}
                    onChange={e => { setSellerIdInput(e.target.value); setTradeError(null); }}
                    placeholder="Enter Seller's ID (e.g. #4013)"
                    className="w-full bg-surface border-2 border-border px-4 py-4 text-xl font-mono text-center uppercase tracking-widest outline-none focus:border-secondary"
                    onKeyDown={e => { if (e.key === "Enter") sendTradeRequest(); }}
                  />
                  {tradeError && (
                    <p className="text-primary text-xs text-center animate-pulse">{tradeError}</p>
                  )}
                  <button
                    onClick={sendTradeRequest}
                    disabled={tradeSending || !sellerIdInput.trim()}
                    className="w-full py-4 bg-primary text-white font-bold uppercase tracking-widest text-sm hover:bg-primary/80 transition-colors disabled:opacity-40 shadow-glow-red"
                  >
                    {tradeSending ? "Sending..." : "Send Trade Request"}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // ── TRADING LOCKED ──
  if (phase === "trading_locked") {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 text-center space-y-6">
        <h2 className="text-3xl font-serif text-secondary uppercase tracking-widest">Trading Ended</h2>
        <p className="text-textMuted uppercase tracking-widest">Results incoming...</p>
        <div className="w-8 h-8 border-2 border-secondary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // ── REVEAL ──
  if (phase === "reveal") {
    const isEliminated = pendingEliminations.includes(playerId);
    const myResult = results.find((r: any) => r.buyerId === playerId);
    const sellerWhoSoldToMe = myResult?.sellerName || myResult?.sellerId;
    const cardReceived = myResult?.cardType;
    const mySellerResult = results.find((r: any) => r.sellerId === playerId);
    const sellerOutcome = mySellerResult?.outcome;

    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 text-center space-y-8">
        {revealStep === 0 && (
          <div className="space-y-4">
            <h2 className="text-2xl font-serif text-secondary uppercase tracking-widest">Preparing Results...</h2>
            <div className="w-8 h-8 border-2 border-secondary border-t-transparent rounded-full animate-spin mx-auto" />
          </div>
        )}

        {revealStep >= 1 && marketRole === "seller" && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-sm space-y-6"
          >
            <p className="text-[10px] text-textMuted uppercase tracking-widest">Your Card</p>
            <div className={`w-40 h-56 mx-auto rounded-xl border-4 flex flex-col items-center justify-center ${marketCard === "gold" ? "border-amber-400 bg-gradient-to-b from-amber-600 to-amber-800" : "border-gray-500 bg-gradient-to-b from-gray-600 to-gray-800"}`}>
              <p className={`text-4xl font-serif font-bold ${marketCard === "gold" ? "text-amber-100" : "text-gray-300"}`}>
                {marketCard?.toUpperCase() || "—"}
              </p>
            </div>
            {sellerOutcome === "sold" && (
              <p className="text-secondary text-sm uppercase tracking-widest">You sold your card. +{marketConfig.pointsSellerSold || 60} pts</p>
            )}
            {sellerOutcome !== "sold" && (
              <p className="text-textMuted text-sm uppercase tracking-widest">You did not sell. +{marketConfig.pointsSellerUnsold || 20} pts</p>
            )}
          </motion.div>
        )}

        {revealStep >= 2 && marketRole === "buyer" && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-sm space-y-6"
          >
            {tradeAccepted && myTrade ? (
              <motion.div
                initial={{ rotateY: 90 }}
                animate={{ rotateY: 0 }}
                transition={{ duration: 1 }}
                className={`w-40 h-56 mx-auto rounded-xl border-4 flex flex-col items-center justify-center ${cardReceived === "gold" ? "border-amber-400 bg-gradient-to-b from-amber-600 to-amber-800" : "border-gray-500 bg-gradient-to-b from-gray-600 to-gray-800"}`}
              >
                <p className={`text-4xl font-serif font-bold ${cardReceived === "gold" ? "text-amber-100" : "text-gray-300"}`}>
                  {cardReceived?.toUpperCase() || "—"}
                </p>
              </motion.div>
            ) : (
              <div className="border border-border p-6 text-center">
                <p className="text-textMuted text-sm uppercase tracking-widest">No Trade Made</p>
                <p className="text-textMuted/50 text-xs mt-1">You are safe but received no points.</p>
              </div>
            )}
          </motion.div>
        )}

        {revealStep >= 3 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className={`w-full max-w-md p-8 border-2 text-center space-y-4 ${isEliminated ? "border-primary bg-primary/10" : "border-secondary bg-secondary/10"}`}
          >
            {marketRole === "seller" ? (
              <>
                <h3 className={`text-4xl font-serif uppercase tracking-widest ${sellerOutcome === "sold" ? "text-secondary" : "text-textMuted"}`}>
                  {sellerOutcome === "sold" ? "You Survive" : "You Survive"}
                </h3>
                <p className="text-textMuted text-sm">
                  {sellerOutcome === "sold"
                    ? `You sold your ${marketCard?.toUpperCase()} card. +${marketConfig.pointsSellerSold || 60} pts`
                    : `You did not sell your card. +${marketConfig.pointsSellerUnsold || 20} pts`}
                </p>
              </>
            ) : (
              <>
                {isEliminated ? (
                  <>
                    <h3 className="text-5xl font-serif text-primary uppercase tracking-widest animate-pulse">Eliminated</h3>
                    <p className="text-primary/70 text-sm">You received a LEAD card from {sellerWhoSoldToMe}.</p>
                    <p className="text-textMuted/50 text-xs">Redirecting...</p>
                  </>
                ) : tradeAccepted ? (
                  <>
                    <h3 className="text-4xl font-serif text-secondary uppercase tracking-widest">You Survive</h3>
                    <p className="text-secondary text-sm">You received GOLD. +{marketConfig.pointsBuyerGold || 80} pts</p>
                  </>
                ) : (
                  <>
                    <h3 className="text-4xl font-serif text-textMuted uppercase tracking-widest">You Survive</h3>
                    <p className="text-textMuted/50 text-sm">No trade — no elimination.</p>
                  </>
                )}
              </>
            )}
          </motion.div>
        )}
      </div>
    );
  }

  // Fallback
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4 font-mono text-center">
      <div className="w-8 h-8 border-2 border-secondary border-t-transparent rounded-full animate-spin" />
      <p className="text-textMuted uppercase tracking-widest text-sm">Market of Lemons</p>
    </div>
  );
}
