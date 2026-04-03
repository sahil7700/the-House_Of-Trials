import { db, auth } from "@/lib/firebase";
import { doc, setDoc, getDoc, serverTimestamp, collection, query, where, getDocs } from "firebase/firestore";
import { signInAnonymously } from "firebase/auth";

export interface PlayerData {
  id: string; // auth uid
  playerId: string; // #0147 format
  name: string;
  college: string;
  phone: string;
  status: "waiting" | "alive" | "eliminated" | "winner";
  joinedAt: any;
  currentSubmission: number | null;
  submittedAt: any | null;
}

export const registerPlayer = async (name: string, college: string, phone: string) => {
  // 1. Ensure signed in anonymously
  if (!auth.currentUser) {
    await signInAnonymously(auth);
  }
  const uid = auth.currentUser!.uid;

  // 2. Check if already registered
  const docRef = doc(db, "players", uid);
  const docSnap = await getDoc(docRef);
  if (docSnap.exists()) {
    return docSnap.data() as PlayerData;
  }

  // 3. Generate unique 4 digit ID (rough uniqueness check can be skipped for prototype)
  // To avoid duplicates, we will just generate and hope no collisions, or do a tiny loop
  let playerId = "";
  let isUnique = false;
  while (!isUnique) {
    const num = Math.floor(1000 + Math.random() * 9000);
    playerId = `#${num}`;
    const q = query(collection(db, "players"), where("playerId", "==", playerId));
    const querySnapshot = await getDocs(q);
    if (querySnapshot.empty) {
      isUnique = true;
    }
  }

  const playerData: PlayerData = {
    id: uid,
    playerId,
    name,
    college,
    phone,
    status: "waiting",
    joinedAt: serverTimestamp(),
    currentSubmission: null,
    submittedAt: null,
  };

  await setDoc(docRef, playerData);
  
  // Cache the ID locally just in case
  if (typeof window !== "undefined") {
    localStorage.setItem("house_of_trials_player_id", uid);
  }

  return playerData;
};

export const getPlayer = async (uid: string): Promise<PlayerData | null> => {
  const docRef = doc(db, "players", uid);
  const docSnap = await getDoc(docRef);
  if (docSnap.exists()) {
    return docSnap.data() as PlayerData;
  }
  return null;
};
