import { useState } from "react";
import { ExternalLink, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ModalShell } from "@/components/modals/ModalShell";
import { Badge } from "@/components/ui/badge";
import { API_BASE_URL } from "@/config/env";
import { fetchAdminBookingTransactionStats } from "@/services/adminDataService";

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
  if (status === "reschedule_proposed") {
    return "secondary";
  }
  if (
    status === "active" ||
    status === "on_the_way" ||
    status === "at_location" ||
    status === "diagnosing" ||
    status === "accepted" ||
    status === "booked"
  ) {
    return "secondary";
  }
  if (status === "disputed" || status === "cancelled") {
    return "destructive";
  }
  return "outline";
}

function getStatusClass(status) {
  const value = String(status || "").toLowerCase();

  if (value === "accepted" || value === "booked") {
    return "border-emerald-500/40 bg-emerald-500/15 text-emerald-300";
  }
  if (value === "on_the_way") {
    return "border-cyan-500/40 bg-cyan-500/15 text-cyan-300";
  }
  if (value === "at_location") {
    return "border-sky-500/40 bg-sky-500/15 text-sky-200";
  }
  if (value === "diagnosing") {
    return "border-fuchsia-500/40 bg-fuchsia-500/15 text-fuchsia-200";
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
  if (value === "reschedule_proposed") {
    return "border-yellow-500/40 bg-yellow-500/15 text-yellow-300";
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

function ServicesSection({ servicesList }) {
  // Use the services_list from API (array of service names)
  const servicesArray = Array.isArray(servicesList) ? servicesList : [];

  if (servicesArray.length === 0) {
    return (
      <div className="rounded-md border border-border/70 bg-card/60 px-3 py-2.5">
        <p className="text-xs font-semibold uppercase tracking-wide text-orange-300/80">Service</p>
        <p className="mt-1 text-sm font-medium text-muted-foreground">—</p>
      </div>
    );
  }

  return (
    <div className="rounded-md border border-border/70 bg-card/60 px-3 py-2.5">
      <p className="text-xs font-semibold uppercase tracking-wide text-orange-300/80">
        Service{servicesArray.length > 1 ? 's' : ''}
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        {servicesArray.map((service, index) => (
          <Badge
            key={index}
            variant="outline"
            className="border-primary/40 bg-primary/10 text-primary"
          >
            {service}
          </Badge>
        ))}
      </div>
    </div>
  );
}

function VehicleSection({ vehicleInformation }) {
  if (!vehicleInformation) {
    return (
      <div className="rounded-md border border-border/70 bg-card/60 px-3 py-2.5">
        <p className="text-xs font-semibold uppercase tracking-wide text-orange-300/80">Vehicle Information</p>
        <p className="mt-1 text-sm font-medium text-muted-foreground">—</p>
      </div>
    );
  }

  return (
    <div className="rounded-md border border-border/70 bg-card/60 px-3 py-2.5">
      <p className="text-xs font-semibold uppercase tracking-wide text-orange-300/80">Vehicle Information</p>
      <p className="mt-1 text-sm font-medium text-foreground">{vehicleInformation}</p>
    </div>
  );
}

function PaymentDetails({ paymentBreakdown, quotationDetails, baseFee, booking, receiptInfo, onOpenStats }) {
  const [isQuotationOpen, setIsQuotationOpen] = useState(false);

  const pb = paymentBreakdown || {};
  const distanceKm = pb.distance_km || 0;
  const distanceFee = distanceKm * 10; // 10 per km
  const trafficFee = pb.traffic_surcharge || 0;
  const convenienceFee = pb.convenience_fee_total || 0;
  const totalFee = pb.total_fee || 0;
  const serviceFee = pb.service_fee || (totalFee - convenienceFee);
  const calculatedBaseFee = baseFee || (convenienceFee > 0 ? convenienceFee - distanceFee - trafficFee : 0);

  // Bulletproof quotation data extraction
  const rawQuotation = quotationDetails || booking?.quotation;
  const hasQuotation = rawQuotation && rawQuotation.items && rawQuotation.items.length > 0;
  const quotationTotal = rawQuotation?.total_amount || 0;
  const quotationItemCount = rawQuotation?.items?.length || 0;

  // Payment method from receipt info
  const rawReceipt = receiptInfo || booking?.receipt_info;
  const paymentMethod = rawReceipt?.payment_method;
  const paymentReceived = rawReceipt?.payment_received;

  // Format payment method label
  const formatPaymentMethod = (method) => {
    if (!method) return '—';
    const labels = {
      'cash': 'Cash',
      'gcash': 'GCash',
      'maya': 'Maya',
      'online': 'Online Payment',
    };
    return labels[method] || method.charAt(0).toUpperCase() + method.slice(1);
  };

  // Hide if no payment data
  if (!convenienceFee && !quotationTotal && !totalFee) {
    return null;
  }

  return (
    <section className="space-y-4 rounded-lg border border-border/70 bg-card/40 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-sm font-semibold text-orange-400">Payment Details</h4>
        <Button type="button" variant="outline" size="sm" className="rounded-full" onClick={onOpenStats}>
          View Transaction Statistics
        </Button>
      </div>

      {/* Payment Method Row */}
      {paymentMethod && (
        <div className="flex justify-between items-center py-2 border-b border-border/30">
          <span className="text-sm text-muted-foreground">Payment Method</span>
          <div className="flex items-center gap-2">
            {paymentReceived && (
              <Badge variant="outline" className="border-green-500/40 bg-green-500/10 text-green-400 text-xs">
                Paid
              </Badge>
            )}
            <span className="text-sm font-medium text-foreground">{formatPaymentMethod(paymentMethod)}</span>
          </div>
        </div>
      )}

      {/* Fee Breakdown Rows */}
      <div className="space-y-2">
        {/* Base Fee */}
        {calculatedBaseFee > 0 && (
          <div className="flex justify-between items-center py-2 border-b border-border/30">
            <span className="text-sm text-muted-foreground">Base Fee</span>
            <span className="text-sm font-medium text-foreground">{formatCurrency(calculatedBaseFee)}</span>
          </div>
        )}

        {/* Distance Fee */}
        {distanceKm > 0 && (
          <div className="flex justify-between items-center py-2 border-b border-border/30">
            <span className="text-sm text-muted-foreground">Distance Fee ({distanceKm.toFixed(2)} km)</span>
            <span className="text-sm font-medium text-foreground">{formatCurrency(distanceFee)}</span>
          </div>
        )}

        {/* Traffic Fee */}
        {trafficFee > 0 && (
          <div className="flex justify-between items-center py-2 border-b border-border/30">
            <span className="text-sm text-muted-foreground">Estimated Traffic Fee</span>
            <span className="text-sm font-medium text-foreground">{formatCurrency(trafficFee)}</span>
          </div>
        )}

        {/* Initial Service Fee (when no quotation exists yet) */}
        {!hasQuotation && serviceFee > 0 && (
          <div className="flex justify-between items-center py-2 border-b border-border/30">
            <span className="text-sm text-muted-foreground">Initial Service Fee</span>
            <span className="text-sm font-medium text-foreground">{formatCurrency(serviceFee)}</span>
          </div>
        )}

        {/* Quotation Items Accordion */}
        {hasQuotation && (
          <div className="py-2 border-b border-border/30">
            {/* Clickable Header */}
            <button
              type="button"
              onClick={() => setIsQuotationOpen(!isQuotationOpen)}
              className="w-full flex justify-between items-center py-2 px-2 rounded-md hover:bg-muted/50 transition-colors"
            >
              <span className="text-xs font-semibold uppercase tracking-wide text-orange-300/60">
                Quotation Items ({quotationItemCount})
              </span>
              <span className="text-muted-foreground">
                {isQuotationOpen ? (
                  <ChevronUp className="size-4" />
                ) : (
                  <ChevronDown className="size-4" />
                )}
              </span>
            </button>

            {/* Collapsible Content */}
            {isQuotationOpen && (
              <div className="mt-2 p-2 rounded-md bg-card/40 border border-border/30">
                <div className="space-y-2">
                  {rawQuotation.items.map((item, index) => (
                    <div key={index} className="flex justify-between items-start text-sm py-1 border-b border-border/20 last:border-b-0">
                      <span className="text-muted-foreground flex-1 pr-2">{item.description || '—'}</span>
                      <span className="text-foreground font-medium whitespace-nowrap">
                        {item.quantity} × {formatCurrency(item.unit_price)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Quotation Estimated Total (always visible) */}
            <div className="flex justify-between items-center mt-2 pt-2 border-t border-border/20 px-2">
              <span className="text-xs font-medium text-orange-300/80">Quotation Estimated Total</span>
              <span className="text-sm font-bold text-foreground">{formatCurrency(quotationTotal)}</span>
            </div>
          </div>
        )}

        {/* Convenience Fee Total */}
        {convenienceFee > 0 && (
          <div className="flex justify-between items-center py-2 border-b border-border/30">
            <span className="text-sm font-semibold text-orange-300/80">Convenience Fee Total</span>
            <span className="text-sm font-bold text-foreground">{formatCurrency(convenienceFee)}</span>
          </div>
        )}

        {/* Grand Total */}
        <div className="flex justify-between items-center py-3 px-3 rounded-md bg-primary/10 border border-primary/30">
          <span className="text-sm font-bold text-primary">Total Fee</span>
          <span className="text-base font-bold text-primary">{formatCurrency(totalFee)}</span>
        </div>
      </div>
    </section>
  );
}

function PaymentBreakdown({ booking }) {
  const convenienceFee = booking.convenience_fee || 0;
  const distanceKm = booking.distance_km || 0;
  const distanceFee = distanceKm * 10; // 10 per km
  const trafficFee = booking.traffic_surcharge || 0;
  const baseFee = booking.base_fee || (convenienceFee - distanceFee - trafficFee);
  const trafficLevel = booking.traffic_level;
  const etaMinutes = booking.estimated_eta_minutes;
  
  const quotation = booking.quotation;
  const quotationItems = quotation?.items || [];
  const quotationTotal = quotation?.total_amount || 0;
  
  const totalFee = convenienceFee + quotationTotal;

  // Hide section if no payment data available
  if (!convenienceFee && !quotationTotal) {
    return null;
  }

  return (
    <section className="space-y-4 rounded-lg border border-border/70 bg-card/40 p-4">
      <h4 className="text-sm font-semibold text-orange-400">Payment Breakdown</h4>
      
      {/* Convenience Fee Section */}
      {convenienceFee > 0 && (
        <div className="space-y-3 rounded-md border border-border/50 bg-card/30 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-orange-300/60">Convenience Fee</p>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            <div className="flex justify-between items-center rounded bg-card/60 px-2 py-1.5">
              <span className="text-xs text-muted-foreground">Base Fee</span>
              <span className="text-sm font-medium text-foreground">{formatCurrency(baseFee)}</span>
            </div>
            <div className="flex justify-between items-center rounded bg-card/60 px-2 py-1.5">
              <span className="text-xs text-muted-foreground">Distance Fee ({distanceKm.toFixed(1)} km)</span>
              <span className="text-sm font-medium text-foreground">{formatCurrency(distanceFee)}</span>
            </div>
            <div className="flex justify-between items-center rounded bg-card/60 px-2 py-1.5">
              <span className="text-xs text-muted-foreground">
                Traffic Fee{trafficLevel ? ` (${trafficLevel})` : ''}
              </span>
              <span className="text-sm font-medium text-foreground">{formatCurrency(trafficFee)}</span>
            </div>
            <div className="flex justify-between items-center rounded bg-card/60 px-2 py-1.5">
              <span className="text-xs text-muted-foreground">
                ETA{etaMinutes ? ` (${etaMinutes} min)` : ''}
              </span>
              <span className="text-sm font-medium text-foreground">
                {etaMinutes ? `${etaMinutes} minutes` : "—"}
              </span>
            </div>
          </div>
          <div className="flex items-center justify-between rounded-md border border-orange-500/30 bg-orange-500/10 px-3 py-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-orange-300/80">Convenience Fee Total</span>
            <span className="text-sm font-bold text-foreground">{formatCurrency(convenienceFee)}</span>
          </div>
        </div>
      )}

      {/* Quotation Section */}
      {quotation && quotationItems.length > 0 && (
        <div className="space-y-3 rounded-md border border-border/50 bg-card/30 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-orange-300/60">
            Quotation {quotation.is_final && "(Final)"}
          </p>
          <div className="space-y-2">
            {quotationItems.map((item, index) => (
              <div 
                key={item.id || index} 
                className="flex items-center justify-between rounded-md border border-border/50 bg-card/60 px-3 py-2"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">
                    {item.service_name || item.description || `Item ${index + 1}`}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {item.quantity || 1} × {formatCurrency(item.unit_price)}
                  </p>
                </div>
                <span className="text-sm font-semibold text-foreground ml-3">
                  {formatCurrency(item.line_total)}
                </span>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between rounded-md border border-indigo-500/30 bg-indigo-500/10 px-3 py-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-indigo-300/80">Quotation Total</span>
            <span className="text-sm font-bold text-foreground">{formatCurrency(quotationTotal)}</span>
          </div>
        </div>
      )}

      {/* Grand Total */}
      <div className="flex items-center justify-between rounded-md border border-primary/30 bg-primary/10 px-4 py-3">
        <span className="text-sm font-bold uppercase tracking-wide text-primary">Total Fee</span>
        <span className="text-base font-bold text-primary">{formatCurrency(totalFee)}</span>
      </div>
    </section>
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

function StatPill({ label, value, intent }) {
  const intentClass = {
    success: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
    warning: "border-orange-500/40 bg-orange-500/10 text-orange-300",
    danger: "border-red-500/40 bg-red-500/10 text-red-300",
    neutral: "border-border/60 bg-muted/30 text-muted-foreground",
  };

  return (
    <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${intentClass[intent] || intentClass.neutral}`}>
      {label}: {value}
    </span>
  );
}

function SummaryCard({ label, value, caption, accentClass }) {
  return (
    <div className={`rounded-lg border border-border/70 bg-card/60 p-3 ${accentClass || ""}`}>
      <p className="text-xs font-semibold uppercase tracking-wide text-orange-300/70">{label}</p>
      <p className="mt-2 text-xl font-semibold text-foreground">{value}</p>
      {caption ? <p className="mt-1 text-xs text-muted-foreground">{caption}</p> : null}
    </div>
  );
}

function TransactionStatsModal({ isOpen, onClose, stats, isLoading, error }) {
  const totals = stats?.totals || {};
  const receiptInfo = stats?.receipt_info || null;
  const installments = Array.isArray(stats?.payment_installments) ? stats.payment_installments : [];
  const transactions = Array.isArray(stats?.payment_transactions) ? stats.payment_transactions : [];

  const paymentMethod = receiptInfo?.payment_method ? formatLabel(receiptInfo.payment_method) : "—";
  const paymentStatus = receiptInfo?.payment_received ? "Paid" : "Not paid";

  const receiptImage = receiptInfo?.receipt_image ? toMediaUrl(receiptInfo.receipt_image) : "";

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      maxWidth={null}
      overlayClassName="z-[60]"
      cardClassName="max-w-5xl"
      title="Transaction Statistics"
      description="Detailed breakdown of payments, payouts, and remittances for this booking."
      headerClassName="py-5"
      footer={
        <Button type="button" variant="outline" className="rounded-lg" onClick={onClose}>
          Close
        </Button>
      }
    >
      <div className="max-h-[75vh] overflow-y-auto px-6 py-5">
        {error ? (
          <p className="rounded-md border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            {error}
          </p>
        ) : null}

        <section className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          <SummaryCard
            label="Client Paid"
            value={formatCurrency(totals.client_paid_total)}
            caption="Sum of confirmed payments"
          />
          <SummaryCard
            label="Mechanic Earned"
            value={formatCurrency(totals.mechanic_earnings_total)}
            caption="Net payout amount"
          />
          <SummaryCard
            label="Platform Earned"
            value={formatCurrency(totals.platform_earnings_total)}
            caption="Platform fee retained"
          />
          <SummaryCard
            label="Outstanding"
            value={formatCurrency(totals.outstanding_balance)}
            caption="Remaining balance"
            accentClass={totals.outstanding_balance > 0 ? "border-orange-500/40 bg-orange-500/10" : ""}
          />
        </section>

        <section className="mt-5 space-y-3 rounded-lg border border-border/70 bg-card/40 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-sm font-semibold text-orange-400">Receipt & Payment Method</h4>
            <div className="flex flex-wrap gap-2">
              <StatPill label="Status" value={paymentStatus} intent={receiptInfo?.payment_received ? "success" : "warning"} />
              <StatPill label="Method" value={paymentMethod} intent="neutral" />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <DetailItem label="Paid At" value={formatDateTime(receiptInfo?.paid_at)} />
            <DetailItem label="Transaction ID" value={receiptInfo?.transaction_id || "—"} />
            <DetailItem label="Platform Fee" value={formatCurrency(receiptInfo?.platform_fee)} />
            <DetailItem label="Mechanic Payout" value={formatCurrency(receiptInfo?.mechanic_payout)} />
          </div>

          {receiptImage ? (
            <div className="mt-2 overflow-hidden rounded-md border border-border/60 bg-card/60">
              <img src={receiptImage} alt="Receipt" className="h-48 w-full object-cover" />
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">No receipt image uploaded.</p>
          )}
        </section>

        <section className="mt-5 space-y-3 rounded-lg border border-border/70 bg-card/40 p-4">
          <h4 className="text-sm font-semibold text-orange-400">Installments</h4>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading installments...</p>
          ) : installments.length === 0 ? (
            <p className="text-sm text-muted-foreground">No installments recorded.</p>
          ) : (
            <div className="space-y-2">
              {installments.map((item) => (
                <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border/60 bg-card/60 px-3 py-2">
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-foreground">{formatLabel(item.installment_type)}</p>
                    <p className="text-xs text-muted-foreground">Paid at {formatDateTime(item.paid_at)}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <StatPill label="Status" value={formatLabel(item.status)} intent={item.status === "paid" ? "success" : "warning"} />
                    <StatPill label="Released" value={item.is_released ? "Yes" : "No"} intent={item.is_released ? "success" : "neutral"} />
                    <span className="text-sm font-semibold text-foreground">{formatCurrency(item.amount)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="mt-5 space-y-3 rounded-lg border border-border/70 bg-card/40 p-4">
          <h4 className="text-sm font-semibold text-orange-400">Payment Transactions</h4>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading transactions...</p>
          ) : transactions.length === 0 ? (
            <p className="text-sm text-muted-foreground">No payment transactions found.</p>
          ) : (
            <div className="space-y-2">
              {transactions.map((txn) => (
                <div key={txn.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border/60 bg-card/60 px-3 py-2">
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-foreground">{formatLabel(txn.method)}</p>
                    <p className="text-xs text-muted-foreground">{formatDateTime(txn.created_at)}</p>
                    <p className="text-xs text-muted-foreground">Ref: {txn.reference || "—"}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <StatPill label="Status" value={formatLabel(txn.status)} intent={txn.status === "success" ? "success" : "danger"} />
                    <span className="text-sm font-semibold text-foreground">{formatCurrency(txn.amount)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

      </div>
    </ModalShell>
  );
}

export function BookingDetailsModal({ booking, onClose }) {
  if (!booking) {
    return null;
  }

  const [isStatsOpen, setIsStatsOpen] = useState(false);
  const [statsData, setStatsData] = useState(null);
  const [statsError, setStatsError] = useState("");
  const [isStatsLoading, setIsStatsLoading] = useState(false);

  const { latitude, longitude } = getBroadcastCoordinates(booking);
  const hasCoordinates = latitude !== null && longitude !== null;
  const { embedUrl, openUrl } = buildMapUrls(latitude, longitude);

  const requestDetailFields = (() => {
    const details = booking.request_details || {};
    if (booking.request_type === "custom") {
      return [
        { label: "Request Status", value: formatLabel(details.request_status) },
        { label: "Quoted Price", value: formatCurrency(details.quoted_price) },
      ];
    }
    if (booking.request_type === "direct") {
      return [
        { label: "Request Status", value: formatLabel(details.request_status) },
        { label: "Service", value: details.service_name || "—" },
      ];
    }
    if (booking.request_type === "emergency") {
      return [{ label: "Request Status", value: formatLabel(details.request_status) }];
    }
    if (booking.request_type === "broadcast") {
      return [
        { label: "Broadcast Status", value: formatLabel(details.status) },
        { label: "Expires At", value: formatDateTime(details.expires_at) },
        { label: "Accepted At", value: formatDateTime(details.accepted_at) },
      ];
    }
    return [];
  })();

  async function handleOpenStats() {
    setIsStatsOpen(true);
    if (statsData || isStatsLoading) {
      return;
    }
    setStatsError("");
    setIsStatsLoading(true);
    try {
      const data = await fetchAdminBookingTransactionStats(booking.id);
      setStatsData(data);
    } catch (error) {
      setStatsError(error?.message || "Failed to load transaction statistics.");
    } finally {
      setIsStatsLoading(false);
    }
  }

  return (
    <>
      <ModalShell
        isOpen
        onClose={onClose}
        maxWidth={null}
        cardClassName="max-w-6xl"
        title="Booking Details"
        description="Review request location and full booking context before taking action."
        headerClassName="py-5"
        footer={
          <Button type="button" variant="outline" className="rounded-lg" onClick={onClose}>
            Close
          </Button>
        }
      >
        <div className="max-h-[75vh] overflow-y-auto px-6 py-5 lg:overflow-hidden">
          <div className="grid grid-cols-1 gap-5 lg:h-[64vh] lg:grid-cols-2">
            <section className="space-y-3 lg:sticky lg:top-0 lg:self-start">
              <h4 className="text-sm font-semibold text-orange-400">Request Map</h4>
              {hasCoordinates ? (
                <>
                  <div className="overflow-hidden rounded-lg border border-border bg-card">
                    <iframe
                      title="Request location"
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
                  No location available for this request.
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
              </div>

              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-orange-300/80">Booking Status</p>
                <Badge variant={statusVariant(booking.status)} className={`capitalize ${getStatusClass(booking.status)}`}>
                  {formatLabel(booking.status)}
                </Badge>
              </div>

              <VehicleSection vehicleInformation={booking.vehicle_information} />
              <ServicesSection servicesList={booking.services_list} />

              {requestDetailFields.length > 0 ? (
                <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
                  {requestDetailFields.map((field) => (
                    <DetailItem key={field.label} label={field.label} value={field.value} />
                  ))}
                </div>
              ) : null}

              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-orange-300/80">Request Description</p>
                <p className="rounded-md border border-border/70 bg-card/60 px-3 py-2 text-sm text-foreground">
                  {booking.request_details?.description || "No description provided."}
                </p>
              </div>

              {booking.request_details?.providers_note ? (
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-orange-300/80">Provider Note</p>
                  <p className="rounded-md border border-border/70 bg-card/60 px-3 py-2 text-sm text-foreground">
                    {booking.request_details?.providers_note}
                  </p>
                </div>
              ) : null}

              <RequestPhoto
                photoUrl={booking.request_details?.photo_url}
                requestType={booking.request_type}
              />

              <section className="space-y-3">
                <h4 className="text-sm font-semibold text-orange-400">Service Location</h4>
                <LocationDetails location={booking.service_location} />
              </section>

              <PaymentDetails
                paymentBreakdown={booking.payment_breakdown}
                quotationDetails={booking.quotation_details}
                baseFee={booking.base_fee}
                booking={booking}
                receiptInfo={booking.receipt_info}
                onOpenStats={handleOpenStats}
              />
            </section>
          </div>
        </div>
      </ModalShell>

      <TransactionStatsModal
        isOpen={isStatsOpen}
        onClose={() => setIsStatsOpen(false)}
        stats={statsData}
        isLoading={isStatsLoading}
        error={statsError}
      />
    </>
  );
}
