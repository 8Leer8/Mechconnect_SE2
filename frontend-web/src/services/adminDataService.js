import { request } from "./httpClient";

function withQuery(path, params = {}) {
  const searchParams = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") {
      return;
    }
    searchParams.append(key, String(value));
  });

  const query = searchParams.toString();
  return query ? `${path}?${query}` : path;
}

export function fetchAdminAccounts(params = {}) {
  return request(withQuery("/admin/users/accounts/", params));
}

export function fetchAdminVerificationQueue() {
  return request("/admin/users/verification-queue/");
}

export function submitAdminVerificationDecision(payload) {
  return request("/admin/users/verification/decision/", {
    method: "POST",
    body: payload,
  });
}

export function fetchAdminReports(params = {}) {
  return request(withQuery("/admin/users/reports/", params));
}

export function fetchAdminBookingsOverview() {
  return request("/admin/bookings/overview/");
}

export function fetchAdminBookings(params = {}) {
  return request(withQuery("/admin/bookings/list/", params));
}

export function fetchAdminRequests(params = {}) {
  return request(withQuery("/admin/bookings/requests/", params));
}

export function fetchAdminDisputes(params = {}) {
  return request(withQuery("/admin/bookings/disputes/", params));
}

export function resolveAdminDispute(disputeId, payload) {
  return request(`/admin/bookings/disputes/${disputeId}/resolve/`, {
    method: "POST",
    body: payload,
  });
}

export function fetchAdminServices(params = {}) {
  return request(withQuery("/admin/services/list/", params));
}

export function fetchAdminSpecialties(params = {}) {
  return request(withQuery("/admin/services/specialties/list/", params));
}

export function updateAdminService(serviceId, payload) {
  return request(`/admin/services/list/${serviceId}/update/`, {
    method: "PATCH",
    body: payload,
  });
}

export function updateAdminSpecialty(specialtyId, payload) {
  return request(`/admin/services/specialties/${specialtyId}/update/`, {
    method: "PATCH",
    body: payload,
  });
}

export function fetchAdminNotifications(params = {}) {
  return request(withQuery("/admin/notification/list/", params));
}

export function fetchAdminWalletOverview() {
  return request("/admin/users/wallet/overview/");
}

export function fetchAdminWalletTransactions(params = {}) {
  return request(withQuery("/admin/users/wallet/transactions/", params));
}

export function fetchAdminPricingConfig() {
  return request("/admin/pricing/config/");
}

export function updateAdminPricingConfig(payload) {
  return request("/admin/pricing/config/update/", {
    method: "PATCH",
    body: payload,
  });
}