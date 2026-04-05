import { db } from "@/lib/firebase";
import { doc, setDoc, getDoc, serverTimestamp } from "firebase/firestore";

interface RateLimitEntry {
  count: number;
  firstAttempt: any;
  lastAttempt: any;
}

const RATE_LIMIT_WINDOW_MS = 5000; // 5 seconds between submissions
const MAX_SUBMISSIONS_PER_ROUND = 3; // Max attempts per slot

export async function checkRateLimit(uid: string, slotNumber: number): Promise<{ allowed: boolean; reason?: string }> {
  const key = `${slotNumber}_${uid}`;
  const rateRef = doc(db, "rateLimits", key);
  
  try {
    const snap = await getDoc(rateRef);
    
    if (!snap.exists()) {
      // First submission — allow it
      await setDoc(rateRef, {
        count: 1,
        firstAttempt: serverTimestamp(),
        lastAttempt: serverTimestamp(),
        slotNumber,
        uid,
      });
      return { allowed: true };
    }
    
    const data = snap.data() as RateLimitEntry;
    const now = Date.now();
    const firstAttempt = data.firstAttempt?.toMillis?.() ?? 0;
    const lastAttempt = data.lastAttempt?.toMillis?.() ?? 0;
    
    // If window expired, reset
    if (now - firstAttempt > RATE_LIMIT_WINDOW_MS * MAX_SUBMISSIONS_PER_ROUND) {
      await setDoc(rateRef, {
        count: 1,
        firstAttempt: serverTimestamp(),
        lastAttempt: serverTimestamp(),
        slotNumber,
        uid,
      });
      return { allowed: true };
    }
    
    // Check if within window
    if (now - lastAttempt < RATE_LIMIT_WINDOW_MS) {
      return {
        allowed: false,
        reason: `Please wait before submitting again.`,
      };
    }
    
    // Check max attempts
    if (data.count >= MAX_SUBMISSIONS_PER_ROUND) {
      return {
        allowed: false,
        reason: `Maximum submission attempts reached for this round.`,
      };
    }
    
    // Increment counter
    await setDoc(rateRef, {
      count: data.count + 1,
      firstAttempt: data.firstAttempt,
      lastAttempt: serverTimestamp(),
      slotNumber,
      uid,
    });
    
    return { allowed: true };
  } catch (e) {
    // If rate limit check fails, allow submission (fail open for UX)
    console.warn("Rate limit check failed:", e);
    return { allowed: true };
  }
}

// Idempotency check — prevent duplicate submissions
export async function checkIdempotency(
  uid: string,
  slotNumber: number,
  gameId: string
): Promise<{ duplicate: boolean; existingValue?: any }> {
  const key = `${slotNumber}_${uid}`;
  const idempRef = doc(db, "idempotencyKeys", key);
  
  try {
    const snap = await getDoc(idempRef);
    
    if (snap.exists()) {
      const data = snap.data();
      // Only allow re-submission if the slot/slot has changed
      if (data.gameId === gameId) {
        return { duplicate: true, existingValue: data.value };
      }
    }
    
    return { duplicate: false };
  } catch (e) {
    console.warn("Idempotency check failed:", e);
    return { duplicate: false };
  }
}

// Mark submission as idempotent
export async function setIdempotencyKey(
  uid: string,
  slotNumber: number,
  gameId: string,
  value: any
): Promise<void> {
  const key = `${slotNumber}_${uid}`;
  const idempRef = doc(db, "idempotencyKeys", key);
  
  try {
    await setDoc(idempRef, {
      gameId,
      value,
      submittedAt: serverTimestamp(),
      slotNumber,
    }, { merge: true });
  } catch (e) {
    console.warn("Failed to set idempotency key:", e);
  }
}
