"use client";

import { Command } from "cmdk";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { ChainAvatar, TierBadge } from "~/components/ui/primitives";
import { formatSigned, formatUsd } from "~/lib/format";
import { divergingHue } from "~/lib/palette";
import type { ChainSnapshot } from "~/server/domain/types";

/**
 * Registers the ⌘K / Ctrl-K shortcut. Kept separate from the dialog so the
 * dialog — which opens a portal into `document.body` and therefore has no
 * server-rendered counterpart — mounts only after the user asks for it.
 */
export function useCommandShortcut(toggle: () => void) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        toggle();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [toggle]);
}

export function CommandPalette({
  chains,
  open,
  onOpenChange,
}: {
  chains: readonly ChainSnapshot[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();

  return (
    <Command.Dialog
      open={open}
      onOpenChange={onOpenChange}
      label="Find a chain"
      className="fixed inset-0 z-50"
    >
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={() => onOpenChange(false)}
      />
      <div className="panel absolute top-[16vh] left-1/2 w-[min(560px,calc(100vw-2rem))] -translate-x-1/2 overflow-hidden shadow-2xl shadow-black/60">
        <Command.Input
          placeholder="Search chains by name or ticker…"
          className="border-hairline placeholder:text-ink-faint w-full border-b bg-transparent px-4 py-3.5 text-[14px] outline-none"
        />
        <Command.List className="scroll-slim max-h-[52vh] overflow-y-auto p-2">
          <Command.Empty className="text-ink-muted px-3 py-8 text-center text-[13px]">
            No chain by that name in the current universe.
          </Command.Empty>

          {chains.map((chain) => (
            <Command.Item
              key={chain.slug}
              value={`${chain.name} ${chain.symbol ?? ""}`}
              onSelect={() => {
                router.push(`/chain/${chain.slug}`);
                onOpenChange(false);
              }}
              className="data-[selected=true]:bg-raised flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2"
            >
              <ChainAvatar
                name={chain.name}
                logoUrl={chain.logoUrl}
                brandColor={chain.brandColor}
                size={24}
              />
              <span className="text-[13px] font-medium">{chain.name}</span>
              {chain.symbol && (
                <span className="text-ink-faint text-[10.5px] tracking-wide uppercase">
                  {chain.symbol}
                </span>
              )}
              <TierBadge tier={chain.tier} compact />
              <span className="ml-auto flex items-center gap-3">
                <span className="tnum text-ink-muted text-[11.5px]">
                  {formatUsd(chain.metrics.marketCap)}
                </span>
                <span
                  className="tnum w-9 text-right text-[12.5px] font-medium"
                  style={{ color: divergingHue(chain.scores.mispricing) }}
                >
                  {formatSigned(chain.scores.mispricing)}
                </span>
              </span>
            </Command.Item>
          ))}
        </Command.List>
      </div>
    </Command.Dialog>
  );
}
