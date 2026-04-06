import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebase";
import { doc, updateDoc, collection, getDocs, query, where } from "firebase/firestore";

export async function POST(req: NextRequest) {
  try {
    const { playerId, slotNumber, confidence } = await req.json();

    if (!playerId || !slotNumber || ![100, 70, 50].includes(confidence)) {
      return NextResponse.json({ error: "Invalid parameters. confidence must be 100, 70, or 50." }, { status: 400 });
    }

    const submissionsSnap = await getDocs(
      query(collection(db, "submissions"), where("playerId", "==", playerId), where("slotNumber", "==", Number(slotNumber)), where("gameId", "==", "B8"))
    );

    if (!submissionsSnap.empty) {
      await updateDoc(doc(db, "submissions", submissionsSnap.docs[0].id), { confidence });
    }

    return NextResponse.json({ success: true, confidence });
  } catch (error: any) {
    console.error("B8 submit confidence error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
