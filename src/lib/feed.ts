import { useEffect, useState } from "react";
import type { FeedHistory, FeedLatest } from "../../shared/schema";

type State<T> = { status: "loading" } | { status: "error"; error: string } | { status: "ready"; data: T };

function useJson<T>(file: string, validate: (d: any) => d is T): State<T> {
  const [state, setState] = useState<State<T>>({ status: "loading" });
  useEffect(() => {
    let alive = true;
    fetch(`${import.meta.env.BASE_URL}feed/${file}`, { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const d = await r.json();
        if (!validate(d)) throw new Error("Unexpected feed format");
        if (alive) setState({ status: "ready", data: d });
      })
      .catch((e) => alive && setState({ status: "error", error: String(e?.message ?? e) }));
    return () => {
      alive = false;
    };
  }, [file]);
  return state;
}

const isLatest = (d: any): d is FeedLatest => d && d.schemaVersion === 1 && Array.isArray(d.repos);
const isHistory = (d: any): d is FeedHistory => d && d.schemaVersion === 1 && Array.isArray(d.days);

export const useLatest = () => useJson("latest.json", isLatest);
export const useHistory = () => useJson("history.json", isHistory);
