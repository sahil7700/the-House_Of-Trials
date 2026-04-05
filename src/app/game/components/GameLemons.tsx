"use client";
import { useEffect, useState, useCallback } from "react";
import { db } from "@/lib/firebase";
import {
  collection, doc, onSnapshot, addDoc, updateDoc,
  query, where, getDocs, serverTimestamp
} from "firebase/firestore";
import { motion, AnimatePresence } from "framer-motion";

interface Props {
  playerId: string;
  gameState: any;
  isLocked: boolean;
}

interface Trade {
  id: string;
  sellerId: string;
  buyerId: string;
  status: "pending" | "accepted" | "declined";
  createdAt: any;
}

export default function GameLemons({ playerId, gameState, isLocked }: Props) {
  const gsc = gameState?.gameSpecificConfig || {};
  const slotNumber = gameState?.currentSlot;

  // What this player IS: seller | buyer | unknown
  const [role, setRole] = useState<"seller" | "buyer" | null>(null);
  // Their asset (true = Gold, false = Lemon) — seller only
  const [asset, setAsset] = useState<boolean | null>(null);
  // Flashed indicator (shows asset for 2s then hides)
  const [assetFlashVisible, setAssetFlashVisible] = useState(false);
  // All alive players (for sellers to pick buyers)
  const [alivePlayers, setAlivePlayers] = useState<any[]>([]);
  // Incoming pending trade requests (for buyers)
  const [incomingTrades, setIncomingTrades] = useState<Trade[]>([]);
  // Outgoing trade status (for sellers)
  const [outgoingTrade, setOutgoingTrade] = useState<Trade | null>(null);
  // Players who have completed a trade (removed from available buyers)
  const [tradedBuyers, setTradedBuyers] = useState<Set<string>>(new Set());
  // Buyer input state
  const [buyerIdInput, setBuyerIdInput] = useState("");
  const [sendError, setSendError] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  // My completed trade outcome (shown after round)
  const [myOutcome, setMyOutcome] = useState<string | null>(null);
  const isReveal = gameState?.phase === "reveal" || gameState?.phase === "confirm";

  // Load this player's role + asset assignment
  useEffect(() => {
    if (!playerId || !slotNumber) return;
    const assignRef = doc(db, "lemonAssignments", `${slotNumber}_${playerId}`);
    return onSnapshot(assignRef, (snap) => {
      if (!snap.exists()) return;
      const data = snap.data();
      setRole(data.role as "seller" | "buyer");
      if (data.role === "seller" && data.asset !== undefined) {
        setAsset(data.asset); // true = Gold, false = Lemon
        setAssetFlashVisible(true);
        const timer = setTimeout(() => setAssetFlashVisible(false), 2500);
        return () => clearTimeout(timer);
      }
      if (isReveal && data.outcome) {
        setMyOutcome(data.outcome);
      }
    });
  }, [playerId, slotNumber, isReveal]);

  // Load all alive players (for sellers to target buyers)
  useEffect(() => {
    const q = query(collection(db, "players"), where("status", "==", "alive"));
    return onSnapshot(q, (snap) => {
      setAlivePlayers(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
  }, []);

  // Load outgoing/incoming trades
  useEffect(() => {
    if (!playerId || !slotNumber) return;
    const tradesRef = collection(db, "marketTrades");

    if (role === "seller") {
      const q = query(tradesRef, where("sellerId", "==", playerId), where("slotNumber", "==", slotNumber));
      return onSnapshot(q, (snap) => {
        const trades = snap.docs.map(d => ({ id: d.id, ...d.data() } as Trade));
        if (trades.length > 0) setOutgoingTrade(trades[0]);
        // Track which buyers are already traded-with
        const completed = new Set<string>(
          trades.filter(t => t.status === "accepted" || t.status === "declined")
               .map(t => t.buyerId)
        );
        setTradedBuyers(completed);
      });
    } else if (role === "buyer") {
      const q = query(tradesRef, where("buyerId", "==", playerId), where("slotNumber", "==", slotNumber), where("status", "==", "pending"));
      return onSnapshot(q, (snap) => {
        setIncomingTrades(snap.docs.map(d => ({ id: d.id, ...d.data() } as Trade)));
      });
    }
  }, [role, playerId, slotNumber]);

  const sendTradeRequest = async () => {
    if (!buyerIdInput.trim()) { setSendError("Enter a buyer's Player ID."); return; }
    setIsSending(true);
    setSendError(null);

    try {
      // Validate the buyer exists and is alive
      const buyerDoc = alivePlayers.find(p =>
        p.playerId?.toLowerCase() === buyerIdInput.trim().toLowerCase() ||
        p.id === buyerIdInput.trim()
      );
      if (!buyerDoc) throw new Error("Player not found or not alive.");

      // Verify they are a buyer
      const assignRef = doc(db, "lemonAssignments", `${slotNumber}_${buyerDoc.id}`);
      const assignSnap = await getDocs(query(collection(db, "lemonAssignments"),
        where("slotNumber", "==", slotNumber),
        where("playerId", "==", buyerDoc.id),
        where("role", "==", "buyer")
      ));
      if (assignSnap.empty) throw new Error("That player is not a buyer this round.");

      // Check no existing pending trade from this seller
      const existingQ = query(collection(db, "marketTrades"),
        where("sellerId", "==", playerId),
        where("slotNumber", "==", slotNumber),
        where("status", "==", "pending")
      );
      const existingSnap = await getDocs(existingQ);
      if (!existingSnap.empty) throw new Error("You already have a pending trade. Wait for the buyer to respond.");

      await addDoc(collection(db, "marketTrades"), {
        sellerId: playerId,
        buyerId: buyerDoc.id,
        slotNumber,
        status: "pending",
        createdAt: serverTimestamp(),
      });
      setBuyerIdInput("");
    } catch (e: any) {
      setSendError(e.message);
    } finally {
      setIsSending(false);
    }
  };

  const respondToTrade = async (tradeId: string, accept: boolean) => {
    await updateDoc(doc(db, "marketTrades", tradeId), {
      status: accept ? "accepted" : "declined",
      respondedAt: serverTimestamp(),
    });
  };

  // ── RENDER: Reveal phase shows what you got ──
  if (isReveal) {
    return (
      <div className="w-full max-w-lg mx-auto flex flex-col items-center justify-center min-h-[60vh] space-y-8 font-mono">
        <h2 className="text-xl font-serif text-secondary uppercase tracking-widest">Market Results</h2>
        {myOutcome ? (
          <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className={`w-full p-8 border text-center text-2xl font-bold uppercase tracking-widest ${myOutcome === "GOLD" ? "border-secondary text-secondary bg-secondary/10 shadow-glow-gold" : "border-primary text-primary bg-primary/10 shadow-glow-red"}`}>
            {myOutcome === "GOLD" ? "🥇 You got GOLD" : "🍋 You got a LEMON"}
          </motion.div>
        ) : (
          <p className="text-textMuted uppercase tracking-widest text-sm">No trade completed. Market outcome pending...</p>
        )}
      </div>
    );
  }

  // ── RENDER: Waiting for role assignment ──
  if (!role) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4 font-mono">
        <div className="w-8 h-8 border-2 border-secondary border-t-transparent rounded-full animate-spin" />
        <p className="text-textMuted uppercase tracking-widest text-sm">Awaiting role assignment...</p>
        <p className="text-[10px] text-textMuted/50">The host will assign Sellers and Buyers shortly.</p>
      </div>
    );
  }

  // ── RENDER: SELLER Screen ──
  if (role === "seller") {
    const availableBuyers = alivePlayers.filter(p =>
      p.id !== playerId &&
      !tradedBuyers.has(p.id)
    );

    return (
      <div className="w-full max-w-lg mx-auto space-y-6 font-mono">
        {/* Role badge */}
        <div className="text-center space-y-1">
          <span className="text-[10px] text-textMuted uppercase tracking-widest">Your Role</span>
          <h2 className="text-3xl font-serif uppercase tracking-widest text-secondary">Seller</h2>
        </div>

        {/* Asset Flash */}
        <AnimatePresence>
          {assetFlashVisible && asset !== null && (
            <motion.div
              key="asset-flash"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={{ duration: 0.3 }}
              className={`w-full py-12 text-center border-4 shadow-2xl font-bold text-5xl uppercase tracking-widest ${asset ? "border-secondary text-secondary bg-secondary/20 shadow-glow-gold" : "border-primary text-primary bg-primary/20 shadow-glow-red"}`}
            >
              {asset ? "🥇 GOLD" : "🍋 LEMON"}
              <p className="text-sm mt-4 text-textMuted normal-case font-normal tracking-normal">This will disappear in a moment</p>
            </motion.div>
          )}
        </AnimatePresence>

        {!assetFlashVisible && (
          <>
            {/* Trade status */}
            {outgoingTrade && outgoingTrade.status === "pending" && (
              <div className="border border-secondary/50 bg-secondary/5 p-4 text-center">
                <p className="text-xs text-textMuted uppercase tracking-widest mb-1">Trade Request Sent</p>
                <p className="text-secondary font-bold uppercase tracking-widest">Awaiting buyer response...</p>
              </div>
            )}
            {outgoingTrade && outgoingTrade.status === "accepted" && (
              <div className="border border-green-500/50 bg-green-900/10 p-4 text-center">
                <p className="text-green-400 font-bold uppercase tracking-widest text-lg">✓ Trade Complete!</p>
                <p className="text-xs text-textMuted mt-2">Buyer accepted. Final outcome revealed at round end.</p>
              </div>
            )}
            {outgoingTrade && outgoingTrade.status === "declined" && (
              <div className="border border-primary/50 bg-primary/5 p-4 text-center">
                <p className="text-primary font-bold uppercase tracking-widest">✗ Trade Declined</p>
                <p className="text-xs text-textMuted mt-2">Send another request to a different buyer.</p>
              </div>
            )}

            {/* Send Trade Panel */}
            {(!outgoingTrade || outgoingTrade.status === "declined") && !isLocked && (
              <div className="border border-border bg-surface p-6 space-y-4">
                <p className="text-xs uppercase tracking-widest text-textMuted">Available Buyers</p>
                <div className="space-y-2 max-h-40 overflow-y-auto">
                  {availableBuyers.length === 0 ? (
                    <p className="text-textMuted text-xs text-center py-4">No available buyers remaining.</p>
                  ) : availableBuyers.map(buyer => (
                    <button
                      key={buyer.id}
                      onClick={() => setBuyerIdInput(buyer.playerId || buyer.id)}
                      className={`w-full text-left p-3 border text-xs uppercase tracking-widest transition-all ${buyerIdInput === (buyer.playerId || buyer.id) ? "border-secondary bg-secondary/10 text-secondary" : "border-border hover:border-secondary/50"}`}
                    >
                      <span className="text-secondary font-bold">{buyer.playerId}</span>
                      <span className="ml-2 text-textMuted">{buyer.name}</span>
                    </button>
                  ))}
                </div>

                <div className="flex gap-2 mt-2">
                  <input
                    type="text"
                    value={buyerIdInput}
                    onChange={e => setBuyerIdInput(e.target.value)}
                    placeholder="Buyer Player ID..."
                    className="flex-1 bg-background border border-border px-3 py-2 text-sm outline-none focus:border-secondary"
                  />
                  <button
                    onClick={sendTradeRequest}
                    disabled={isSending}
                    className="px-6 py-2 bg-secondary/20 border border-secondary text-secondary uppercase tracking-widest text-xs hover:bg-secondary hover:text-background transition-colors disabled:opacity-40"
                  >
                    {isSending ? "..." : "Send"}
                  </button>
                </div>
                {sendError && <p className="text-primary text-xs uppercase">{sendError}</p>}
              </div>
            )}
          </>
        )}
      </div>
    );
  }

  // ── RENDER: BUYER Screen ──
  return (
    <div className="w-full max-w-lg mx-auto space-y-6 font-mono">
      <div className="text-center space-y-1">
        <span className="text-[10px] text-textMuted uppercase tracking-widest">Your Role</span>
        <h2 className="text-3xl font-serif uppercase tracking-widest text-amber-400">Buyer</h2>
        <p className="text-xs text-textMuted">You cannot see what you are buying until the round ends.</p>
      </div>

      {incomingTrades.length === 0 ? (
        <div className="border border-border bg-surface p-8 text-center space-y-3">
          <div className="w-6 h-6 border border-textMuted border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-textMuted uppercase tracking-widest text-xs">Waiting for a seller to approach you...</p>
        </div>
      ) : (
        <div className="space-y-4">
          {incomingTrades.map(trade => (
            <motion.div
              key={trade.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="border border-secondary bg-secondary/5 p-6 space-y-4"
            >
              <p className="text-xs text-textMuted uppercase tracking-widest">Trade Offer Received</p>
              <p className="text-secondary font-bold uppercase tracking-widest">A seller wants to trade with you.</p>
              <p className="text-[10px] text-textMuted">(You will not know what they are selling until the round ends.)</p>
              <div className="flex gap-3">
                <button
                  onClick={() => respondToTrade(trade.id, true)}
                  className="flex-1 py-3 bg-green-900/30 border border-green-500 text-green-400 uppercase tracking-widest text-xs font-bold hover:bg-green-500 hover:text-black transition-colors"
                >
                  Accept
                </button>
                <button
                  onClick={() => respondToTrade(trade.id, false)}
                  className="flex-1 py-3 bg-primary/10 border border-primary text-primary uppercase tracking-widest text-xs font-bold hover:bg-primary hover:text-white transition-colors"
                >
                  Decline
                </button>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
