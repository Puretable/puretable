import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Lock } from "lucide-react";
import { BranchEditor } from "@/components/admin/BranchEditor";
import { LinksEditor } from "@/components/admin/LinksEditor";
import { BusinessInfoForm } from "./BusinessInfoForm";
import { MenuManager } from "./MenuManager";
import { PhotosManager } from "./PhotosManager";
import {
  deleteMenuItemFn,
  deleteOwnerBranchFn,
  deleteOwnerLinkFn,
  getOwnerBusiness,
  saveMenuItemFn,
  saveOwnerBranchFn,
  saveOwnerBusiness,
  saveOwnerLinkFn,
  saveOwnerPhotosFn,
  signBusinessUpload,
} from "@/lib/owner-manage.functions";
import type {
  MenuItemInput,
  OwnerBranchInput,
  OwnerBusinessInput,
  OwnerLinkInput,
} from "@/lib/owner-manage.schemas";
import { friendlyPortalError, type OwnerBusiness } from "@/lib/owner-portal";

export type ManageTab = "info" | "branches" | "photos" | "links" | "menu";

/** Turns a server error into the short Arabic message the shared editors display. */
async function friendly<T>(work: Promise<T>): Promise<T> {
  try {
    return await work;
  } catch (e) {
    throw new Error(friendlyPortalError(e));
  }
}

/**
 * Everything an owner can edit, one tab at a time. The server re-checks ownership and suspension on
 * every call; the read-only state here is only a courtesy so the owner is never offered a button
 * that would be refused.
 */
export function OwnerWorkspace({ overview, tab }: { overview: OwnerBusiness; tab: ManageTab }) {
  const qc = useQueryClient();
  const businessId = overview.id;
  const suspended = overview.access_suspended;

  const load = useServerFn(getOwnerBusiness);
  const saveInfo = useServerFn(saveOwnerBusiness);
  const savePhotos = useServerFn(saveOwnerPhotosFn);
  const saveBranch = useServerFn(saveOwnerBranchFn);
  const removeBranch = useServerFn(deleteOwnerBranchFn);
  const saveLink = useServerFn(saveOwnerLinkFn);
  const removeLink = useServerFn(deleteOwnerLinkFn);
  const saveItem = useServerFn(saveMenuItemFn);
  const removeItem = useServerFn(deleteMenuItemFn);
  const sign = useServerFn(signBusinessUpload);

  const business = useQuery({
    queryKey: ["owner-business", businessId],
    queryFn: () => load({ data: { businessId } }),
  });

  const refresh = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["owner-business", businessId] }),
      qc.invalidateQueries({ queryKey: ["owner-overview"] }),
      qc.invalidateQueries({ queryKey: ["businesses"] }),
      qc.invalidateQueries({ queryKey: ["business"] }),
    ]);
  };

  if (business.isLoading)
    return (
      <p role="status" className="py-8 text-center">
        جارٍ تحميل بيانات عملك…
      </p>
    );
  if (business.isError || !business.data)
    return (
      <div role="alert" className="py-8 text-center">
        <p>{friendlyPortalError(business.error)}</p>
        <button onClick={() => void business.refetch()} className="mt-3 underline">
          إعادة المحاولة
        </button>
      </div>
    );

  const row = business.data;
  const branches = [...row.business_branches].sort(
    (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0),
  );
  const menu = [...row.business_menu_items].sort((a, b) => a.sort_order - b.sort_order);

  return (
    <div className="space-y-5">
      {suspended && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-2xl border border-destructive/40 bg-destructive/5 p-4 text-sm"
        >
          <Lock className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
          <div>
            <p className="font-medium text-destructive">تم تعليق الوصول من قبل الإدارة</p>
            <p className="mt-1 text-muted-foreground">
              يمكنك الاطلاع على بياناتك فقط.{" "}
              {overview.suspension_reason ? `السبب: ${overview.suspension_reason}. ` : ""}
              تواصل معنا لإعادة التفعيل.
            </p>
          </div>
        </div>
      )}

      {tab === "info" && (
        <BusinessInfoForm
          // Stable key: the form keeps its own state (and its "saved" message) across a save.
          key={row.id}
          business={row}
          disabled={suspended}
          save={async (input: OwnerBusinessInput) => {
            await friendly(saveInfo({ data: { businessId, business: input } }));
            await refresh();
          }}
        />
      )}

      {tab === "branches" && (
        <section className="space-y-3">
          <h2 className="text-xl font-semibold">الفروع</h2>
          {suspended ? (
            <ul className="space-y-2">
              {branches.map((b) => (
                <li key={b.id} className="rounded-xl border p-3 text-sm">
                  {b.name_ar || b.name}
                </li>
              ))}
            </ul>
          ) : (
            <BranchEditor
              businessId={businessId}
              city={row.city}
              existing={branches}
              plan={overview.plan}
              onSave={async (branch) => {
                await friendly(saveBranch({ data: branch as OwnerBranchInput }));
                await refresh();
              }}
              onDelete={async (id) => {
                await friendly(removeBranch({ data: { businessId, id } }));
                await refresh();
              }}
            />
          )}
        </section>
      )}

      {tab === "photos" && (
        <PhotosManager
          key={`${row.cover_url}:${row.photos.join("|")}`}
          cover={row.cover_url}
          gallery={row.photos}
          limit={overview.entitlements.photo_limit}
          disabled={suspended}
          sign={(filename) => friendly(sign({ data: { businessId, filename } }))}
          save={async (photos) => {
            await friendly(savePhotos({ data: { businessId, photos } }));
            await refresh();
          }}
        />
      )}

      {tab === "links" && (
        <section className="space-y-3">
          <h2 className="text-xl font-semibold">روابط الطلب والتواصل</h2>
          <p className="text-sm text-muted-foreground">
            روابط التوصيل والحجز والتواصل التي تظهر كأزرار على صفحتك.
          </p>
          {!overview.entitlements.show_links && (
            <p className="rounded-xl border border-dashed p-3 text-sm">
              باقتك الحالية لا تُظهر هذه الروابط للزوار. يمكنك تجهيزها الآن وستظهر عند الترقية إلى
              Pro أو Premium.
            </p>
          )}
          {suspended ? (
            <ul className="space-y-2">
              {row.business_links.map((l) => (
                <li key={l.id} dir="ltr" className="rounded-xl border p-3 text-start text-xs">
                  {l.platform} — {l.url}
                </li>
              ))}
            </ul>
          ) : (
            <LinksEditor
              businessId={businessId}
              links={row.business_links}
              branches={branches}
              onSave={async (link: OwnerLinkInput) => {
                await friendly(saveLink({ data: link }));
                await refresh();
              }}
              onDelete={async (id: string) => {
                await friendly(removeLink({ data: { businessId, id } }));
                await refresh();
              }}
            />
          )}
        </section>
      )}

      {tab === "menu" && (
        <MenuManager
          businessId={businessId}
          items={menu}
          disabled={suspended}
          save={async (input: MenuItemInput) => {
            await saveItem({ data: input });
            await refresh();
          }}
          remove={async (id) => {
            await removeItem({ data: { businessId, id } });
            await refresh();
          }}
          sign={(filename) => friendly(sign({ data: { businessId, filename } }))}
        />
      )}
    </div>
  );
}
