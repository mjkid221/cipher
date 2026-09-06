"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

import { FlowsWindow } from "~/components/flows-window";
import { MarketWindow } from "~/components/market/market-window";
import type { MarketSection } from "~/components/market/sections";
import { NewsWindow } from "~/components/news-window";

/**
 * Window state, shared across pages.
 *
 * The header lives on both the screen and the chain detail pages, and the
 * window it opens should survive moving between them — a panel that closed
 * itself every time you clicked a chain would be worse than useless.
 */

type WindowState = "closed" | "open" | "minimized";

interface WindowsApi {
  flows: WindowState;
  toggleFlows: () => void;
  news: WindowState;
  toggleNews: () => void;
  market: WindowState;
  toggleMarket: () => void;
  /** Open (or restore) the Market window scrolled to one section. */
  openMarket: (section: MarketSection) => void;
}

const WindowsContext = createContext<WindowsApi | null>(null);

export function useWindows(): WindowsApi {
  const context = useContext(WindowsContext);
  if (!context) {
    throw new Error("useWindows must be used inside <WindowsProvider>");
  }
  return context;
}

export function WindowsProvider({ children }: { children: React.ReactNode }) {
  const [flows, setFlows] = useState<WindowState>("closed");
  const [news, setNews] = useState<WindowState>("closed");
  const [market, setMarket] = useState<WindowState>("closed");
  const [marketSection, setMarketSection] = useState<MarketSection | null>(
    null,
  );
  // Incremented on every request so asking for the same section twice still
  // scrolls; a plain section value would not change and the effect not fire.
  const [marketRequest, setMarketRequest] = useState(0);

  // From the header each button is a toggle: closed opens it, minimised
  // restores it, and open puts it away again.
  const toggleFlows = useCallback(() => {
    setFlows((current) => (current === "open" ? "closed" : "open"));
  }, []);

  const toggleNews = useCallback(() => {
    setNews((current) => (current === "open" ? "closed" : "open"));
  }, []);

  const toggleMarket = useCallback(() => {
    setMarket((current) => (current === "open" ? "closed" : "open"));
  }, []);

  const openMarket = useCallback((section: MarketSection) => {
    setMarketSection(section);
    setMarketRequest((n) => n + 1);
    setMarket("open");
  }, []);

  const value = useMemo(
    () => ({
      flows,
      toggleFlows,
      news,
      toggleNews,
      market,
      toggleMarket,
      openMarket,
    }),
    [flows, toggleFlows, news, toggleNews, market, toggleMarket, openMarket],
  );

  return (
    <WindowsContext.Provider value={value}>
      {children}
      <FlowsWindow
        open={flows !== "closed"}
        minimized={flows === "minimized"}
        onMinimize={() => setFlows("minimized")}
        onRestore={() => setFlows("open")}
        onClose={() => setFlows("closed")}
      />
      <NewsWindow
        open={news !== "closed"}
        minimized={news === "minimized"}
        onMinimize={() => setNews("minimized")}
        onRestore={() => setNews("open")}
        onClose={() => setNews("closed")}
      />
      <MarketWindow
        open={market !== "closed"}
        minimized={market === "minimized"}
        onMinimize={() => setMarket("minimized")}
        onRestore={() => setMarket("open")}
        onClose={() => setMarket("closed")}
        section={marketSection}
        request={marketRequest}
      />
    </WindowsContext.Provider>
  );
}
