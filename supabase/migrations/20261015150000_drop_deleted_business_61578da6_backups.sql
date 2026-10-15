-- DO NOT RUN THIS YET. Only run it once you are fully confident the deletion of business
-- 61578da6-ac38-4f49-8618-11e4ea54fe8c (20261015130000) is final and you will never need to restore
-- it. This permanently removes the backup tables that deletion created — after this runs, the
-- restore script in that file no longer has anything to read from.
--
-- Arabic summary / ملخص بالعربي:
-- لا تُشغّل هذا الملف الآن. شغّله فقط بعد أن تتأكد تمامًا أن حذف المنشأة نهائي ولن تحتاج التراجع عنه.
-- يحذف هذا الملف الجداول المؤقتة التي تحتوي النسخة الاحتياطية بشكل دائم.

drop table if exists
  public._deleted_biz_61578da6,
  public._deleted_biz_links_61578da6,
  public._deleted_biz_branches_61578da6,
  public._deleted_biz_menu_items_61578da6,
  public._deleted_biz_owners_61578da6,
  public._deleted_biz_billing_61578da6,
  public._deleted_biz_subscriptions_61578da6,
  public._deleted_biz_favorites_61578da6,
  public._deleted_biz_analytics_event_ids_61578da6;
