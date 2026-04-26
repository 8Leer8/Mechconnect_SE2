from decimal import Decimal

from django.db import transaction

from bookings.models import AmendmentItem, Quotation, QuotationAmendment, QuotationItem
from bookings.backjob_utils import get_booking_backjob
from services.models import Service


def _normalized_line_kind(line_kind, service_id=None) -> str:
    value = str(line_kind or QuotationItem.LineKind.ITEM).lower()
    if value == QuotationItem.LineKind.SERVICE and not service_id:
        return QuotationItem.LineKind.ITEM
    if value not in (QuotationItem.LineKind.SERVICE, QuotationItem.LineKind.ITEM):
        return QuotationItem.LineKind.ITEM
    return value


def _snapshot_item(item: QuotationItem) -> dict:
    return {
        "id": item.id,
        "line_kind": _normalized_line_kind(item.line_kind, item.service_id),
        "source": item.source,
        "service": item.service_id,
        "service_add_on": item.service_add_on_id,
        "description": item.description,
        "quantity": int(item.quantity or 0),
        "unit_price": float(item.unit_price or 0),
        "status": item.status,
    }


def _normalized_row(raw: dict) -> dict:
    service_id = raw.get("service")
    line_kind = _normalized_line_kind(raw.get("line_kind", QuotationItem.LineKind.ITEM), service_id)
    return {
        "line_kind": line_kind,
        "source": raw.get("source"),
        "service": service_id,
        "service_add_on": raw.get("service_add_on"),
        "description": raw.get("description") or "",
        "quantity": int(raw.get("quantity") or 1),
        "unit_price": float(raw.get("unit_price") or 0),
    }


def _assoc_key(row: dict) -> str | None:
    service_id = row.get("service")
    add_on_id = row.get("service_add_on")
    if service_id:
        return f"service:{service_id}"
    if add_on_id:
        return f"addon:{add_on_id}"
    return None


def _requested_service_ids(quotation: Quotation) -> set[int]:
    booking = getattr(quotation, "booking", None)
    request_obj = getattr(booking, "request", None)
    service_ids: set[int] = set()
    if request_obj is None:
        return service_ids

    try:
        from ..direct_request_utils import direct_request_service_ids

        service_ids.update(direct_request_service_ids(request_obj))
    except Exception:
        pass

    try:
        broadcast = getattr(request_obj, "broadcast_request", None)
        if broadcast:
            service_ids.update(int(sid) for sid in broadcast.services.values_list("id", flat=True))
    except Exception:
        pass

    return service_ids


def _is_booked_service_row(quotation: Quotation, row: dict | QuotationItem | None) -> bool:
    """Booked service rows are the original job scope and should not become removal amendments."""
    if row is None:
        return False
    try:
        line_kind = getattr(row, "line_kind", None) if not isinstance(row, dict) else row.get("line_kind")
        service_id = getattr(row, "service_id", None) if not isinstance(row, dict) else row.get("service")
        if str(line_kind or "").lower() != QuotationItem.LineKind.SERVICE:
            return False
        service_id = int(service_id or 0)
        return service_id in _requested_service_ids(quotation)
    except Exception:
        return False


def _ensure_booked_service_baselines(quotation: Quotation, changes: list[dict]) -> None:
    """Persist booked services as accepted baseline rows so they are not treated as added amendments."""
    requested_ids = _requested_service_ids(quotation)
    if not requested_ids:
        return

    incoming_service_ids = set()
    for row in changes or []:
        try:
            service_id = int(row.get("service")) if row.get("service") is not None else None
        except Exception:
            service_id = None
        if service_id in requested_ids:
            incoming_service_ids.add(service_id)

    if not incoming_service_ids:
        return

    existing_service_ids = set(
        quotation.items.filter(service_id__in=incoming_service_ids)
        .values_list("service_id", flat=True)
    )

    for service in Service.objects.filter(id__in=incoming_service_ids - existing_service_ids):
        QuotationItem.objects.create(
            quotation=quotation,
            line_kind=QuotationItem.LineKind.SERVICE,
            service=service,
            description=service.name or "Service",
            quantity=1,
            unit_price=service.minimum_price or 0,
            status=Quotation.Status.ACCEPTED,
        )


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
        # A shop owner and the lead shop mechanic share the same quotation.
        # Saving while a request is still pending should revise that pending request,
        # not create a second competing request or crash the editor.
        quotation.amendments.filter(status=QuotationAmendment.Status.PENDING).delete()

        # Self-heal legacy/stale staged rows left by older flows.
        # New amendment baselines must be built from accepted quotation rows only.
        quotation.items.exclude(status=Quotation.Status.ACCEPTED).delete()
        _ensure_booked_service_baselines(quotation, changes or [])
        quotation.recalculate_totals()

        existing_items = {
            item.id: item
            for item in quotation.items.filter(status=Quotation.Status.ACCEPTED).order_by("id")
        }
        existing_by_assoc = {
            key: item
            for item in existing_items.values()
            for key in [_assoc_key(_snapshot_item(item))]
            if key
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
            if original is None:
                original = existing_by_assoc.get(_assoc_key(row or {}))

            if original is not None:
                snapshot = _snapshot_item(original)
                if declared_change == AmendmentItem.ActionType.REMOVED:
                    if _is_booked_service_row(quotation, original):
                        continue
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
            if _is_booked_service_row(quotation, original):
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
        quotation.save(update_fields=["status", "total_amount", "original_labor_cost", "backjob_discount", "final_labor_total", "updated_at"])
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
            current_backjob = get_booking_backjob(getattr(quotation, "booking", None))
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
                    if _is_booked_service_row(quotation, change.original_snapshot or change.original_item):
                        continue
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
