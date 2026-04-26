"""Helpers for direct requests that can include multiple services (mechanic flow)."""

from .models import DirectRequestServiceLine


def iter_direct_request_services(req) -> list:
    """Ordered Service rows for this Request (Request model instance)."""
    if req is None:
        return []
    rel = getattr(req, "direct_request_service_lines", None)
    if rel is not None:
        try:
            cached = list(rel.all())
        except Exception:
            cached = []
        if cached:
            cached.sort(key=lambda ln: (ln.sort_order, ln.id))
            out = []
            for line in cached:
                svc = getattr(line, "service", None)
                if svc is not None:
                    out.append(svc)
            if out:
                return out
    lines = (
        DirectRequestServiceLine.objects.filter(request=req)
        .select_related("service")
        .order_by("sort_order", "id")
    )
    if lines.exists():
        return [line.service for line in lines]
    dr = getattr(req, "directrequest", None)
    if dr and dr.service_id:
        return [dr.service]
    return []


def direct_request_service_ids(req) -> set[int]:
    return {s.id for s in iter_direct_request_services(req)}
