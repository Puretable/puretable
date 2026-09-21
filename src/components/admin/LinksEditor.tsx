import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";

/** Platforms an order / contact button can point to. */
export const PLATFORMS = [
  "hungerstation",
  "jahez",
  "thechefz",
  "toyou",
  "keeta",
  "requeue",
  "mytable",
  "website",
  "instagram",
  "x",
  "tiktok",
  "snapchat",
  "facebook",
  "whatsapp",
  "email",
  "maps",
  "phone",
] as const;

export type LinkRow = {
  id: string;
  platform: string;
  url: string;
  product_name?: string | null;
  branch_id?: string | null;
};
type LinkDraft = {
  platform: (typeof PLATFORMS)[number];
  url: string;
  label: string;
  product_name: string;
  branch_id: string;
};
export type LinkPayload = Omit<LinkDraft, "branch_id"> & {
  business_id: string;
  branch_id: string | null;
  sort_order: number;
};

/**
 * Order and contact buttons for a business. Used by the admin business page and the owner portal;
 * the caller decides how a save or delete is performed.
 */
export function LinksEditor({
  businessId,
  links,
  branches = [],
  onSave,
  onDelete,
}: {
  businessId: string;
  links: LinkRow[];
  branches?: { id: string; name: string }[];
  onSave: (row: LinkPayload) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const EMPTY: LinkDraft = {
    platform: "hungerstation",
    url: "",
    label: "",
    product_name: "",
    branch_id: "",
  };
  const [draft, setDraft] = useState<LinkDraft>(EMPTY);
  const [error, setError] = useState("");
  async function add() {
    if (!draft.url) return;
    setError("");
    try {
      await onSave({
        business_id: businessId,
        ...draft,
        branch_id: draft.branch_id || null,
        sort_order: links.length,
      });
      setDraft(EMPTY);
    } catch (e) {
      // Keep what was typed so it can be corrected.
      setError(e instanceof Error ? e.message : "تعذر الحفظ");
    }
  }
  async function remove(id: string) {
    setError("");
    try {
      await onDelete(id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذر الحذف");
    }
  }
  const branchName = (id: string | null) => branches.find((b) => b.id === id)?.name ?? null;
  return (
    <div className="space-y-4">
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
      <div className="space-y-2">
        {links.map((l) => (
          <div
            key={l.id}
            className="grid gap-2 rounded-xl border border-border p-3 sm:grid-cols-[120px_1fr_1fr_auto]"
          >
            <span className="text-xs font-semibold capitalize text-primary">{l.platform}</span>
            <span className="truncate text-xs">
              {l.product_name || <span className="text-muted-foreground">(no product name)</span>}
              {l.branch_id && (
                <span className="ms-1 rounded-full bg-secondary px-2 py-0.5 text-[10px] text-muted-foreground">
                  {branchName(l.branch_id) ?? "فرع"}
                </span>
              )}
            </span>
            <a
              href={l.url}
              target="_blank"
              rel="noreferrer"
              className="truncate text-xs text-muted-foreground hover:text-primary"
            >
              {l.url}
            </a>
            <button
              onClick={() => void remove(l.id)}
              className="justify-self-end text-xs text-destructive"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
      <div className="grid gap-2 rounded-xl border border-dashed border-border p-3 sm:grid-cols-[140px_1fr_1fr_auto]">
        <select
          value={draft.platform}
          onChange={(e) =>
            setDraft({ ...draft, platform: e.target.value as LinkDraft["platform"] })
          }
          className="rounded-lg border border-border bg-background px-2 py-1.5 text-xs"
        >
          {PLATFORMS.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <input
          placeholder="Product name (optional)"
          value={draft.product_name}
          onChange={(e) => setDraft({ ...draft, product_name: e.target.value })}
          className="rounded-lg border border-border bg-background px-2 py-1.5 text-xs"
        />
        <input
          placeholder="https://…"
          value={draft.url}
          onChange={(e) => setDraft({ ...draft, url: e.target.value })}
          className="rounded-lg border border-border bg-background px-2 py-1.5 text-xs"
        />
        <button
          type="button"
          onClick={add}
          className="inline-flex items-center gap-1 rounded-full bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground"
        >
          <Plus className="h-3 w-3" /> Add
        </button>
        {branches.length > 0 && (
          <select
            value={draft.branch_id}
            onChange={(e) => setDraft({ ...draft, branch_id: e.target.value })}
            className="rounded-lg border border-border bg-background px-2 py-1.5 text-xs sm:col-span-2"
          >
            <option value="">كل الفروع / whole business</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        )}
      </div>
    </div>
  );
}
