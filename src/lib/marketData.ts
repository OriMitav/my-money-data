import { useQuery } from "@tanstack/react-query";

export interface MarketData {
  boiRate: number;       // ריבית בנק ישראל (%)
  primeRate: number;     // BOI + 1.5
  cpi: number;           // מדד המחירים לצרכן (annual %)
  bondYield: number;     // מדד תשואות האג"ח (%)
  fetchedAt: string;
}

// Mock fetcher — simulates a daily network call. In the future swap with a real
// edge-function call (e.g. BOI / CBS / TASE). Adds tiny daily jitter so the
// number visibly "updates" day to day.
async function fetchMarketData(): Promise<MarketData> {
  // simulate network latency
  await new Promise((r) => setTimeout(r, 200));
  const day = new Date().toISOString().slice(0, 10);
  // deterministic jitter from date string
  const seed = Array.from(day).reduce((s, c) => s + c.charCodeAt(0), 0);
  const j = (m: number) => ((seed % 13) / 100) * m;
  const boi = 4.5 + j(1);
  return {
    boiRate: +boi.toFixed(2),
    primeRate: +(boi + 1.5).toFixed(2),
    cpi: +(2.8 + j(0.4)).toFixed(2),
    bondYield: +(4.1 + j(0.6)).toFixed(2),
    fetchedAt: new Date().toISOString(),
  };
}

export function useMarketData() {
  return useQuery({
    queryKey: ["market-data"],
    queryFn: fetchMarketData,
    staleTime: 1000 * 60 * 60 * 12, // 12h
    refetchOnWindowFocus: false,
  });
}
