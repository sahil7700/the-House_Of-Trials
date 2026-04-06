import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebase";
import { collection, getDocs, query, where } from "firebase/firestore";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const slotNumber = searchParams.get("slotNumber");

    if (!slotNumber) {
      return NextResponse.json({ error: "slotNumber is required" }, { status: 400 });
    }

    const pairsSnap = await getDocs(
      query(collection(db, "sequencePairs"), where("slotNumber", "==", Number(slotNumber)))
    );

    const pairs = pairsSnap.docs.map(d => ({ pairId: d.id, ...d.data() }));

    return NextResponse.json({ pairs });
  } catch (error: any) {
    console.error("Get pairs error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
