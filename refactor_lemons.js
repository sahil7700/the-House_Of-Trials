const fs = require('fs');
const path = require('path');

const adminPath = path.join(__dirname, 'src/app/admin/dashboard/components/GameLemonsAdmin.tsx');
const playerPath = path.join(__dirname, 'src/app/game/components/GameLemons.tsx');

let adminCode = fs.readFileSync(adminPath, 'utf8');

// Replace handle assignment
adminCode = adminCode.replace(/try {\s*const res = await fetch\("\/api\/game\/lemons\/assign-roles"[\s\S]*?body: JSON.stringify\(\{[\s\S]*?\}\),\s*\}\);\s*const data = await res\.json\(\);\s*if \(data\.success\) \{\s*setAssignedData\(data\);\s*onUpdateGameState\(\{ phase: "roles_assigned" \} as any\);\s*\} else \{\s*alert\(data\.error \|\| "Failed to assign roles\."\);\s*\}/,
`try {
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
              onUpdateGameState({ phase: "roles_assigned" } as any);`);

// Start card flash
adminCode = adminCode.replace(/try {\s*const res = await fetch\("\/api\/game\/lemons\/start-card-flash"[\s\S]*?\}\)/,
`try {
              const { writeBatch, doc, serverTimestamp } = await import("firebase/firestore");
              const { db } = await import("@/lib/firebase");
              const batch = writeBatch(db);
              batch.update(doc(db, "system", "gameState"), { phase: "card_flash", cardFlashStartedAt: serverTimestamp() });
              await batch.commit();
              onUpdateGameState?.({ phase: "card_flash", cardFlashStartedAt: new Date() } as any);
            }`);

// Open Trading
adminCode = adminCode.replace(/try {\s*await fetch\("\/api\/game\/lemons\/open-trading"[\s\S]*?\}\)/,
`try {
              const { writeBatch, doc, serverTimestamp } = await import("firebase/firestore");
              const { db } = await import("@/lib/firebase");
              const batch = writeBatch(db);
              batch.update(doc(db, "system", "gameState"), { phase: "trading_open", tradingStartedAt: serverTimestamp() });
              await batch.commit();
              onUpdateGameState?.({ phase: "trading_open", tradingStartedAt: new Date() } as any);
            }`);

// End Trading
adminCode = adminCode.replace(/try {\s*await fetch\("\/api\/game\/lemons\/end-trading"[\s\S]*?\}\)/,
`try {
              const { writeBatch, doc, serverTimestamp } = await import("firebase/firestore");
              const { db } = await import("@/lib/firebase");
              const batch = writeBatch(db);
              
              // Set pending trades to expired
              const pending = trades.filter(t => t.status === "pending");
              pending.forEach(t => batch.update(doc(db, "marketTrades", t.id), { status: "expired", resolvedAt: serverTimestamp() }));
              
              batch.update(doc(db, "system", "gameState"), { phase: "trading_locked" });
              await batch.commit();
              onUpdateGameState?.({ phase: "trading_locked" } as any);
            }`);

// Calculate
adminCode = adminCode.replace(/try {\s*const res = await fetch\("\/api\/game\/lemons\/calculate"[\s\S]*?if \(!data\.success\) \{\s*alert\(data\.error \|\| "Calculation failed\."\);\s*\} else \{\s*onUpdateGameState\?\(\{ results: data\.results \} as any\);\s*\}/,
`try {
              const { writeBatch, doc } = await import("firebase/firestore");
              const { db } = await import("@/lib/firebase");
              
              const winnersPoints = 80; const leadPenalty = 0; const soldPoints = 60; const unsoldPoints = 20;
              const resultsList = [];
              const elims = [];
              
              buyers.forEach(buyerId => {
                 const t = completedTrades.find(tr => tr.buyerId === buyerId);
                 if (t) {
                    const card = players.find(p => p.id === t.sellerId)?.marketCard;
                    if (card === "gold") resultsList.push({ buyerId, sellerId: t.sellerId, cardType: "gold", outcome: "survived", delta: winnersPoints });
                    else { elims.push(buyerId); resultsList.push({ buyerId, sellerId: t.sellerId, cardType: "lead", outcome: "eliminated", delta: leadPenalty }); }
                 } else { elims.push(buyerId); resultsList.push({ buyerId, outcome: "no_trade", delta: 0, cardType: null }); }
              });
              sellers.forEach(sellerId => {
                 const t = completedTrades.find(tr => tr.sellerId === sellerId);
                 if (t) resultsList.push({ sellerId, outcome: "sold", delta: soldPoints });
                 else { elims.push(sellerId); resultsList.push({ sellerId, outcome: "unsold", delta: unsoldPoints }); }
              });
              
              const batch = writeBatch(db);
              batch.update(doc(db, "system", "gameState"), { phase: "reveal", revealStep: 0, pendingEliminations: elims, results: resultsList });
              await batch.commit();
              onUpdateGameState?.({ phase: "reveal", revealStep: 0, pendingEliminations: elims, results: resultsList } as any);`);

// Reveal steps
adminCode = adminCode.replace(/await fetch\("\/api\/game\/lemons\/reveal", \{\s*method: "POST",\s*headers: \{ "Content-Type": "application\/json" \},\s*body: JSON\.stringify\(\{ step: 1 \}\),\s*\}\);/g,
`const { writeBatch, doc } = await import("firebase/firestore"); const { db } = await import("@/lib/firebase"); const batch = writeBatch(db); batch.update(doc(db, "system", "gameState"), { revealStep: 1 }); await batch.commit(); onUpdateGameState?.({ revealStep: 1 } as any);`);

adminCode = adminCode.replace(/await fetch\("\/api\/game\/lemons\/reveal", \{\s*method: "POST",\s*headers: \{ "Content-Type": "application\/json" \},\s*body: JSON\.stringify\(\{ step: 2 \}\),\s*\}\);/g,
`const { writeBatch, doc } = await import("firebase/firestore"); const { db } = await import("@/lib/firebase"); const batch = writeBatch(db); batch.update(doc(db, "system", "gameState"), { revealStep: 2 }); await batch.commit(); onUpdateGameState?.({ revealStep: 2 } as any);`);

adminCode = adminCode.replace(/await fetch\("\/api\/game\/lemons\/reveal", \{\s*method: "POST",\s*headers: \{ "Content-Type": "application\/json" \},\s*body: JSON\.stringify\(\{ step: 3 \}\),\s*\}\);/g,
`const { writeBatch, doc } = await import("firebase/firestore"); const { db } = await import("@/lib/firebase"); const batch = writeBatch(db); batch.update(doc(db, "system", "gameState"), { revealStep: 3 }); await batch.commit(); onUpdateGameState?.({ revealStep: 3 } as any);`);

// Confirm eliminations
adminCode = adminCode.replace(/await fetch\("\/api\/game\/lemons\/confirm-eliminations", \{ method: "POST" \}\);/,
`const { confirmEliminations } = await import("@/lib/services/admin-service");
                await confirmEliminations(pendingEliminations, "adminId");
                const { writeBatch, doc } = await import("firebase/firestore"); const { db } = await import("@/lib/firebase");
                const batch = writeBatch(db);
                results.forEach((r: any) => {
                   if (r.buyerId) batch.update(doc(db, "players", r.buyerId), { pointsDelta: r.delta });
                   else if (r.sellerId) batch.update(doc(db, "players", r.sellerId), { pointsDelta: r.delta });
                });
                batch.update(doc(db, "system", "gameState"), { phase: "confirmed" });
                await batch.commit();
                onUpdateGameState?.({ phase: "confirmed" } as any);`);


fs.writeFileSync(adminPath, adminCode);

// Player code
let playerCode = fs.readFileSync(playerPath, 'utf8');

playerCode = playerCode.replace(/const res = await fetch\("\/api\/game\/lemons\/send-trade-request"[\s\S]*?setPendingTradeId\(data\.tradeId\);\s*\}/,
`const { addDoc, collection, doc, writeBatch, serverTimestamp, query, where, getDocs } = await import("firebase/firestore");
      const { db } = await import("@/lib/firebase");
      
      const expireBatch = writeBatch(db);
      const oldSnap = await getDocs(query(collection(db, "marketTrades"), where("buyerId", "==", playerId), where("status", "==", "pending")));
      oldSnap.docs.forEach(d => expireBatch.update(d.ref, { status: "expired", resolvedAt: serverTimestamp() }));
      await expireBatch.commit();
      
      const tradeRef = await addDoc(collection(db, "marketTrades"), {
        slotNumber: gameState.currentSlot,
        buyerId: playerId, buyerName: "Buyer",
        sellerId: sid, sellerName: "Seller",
        status: "pending", createdAt: serverTimestamp(), resolvedAt: null, cardType: null
      });
      setPendingTradeId(tradeRef.id);`);
      
playerCode = playerCode.replace(/await fetch\("\/api\/game\/lemons\/respond-to-trade"[\s\S]*?\}\)/,
`const { doc, updateDoc, serverTimestamp } = await import("firebase/firestore");
      const { db } = await import("@/lib/firebase");
      
      await updateDoc(doc(db, "marketTrades", tradeId), { status: response, resolvedAt: serverTimestamp() });
      if (response === "accepted") {
        await updateDoc(doc(db, "players", playerId), { marketTradeId: tradeId });
      }`);

fs.writeFileSync(playerPath, playerCode);
console.log("Lemons Modified Successfully.");
