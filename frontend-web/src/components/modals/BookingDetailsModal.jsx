import { ExternalLink, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { API_BASE_URL } from "@/config/env";

function formatDateTime(value) {
  if (!value) {
    return "—";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "—";
  }
  return date.toLocaleString();
}

function formatCurrency(value) {
  if (value === null || value === undefined || value === "") {
    return "—";
  }
  const numberValue = Number(value);
  if (Number.isNaN(numberValue)) {
    return "—";
  }
  return `PHP ${numberValue.toLocaleString()}`;
}

function formatLabel(value) {
  if (!value) {
    return "—";
  }
  return String(value)
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function toMediaUrl(path) {
  if (!path || typeof path !== "string") {
    return "";
  }

  if (/^https?:\/\//i.test(path)) {
    return path;
  }

  try {
    const normalizedPath = path.startsWith("/") ? path : `/${path}`;
    return new URL(normalizedPath, API_BASE_URL).toString();
  } catch {
    return path;
  }
}

function statusVariant(status) {
  if (status === "completed") {
    return "default";
  }
  if (status === "active" || status === "on_the_way" || status === "accepted") {
    return "secondary";
  }
  if (status === "disputed" || status === "cancelled") {
    return "destructive";
  }
  return "outline";
}

function getStatusClass(status) {
  const value = String(status || "").toLowerCase();

  if (value === "accepted") {
    return "border-emerald-500/40 bg-emerald-500/15 text-emerald-300";
  }
  if (value === "on_the_way") {
    return "border-cyan-500/40 bg-cyan-500/15 text-cyan-300";
  }
  if (value === "active") {
    return "border-blue-500/40 bg-blue-500/15 text-blue-300";
  }
  if (value === "paused") {
    return "border-amber-500/40 bg-amber-500/15 text-amber-300";
  }
  if (value === "finished") {
    return "border-indigo-500/40 bg-indigo-500/15 text-indigo-300";
  }
  if (value === "pending_payment") {
    return "border-orange-500/40 bg-orange-500/15 text-orange-300";
  }
  if (value === "completed") {
    return "border-green-500/40 bg-green-500/15 text-green-300";
  }
  if (value === "reworked") {
    return "border-violet-500/40 bg-violet-500/15 text-violet-300";
  }
  if (value === "cancelled" || value === "disputed") {
    return "border-red-500/40 bg-red-500/15 text-red-300";
  }

  return "";
}

function toNumericCoordinate(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function getBroadcastCoordinates(booking) {
  if (!booking) {
    return { latitude: null, longitude: null };
  }

  const detailLatitude = toNumericCoordinate(booking.request_details?.latitude);
  const detailLongitude = toNumericCoordinate(booking.request_details?.longitude);
  if (detailLatitude !== null && detailLongitude !== null) {
    return { latitude: detailLatitude, longitude: detailLongitude };
  }

  const locationLatitude = toNumericCoordinate(booking.service_location?.latitude);
  const locationLongitude = toNumericCoordinate(booking.service_location?.longitude);
  if (locationLatitude !== null && locationLongitude !== null) {
    return { latitude: locationLatitude, longitude: locationLongitude };
  }

  return { latitude: null, longitude: null };
}

function buildMapUrls(latitude, longitude) {
  if (latitude === null || longitude === null) {
    return { embedUrl: "", openUrl: "" };
  }

  const embedUrl = `https://maps.google.com/maps?q=${latitude},${longitude}&z=16&output=embed`;
  const openUrl = `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`;

  return { embedUrl, openUrl };
}

function DetailItem({ label, value }) {
  return (
    <div className="rounded-md border border-border/70 bg-card/60 px-3 py-2.5">
      <p className="text-xs font-semibold uppercase tracking-wide text-orange-300/80">{label}</p>
      <p className="mt-1 text-sm font-medium text-foreground">{value || "—"}</p>
    </div>
  );
}

function LocationDetails({ location }) {
  if (!location) {
    return (
      <p className="rounded-md border border-border/70 bg-card/60 px-3 py-2 text-sm text-muted-foreground">
        No service location provided.
      </p>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
      <DetailItem label="Street Name" value={location.street_name || "—"} />
      <DetailItem label="Subdivision / Village" value={location.subdivision_village || "—"} />
      <DetailItem label="Barangay" value={location.barangay || "—"} />
      <DetailItem label="City / Municipality" value={location.city_municipality || "—"} />
      <DetailItem label="Landmark" value={location.landmark || "—"} />
    </div>
  );
}

function RequestPhoto({ photoUrl, requestType }) {
  const source = toMediaUrl(photoUrl);

  return (
    <section className="space-y-2">
      <h4 className="text-sm font-semibold text-orange-400">Request Photo</h4>
      <div className="overflow-hidden rounded-md border border-border/70 bg-card/60">
        {source ? (
          <img
            src={source}
            alt={`${formatLabel(requestType)} request`}
            className="h-48 w-full object-cover"
          />
        ) : (
          <div className="flex h-48 items-center justify-center px-3 text-sm text-muted-foreground">
            No photo provided
          </div>
        )}
      </div>
    </section>
  );
}

export function BookingDetailsModal({ booking, onClose }) {
  if (!booking) {
    return null;
  }

  const isBroadcast = booking.request_type === "broadcast";
  const { latitude, longitude } = getBroadcastCoordinates(booking);
  const hasCoordinates = latitude !== null && longitude !== null;
  const { embedUrl, openUrl } = buildMapUrls(latitude, longitude);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4" onClick={onClose}>
      <div
        className={`relative w-full overflow-hidden rounded-xl border border-border bg-background shadow-2xl ${
          isBroadcast ? "max-w-6xl" : "max-w-3xl"
        }`}
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label="Close"
        >
          <X className="size-4" />
        </button>

        <div className="border-b border-border bg-gradient-to-r from-card via-muted/45 to-card px-6 py-5">
          <p className="text-lg font-semibold text-foreground">Booking Details</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {isBroadcast
              ? "Review request location and full booking context before taking action."
              : "Review full booking and request information in a clean, structured view."}
          </p>
        </div>

        <div
          className={
            isBroadcast
              ? "max-h-[75vh] overflow-y-auto px-6 py-5 lg:overflow-hidden"
              : "max-h-[75vh] overflow-y-auto px-6 py-5"
          }
        >
          {isBroadcast ? (
            <div className="grid grid-cols-1 gap-5 lg:h-[64vh] lg:grid-cols-2">
              <section className="space-y-3 lg:sticky lg:top-0 lg:self-start">
                <h4 className="text-sm font-semibold text-orange-400">Request Map</h4>
                {hasCoordinates ? (
                  <>
                    <div className="overflow-hidden rounded-lg border border-border bg-card">
                      <iframe
                        title="Broadcast request location"
                        src={embedUrl}
                        className="h-[340px] w-full"
                        loading="lazy"
                      />
                    </div>
                    <a
                      href={openUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 rounded-md border border-primary/40 bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/20"
                    >
                      <ExternalLink className="size-3.5" />
                      Open in map
                    </a>
                  </>
                ) : (
                  <p className="rounded-md border border-border/70 bg-card/60 px-3 py-2 text-sm text-muted-foreground">
                    No latitude and longitude available for this broadcast request.
                  </p>
                )}
              </section>

              <section className="space-y-4 lg:h-full lg:overflow-y-auto lg:pr-1">
                <h4 className="text-sm font-semibold text-orange-400">Details</h4>
                <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
                  <DetailItem label="Booking ID" value={booking.id} />
                  <DetailItem label="Request ID" value={booking.request_id} />
                  <DetailItem label="Client" value={booking.client_username || "—"} />
                  <DetailItem label="Provider" value={booking.provider_username || booking.shop_name || "—"} />
                  <DetailItem label="Booked At" value={formatDateTime(booking.booked_at)} />
                  <DetailItem label="Completed At" value={formatDateTime(booking.completed_at)} />
                  <DetailItem label="Amount" value={formatCurrency(booking.amount_fee)} />
                  <DetailItem label="Request Type" value={formatLabel(booking.request_type)} />
                  <DetailItem
                    label="Service"
                    value={
                      booking.request_details?.service_name
                      || booking.request_details?.service_names?.join(", ")
                      || "—"
                    }
                  />
                </div>

                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-orange-300/80">Booking Status</p>
                  <Badge variant={statusVariant(booking.status)} className={`capitalize ${getStatusClass(booking.status)}`}>
                    {formatLabel(booking.status)}
                  </Badge>
                </div>

                <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
                  <DetailItem label="Broadcast Status" value={formatLabel(booking.request_details?.status)} />
                  <DetailItem label="Expires At" value={formatDateTime(booking.request_details?.expires_at)} />
                  <DetailItem label="Accepted At" value={formatDateTime(booking.request_details?.accepted_at)} />
                </div>

                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-orange-300/80">Request Description</p>
                  <p className="rounded-md border border-border/70 bg-card/60 px-3 py-2 text-sm text-foreground">
                    {booking.request_details?.description || "No description provided."}
                  </p>
                </div>

                <RequestPhoto
                  photoUrl={booking.request_details?.photo_url}
                  requestType={booking.request_type}
                />

                <section className="space-y-3">
                  <h4 className="text-sm font-semibold text-orange-400">Service Location</h4>
                  <LocationDetails location={booking.service_location} />
                </section>
              </section>
            </div>
          ) : (
            <div className="space-y-5">
              <section className="space-y-3">
                <h4 className="text-sm font-semibold text-orange-400">Booking Overview</h4>
                <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2 lg:grid-cols-3">
                  <DetailItem label="Booking ID" value={booking.id} />
                  <DetailItem label="Request ID" value={booking.request_id} />
                  <DetailItem label="Type" value={formatLabel(booking.request_type)} />
                  <DetailItem label="Client" value={booking.client_username || "—"} />
                  <DetailItem label="Provider" value={booking.provider_username || booking.shop_name || "—"} />
                  <DetailItem label="Amount" value={formatCurrency(booking.amount_fee)} />
                  <DetailItem label="Booked At" value={formatDateTime(booking.booked_at)} />
                  <DetailItem label="Request Created" value={formatDateTime(booking.request_created_at)} />
                  <DetailItem label="Completed At" value={formatDateTime(booking.completed_at)} />
                </div>
              </section>

              <section className="space-y-2">
                <h4 className="text-sm font-semibold text-orange-400">Status</h4>
                <Badge variant={statusVariant(booking.status)} className={`capitalize ${getStatusClass(booking.status)}`}>
                  {formatLabel(booking.status)}
                </Badge>
              </section>

              <section className="space-y-2">
                <h4 className="text-sm font-semibold text-orange-400">Request Details</h4>
                <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
                  <DetailItem label="Request Status" value={formatLabel(booking.request_details?.request_status)} />
                  <DetailItem label="Service" value={booking.request_details?.service_name || "—"} />
                  <DetailItem label="Quoted Price" value={formatCurrency(booking.request_details?.quoted_price)} />
                </div>

                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-orange-300/80">Description</p>
                  <p className="rounded-md border border-border/70 bg-card/60 px-3 py-2 text-sm text-foreground">
                    {booking.request_details?.description || "No description provided."}
                  </p>
                </div>

                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-orange-300/80">Provider Note</p>
                  <p className="rounded-md border border-border/70 bg-card/60 px-3 py-2 text-sm text-foreground">
                    {booking.request_details?.providers_note || "No provider note available."}
                  </p>
                </div>

                <RequestPhoto
                  photoUrl={booking.request_details?.photo_url}
                  requestType={booking.request_type}
                />
              </section>

              <section className="space-y-3">
                <h4 className="text-sm font-semibold text-orange-400">Service Location</h4>
                <LocationDetails location={booking.service_location} />
              </section>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end border-t border-border px-6 py-4">
          <Button type="button" variant="outline" className="rounded-lg" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}
