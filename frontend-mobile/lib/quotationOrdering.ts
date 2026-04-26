type ChangeLabel = 'Added' | 'Edited' | 'Removed';

export const buildQuoteSnapshotKeys = (it: any): string[] => {
  const keys: string[] = [];
  if (!it) return keys;

  if (it.id != null) keys.push(`id:${String(it.id)}`);

  const serviceId = Number(it.service);
  const addOnId = Number(it.service_add_on);
  if (Number.isFinite(serviceId) && serviceId > 0) keys.push(`service:${serviceId}`);
  if (Number.isFinite(addOnId) && addOnId > 0) keys.push(`addon:${addOnId}`);

  const desc = String(it.description || '').trim().toLowerCase();
  const qty = Number(it.quantity ?? 1) || 1;
  const unit = Number(it.unit_price ?? it.price ?? 0) || 0;
  keys.push(`row:${desc}|${qty}|${unit.toFixed(2)}`);

  return keys;
};

const isAddedQuotationRow = (
  it: any,
  chatChangeLabelByKey?: Record<string, ChangeLabel>
): boolean => {
  const changeRaw = String(it?.change_type || it?.change || it?.modification_type || '').toLowerCase();
  if (changeRaw.includes('add')) return true;
  if (it?.is_added === true) return true;

  if (chatChangeLabelByKey) {
    const chatDerivedLabel = buildQuoteSnapshotKeys(it).map((k) => chatChangeLabelByKey[k]).find(Boolean) || null;
    if (chatDerivedLabel === 'Added') return true;
  }

  const statusRaw = String(it?.status || it?.quotation_status || it?.state || '').toLowerCase();
  const looksRemoved =
    changeRaw.includes('remove') ||
    changeRaw.includes('delete') ||
    statusRaw === 'rejected' ||
    it?.is_removed === true ||
    it?.is_deleted === true;
  if (looksRemoved) return false;

  const looksEdited =
    changeRaw.includes('edit') ||
    changeRaw.includes('update') ||
    changeRaw.includes('modify') ||
    it?.previous_description != null ||
    it?.previous_quantity != null ||
    it?.previous_unit_price != null ||
    it?.is_edited === true ||
    it?.is_modified === true;
  if (looksEdited) return false;

  return statusRaw === 'pending';
};

export const sortQuotationItemsForDisplay = (
  items: any[],
  serviceItemIds: Set<number>,
  chatChangeLabelByKey?: Record<string, ChangeLabel>
) => {
  if (!Array.isArray(items) || !items.length) return [];

  const withIndex = items.map((it: any, index: number) => ({ ...it, __index: index }));
  const serviceTop: any[] = [];
  const regular: any[] = [];

  withIndex.forEach((it: any) => {
    const sid = Number(it?.service);
    if (Number.isFinite(sid) && sid > 0 && serviceItemIds.has(sid)) {
      serviceTop.push(it);
    } else {
      regular.push(it);
    }
  });

  const getTime = (it: any) => {
    const raw = it?.updated_at || it?.modified_at || it?.created_at || null;
    if (!raw) return 0;
    const t = new Date(raw).getTime();
    return Number.isFinite(t) ? t : 0;
  };

  regular.sort((a: any, b: any) => {
    const ta = getTime(a);
    const tb = getTime(b);
    if (ta !== tb) return ta - tb;

    const ia = Number(a?.id);
    const ib = Number(b?.id);
    if (Number.isFinite(ia) && Number.isFinite(ib) && ia !== ib) return ia - ib;

    return (a.__index || 0) - (b.__index || 0);
  });

  const regularWithoutAdded = regular.filter((it: any) => !isAddedQuotationRow(it, chatChangeLabelByKey));
  const addedRows = regular.filter((it: any) => isAddedQuotationRow(it, chatChangeLabelByKey));

  return [...serviceTop, ...regularWithoutAdded, ...addedRows].map(({ __index, ...rest }: any) => rest);
};
