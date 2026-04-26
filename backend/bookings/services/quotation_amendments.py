from decimal import Decimal

from django.db import transaction

from bookings.models import AmendmentItem, Quotation, QuotationAmendment, QuotationItem


def _snapshot_item(item: QuotationItem) -> dict:
    return {
        "id": item.id,
        "line_kind": item.line_kind,
        "source": item.source,
        "service": item.service_id,
        "service_add_on": item.service_add_on_id,
        "description": item.description,
        "quantity": int(item.quantity or 0),
        "unit_price": float(item.unit_price or 0),
        "status": item.status,
    }


def _normalized_row(raw: dict) -> dict:
    return {
        "line_kind": raw.get("line_kind", QuotationItem.LineKind.ITEM),
        "source": raw.get("source"),
        "service": raw.get("service"),
        "service_add_on": raw.get("service_add_on"),
        "description": raw.get("description") or "",
        "quantity": int(raw.get("quantity") or 1),
        "unit_price": float(raw.get("unit_price") or 0),
    }


def create_amendment_request(quotation_id: int, mechanic_id: int, changes: list[dict]) -> QuotationAmendment:
    """
    Create one bundled amendment request from the full staged rows.
    Rules:
    - added => no original row (item_id/original_item are null)
    - edited/removed => map back to an existing QuotationItem id
    """
    with transaction.atomic():
        quotation = (
            Quotation.objects.select_for_update()
            .select_related("booking")
            .get(id=quotation_id)
        )
        existing_pending = quotation.amendments.filter(
            status=QuotationAmendment.Status.PENDING
        ).exists()
        if existing_pending:
            raise ValueError("A pending amendment already exists for this quotation.")

        # Self-heal legacy/stale staged rows left by older flows.
        # New amendment baselines must be built from accepted quotation rows only.
        quotation.items.exclude(status=Quotation.Status.ACCEPTED).delete()

        existing_items = {
            item.id: item
            for item in quotation.items.filter(status=Quotation.Status.ACCEPTED).order_by("id")
        }
        incoming_by_id = {}
        for row in changes or []:
            try:
                row_id = int(row.get("id")) if row.get("id") is not None else None
            except Exception:
                row_id = None
            if row_id is not None:
                incoming_by_id[row_id] = row

        amendment = QuotationAmendment.objects.create(
            quotation=quotation,
            mechanic_id=mechanic_id,
            status=QuotationAmendment.Status.PENDING,
        )

        # Build amendment items with strict ID-first logic:
        # - existing ID + changed fields => edited
        # - existing ID + explicit removed => removed
        # - missing/unknown ID => added
        for row in changes or []:
            declared_change = str((row or {}).get("change_type") or "").lower()
            try:
                row_id = int(row.get("id")) if row.get("id") is not None else None
            except Exception:
                row_id = None
            original = existing_items.get(row_id) if row_id is not None else None

            if original is not None:
                snapshot = _snapshot_item(original)
                if declared_change == AmendmentItem.ActionType.REMOVED:
                    AmendmentItem.objects.create(
                        amendment=amendment,
                        original_item=original,
                        action_type=AmendmentItem.ActionType.REMOVED,
                        proposed_changes={},
                        original_snapshot=snapshot,
                    )
                    continue

                proposed = _normalized_row(row)
                changed = any(
                    str(snapshot.get(key)) != str(proposed.get(key))
                    for key in (
                        "line_kind",
                        "source",
                        "service",
                        "service_add_on",
                        "description",
                        "quantity",
                        "unit_price",
                    )
                )
                if changed:
                    AmendmentItem.objects.create(
                        amendment=amendment,
                        original_item=original,
                        action_type=AmendmentItem.ActionType.EDITED,
                        proposed_changes=proposed,
                        original_snapshot=snapshot,
                    )
                continue

            # No original ID match => treat as added line.
            if declared_change == AmendmentItem.ActionType.REMOVED:
                # Ignore invalid remove markers without original IDs.
                continue
            AmendmentItem.objects.create(
                amendment=amendment,
                action_type=AmendmentItem.ActionType.ADDED,
                proposed_changes=_normalized_row(row),
                original_snapshot={},
            )

        # Also infer removed rows from IDs missing in submitted payload.
        # This handles UI flows where removed accepted rows are omitted from payload.
        incoming_ids = set(incoming_by_id.keys())
        already_removed_ids = set(
            amendment.items.filter(action_type=AmendmentItem.ActionType.REMOVED)
            .exclude(original_item_id=None)
            .values_list("original_item_id", flat=True)
        )
        for existing_id, original in existing_items.items():
            if existing_id in incoming_ids or existing_id in already_removed_ids:
                continue
            AmendmentItem.objects.create(
                amendment=amendment,
                original_item=original,
                action_type=AmendmentItem.ActionType.REMOVED,
                proposed_changes={},
                original_snapshot=_snapshot_item(original),
            )

        if not amendment.items.exists():
            amendment.delete()
            raise ValueError("No staged changes were detected.")

        quotation.status = Quotation.Status.PENDING
        quotation.save(update_fields=["status", "updated_at"])
        return amendment


def resolve_amendment(amendment_id: int, decision: str) -> QuotationAmendment:
    """
    Resolve one amendment bundle.
    - accepted => apply inserts/updates/deletes to QuotationItem
    - rejected => keep QuotationItem untouched
    """
    decision_norm = str(decision or "").strip().lower()
    if decision_norm not in {"accepted", "rejected"}:
        raise ValueError("Decision must be accepted or rejected.")

    with transaction.atomic():
        amendment = (
            QuotationAmendment.objects.select_for_update()
            .select_related("quotation")
            .prefetch_related("items", "quotation__items")
            .get(id=amendment_id)
        )
        if amendment.status != QuotationAmendment.Status.PENDING:
            raise ValueError("Amendment was already resolved.")

        quotation = amendment.quotation
        current_backjob = None
        if getattr(quotation, "is_backjob", False):
            try:
                current_backjob = quotation.booking.backjob
            except Exception:
                current_backjob = None
        if decision_norm == "accepted":
            for change in amendment.items.all().order_by("id"):
                if change.action_type == AmendmentItem.ActionType.ADDED:
                    proposed = change.proposed_changes or {}
                    proposed_line_kind = proposed.get("line_kind") or QuotationItem.LineKind.ITEM
                    proposed_source = proposed.get("source")
                    proposed_service_id = proposed.get("service")
                    proposed_add_on_id = proposed.get("service_add_on")
                    proposed_desc = proposed.get("description") or ""
                    proposed_qty = int(proposed.get("quantity") or 1)
                    proposed_unit = Decimal(str(proposed.get("unit_price") or 0))

                    # Reuse staged pending placeholder row when present to avoid
                    # duplicate rows (pending + accepted) after acceptance.
                    placeholder = (
                        quotation.items.filter(
                            status=Quotation.Status.PENDING,
                            change_type="added",
                            line_kind=proposed_line_kind,
                            source=proposed_source,
                            service_id=proposed_service_id,
                            service_add_on_id=proposed_add_on_id,
                            description=proposed_desc,
                            quantity=proposed_qty,
                            unit_price=proposed_unit,
                        )
                        .order_by("id")
                        .first()
                    )
                    if placeholder is not None:
                        placeholder.status = Quotation.Status.ACCEPTED
                        placeholder.change_type = None
                        placeholder.previous_description = None
                        placeholder.previous_quantity = None
                        placeholder.previous_unit_price = None
                        if getattr(quotation, "is_backjob", False):
                            placeholder.is_backjob_line = True
                            placeholder.backjob = current_backjob
                        placeholder.save(
                            update_fields=[
                                "status",
                                "change_type",
                                "previous_description",
                                "previous_quantity",
                                "previous_unit_price",
                                "is_backjob_line",
                                "backjob",
                                "updated_at",
                            ]
                        )
                    else:
                        QuotationItem.objects.create(
                            quotation=quotation,
                            line_kind=proposed_line_kind,
                            source=proposed_source,
                            service_id=proposed_service_id,
                            service_add_on_id=proposed_add_on_id,
                            description=proposed_desc,
                            quantity=proposed_qty,
                            unit_price=proposed_unit,
                            status=Quotation.Status.ACCEPTED,
                            is_backjob_line=bool(getattr(quotation, "is_backjob", False)),
                            backjob=current_backjob,
                        )
                elif change.action_type == AmendmentItem.ActionType.EDITED and change.original_item_id:
                    proposed = change.proposed_changes or {}
                    QuotationItem.objects.filter(id=change.original_item_id).update(
                        line_kind=proposed.get("line_kind") or QuotationItem.LineKind.ITEM,
                        source=proposed.get("source"),
                        service_id=proposed.get("service"),
                        service_add_on_id=proposed.get("service_add_on"),
                        description=proposed.get("description") or "",
                        quantity=int(proposed.get("quantity") or 1),
                        unit_price=Decimal(str(proposed.get("unit_price") or 0)),
                        status=Quotation.Status.ACCEPTED,
                        change_type=None,
                        previous_description=None,
                        previous_quantity=None,
                        previous_unit_price=None,
                    )
                elif change.action_type == AmendmentItem.ActionType.REMOVED:
                    target_id = change.original_item_id
                    if target_id is None:
                        try:
                            target_id = int((change.original_snapshot or {}).get("id"))
                        except Exception:
                            target_id = None
                    if target_id is not None:
                        QuotationItem.objects.filter(id=target_id).delete()

            amendment.status = QuotationAmendment.Status.ACCEPTED
            quotation.status = Quotation.Status.ACCEPTED

            # Safety cleanup: accepted state must not keep staged pending/rejected rows.
            quotation.items.filter(
                status__in=[Quotation.Status.PENDING, Quotation.Status.REJECTED]
            ).delete()
        else:
            for change in amendment.items.all().order_by("id"):
                action = str(change.action_type or "").lower()
                proposed = change.proposed_changes or {}
                original = change.original_snapshot or {}

                if action == AmendmentItem.ActionType.ADDED:
                    # Rejecting an added proposal should remove staged pending placeholders.
                    QuotationItem.objects.filter(
                        quotation=quotation,
                        status=Quotation.Status.PENDING,
                        change_type="added",
                        line_kind=proposed.get("line_kind") or QuotationItem.LineKind.ITEM,
                        source=proposed.get("source"),
                        service_id=proposed.get("service"),
                        service_add_on_id=proposed.get("service_add_on"),
                        description=proposed.get("description") or "",
                        quantity=int(proposed.get("quantity") or 1),
                        unit_price=Decimal(str(proposed.get("unit_price") or 0)),
                    ).delete()
                    continue

                target_id = change.original_item_id
                if target_id is None:
                    try:
                        target_id = int(original.get("id"))
                    except Exception:
                        target_id = None
                if target_id is None:
                    continue

                if action == AmendmentItem.ActionType.EDITED:
                    # Restore edited row back to original accepted snapshot.
                    QuotationItem.objects.filter(id=target_id).update(
                        line_kind=original.get("line_kind") or QuotationItem.LineKind.ITEM,
                        source=original.get("source"),
                        service_id=original.get("service"),
                        service_add_on_id=original.get("service_add_on"),
                        description=original.get("description") or "",
                        quantity=int(original.get("quantity") or 1),
                        unit_price=Decimal(str(original.get("unit_price") or 0)),
                        status=Quotation.Status.ACCEPTED,
                        change_type=None,
                        previous_description=None,
                        previous_quantity=None,
                        previous_unit_price=None,
                    )
                elif action == AmendmentItem.ActionType.REMOVED:
                    # Restore removed row marker back to accepted.
                    QuotationItem.objects.filter(id=target_id).update(
                        status=Quotation.Status.ACCEPTED,
                        change_type=None,
                        previous_description=None,
                        previous_quantity=None,
                        previous_unit_price=None,
                    )

            amendment.status = QuotationAmendment.Status.REJECTED
            quotation.status = Quotation.Status.REJECTED

        amendment.save(update_fields=["status"])
        quotation.recalculate_totals()
        quotation.save(
            update_fields=[
                "status",
                "original_labor_cost",
                "backjob_discount",
                "final_labor_total",
                "total_amount",
                "updated_at",
            ]
        )
        return amendment
