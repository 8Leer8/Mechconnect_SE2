import { ApiError, clearStoredAuthToken, request, setStoredAuthToken } from "./httpClient";

const ADMIN_ROLE = "admin";

function normalizeRoles(account) {
  if (!account || !Array.isArray(account.roles)) {
    return [];
  }

  return account.roles
    .map((roleItem) => {
      if (typeof roleItem === "string") {
        return roleItem;
      }
      if (roleItem && typeof roleItem.account_role === "string") {
        return roleItem.account_role;
      }
      return null;
    })
    .filter(Boolean);
}

export function hasAdminRole(account) {
  return normalizeRoles(account).includes(ADMIN_ROLE);
}

export async function loginAsAdmin(username, password) {
  const data = await request("/admin/users/auth/login/", {
    method: "POST",
    body: { username, password },
  });

  setStoredAuthToken(data?.token || null);

  if (!hasAdminRole(data?.account)) {
    try {
      await logoutAdmin();
    } catch {
      // Ignore logout errors when forcing out non-admin users.
    }
    throw new ApiError("This account does not have admin access.", { status: 403 });
  }

  return data.account;
}

export async function checkAdminSession() {
  try {
    const data = await request("/admin/users/auth/check-session/");
    if (!data?.authenticated || !hasAdminRole(data?.account)) {
      clearStoredAuthToken();
      return null;
    }
    return data.account;
  } catch {
    clearStoredAuthToken();
    return null;
  }
}

export async function logoutAdmin() {
  try {
    await request("/admin/users/auth/logout/", { method: "POST" });
  } finally {
    clearStoredAuthToken();
  }
}

export function getRoleList(account) {
  return normalizeRoles(account);
}
