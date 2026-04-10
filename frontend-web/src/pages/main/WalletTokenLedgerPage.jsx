import { useEffect, useMemo, useState } from "react";
import { AdminLayout } from "../AdminLayout";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PaginationControls } from "@/components/common/PaginationControls";
import {
  fetchAdminPricingConfig,
  fetchAdminWalletOverview,
  fetchAdminWalletTransactions,
  updateAdminPricingConfig,
} from "@/services/adminDataService";

const ITEMS_PER_PAGE = 10;

const PRICING_FORM_DEFAULTS = {
  base_token_price: "1.00",
  min_token_purchase: "1",
  max_token_purchase: "1000",
  token_deduction_percentage: "2.00",
  base_distance_fee: "50.00",
  price_per_km: "15.00",
  free_distance_km: "2.00",
  traffic_low_multiplier: "1.00",
  traffic_medium_multiplier: "1.25",
  traffic_high_multiplier: "1.50",
  convenience_fee_percentage: "5.00",
  convenience_fee_fixed: "0.00",
  min_job_price: "100.00",
  platform_commission_percentage: "10.00",
};

const INTEGER_FIELDS = new Set(["min_token_purchase", "max_token_purchase"]);

function normalizePricingForm(config) {
  if (!config) {
    return { ...PRICING_FORM_DEFAULTS };
  }

  return Object.keys(PRICING_FORM_DEFAULTS).reduce((acc, key) => {
    const value = config[key];
    acc[key] = value === null || value === undefined ? PRICING_FORM_DEFAULTS[key] : String(value);
    return acc;
  }, {});
}

function buildPricingPayload(form) {
  const payload = {};
  Object.entries(form).forEach(([key, value]) => {
    if (INTEGER_FIELDS.has(key)) {
      payload[key] = Number.parseInt(value, 10);
      return;
    }
    payload[key] = Number.parseFloat(value);
  });
  return payload;
}

function normalizeTokenPackages(config) {
  if (!Array.isArray(config?.token_packages)) {
    return [];
  }

  return config.token_packages
    .map((item) => ({
      tokens: item?.tokens === null || item?.tokens === undefined ? "" : String(item.tokens),
      price: item?.price === null || item?.price === undefined ? "" : String(item.price),
    }))
    .filter((item) => item.tokens !== "" || item.price !== "");
}

function buildTokenPackagesPayload(packages) {
  const parsedPackages = [];
  const seenTokens = new Set();

  for (let i = 0; i < packages.length; i += 1) {
    const entry = packages[i];
    const rawTokens = (entry.tokens ?? "").trim();
    const rawPrice = (entry.price ?? "").trim();

    if (!rawTokens && !rawPrice) {
      continue;
    }

    const tokens = Number.parseInt(rawTokens, 10);
    const price = Number.parseFloat(rawPrice);

    if (Number.isNaN(tokens) || Number.isNaN(price)) {
      return {
        error: `Token package #${i + 1} has invalid numbers.`,
        packages: [],
      };
    }

    if (tokens <= 0) {
      return {
        error: `Token package #${i + 1} must have tokens greater than 0.`,
        packages: [],
      };
    }

    if (price < 0) {
      return {
        error: `Token package #${i + 1} must have price 0 or greater.`,
        packages: [],
      };
    }

    if (seenTokens.has(tokens)) {
      return {
        error: `Duplicate token package found for ${tokens} tokens.`,
        packages: [],
      };
    }

    seenTokens.add(tokens);
    parsedPackages.push({ tokens, price: Number(price.toFixed(2)) });
  }

  parsedPackages.sort((a, b) => a.tokens - b.tokens);
  return { error: "", packages: parsedPackages };
}

function formatCount(value, isLoading) {
  if (isLoading) {
    return "...";
  }
  if (value === null || value === undefined) {
    return "—";
  }
  return Number(value).toLocaleString();
}

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

function TransactionSkeletonRow() {
  return (
    <div className="grid grid-cols-5 gap-4 border-b py-4 last:border-b-0">
      {Array.from({ length: 5 }).map((_, idx) => (
        <div key={idx} className="h-4 animate-pulse rounded bg-[#2A2C2E]" />
      ))}
    </div>
  );
}

export function WalletTokenLedgerPage() {
  const [overview, setOverview] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [pricingConfig, setPricingConfig] = useState(null);
  const [pricingForm, setPricingForm] = useState({ ...PRICING_FORM_DEFAULTS });
  const [tokenPackages, setTokenPackages] = useState([]);
  const [pricingMessage, setPricingMessage] = useState("");
  const [pricingMessageType, setPricingMessageType] = useState("idle");
  const [isSavingPricing, setIsSavingPricing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    async function loadWalletData() {
      setIsLoading(true);
      setLoadError("");
      setPricingMessage("");

      const [overviewResult, transactionsResult, pricingResult] = await Promise.allSettled([
        fetchAdminWalletOverview(),
        fetchAdminWalletTransactions({ limit: 200 }),
        fetchAdminPricingConfig(),
      ]);

      if (overviewResult.status === "fulfilled") {
        setOverview(overviewResult.value);
      } else {
        setOverview(null);
      }

      if (transactionsResult.status === "fulfilled") {
        setTransactions(transactionsResult.value?.results || []);
      } else {
        setTransactions([]);
      }

      if (pricingResult.status === "fulfilled") {
        setPricingConfig(pricingResult.value);
        setPricingForm(normalizePricingForm(pricingResult.value));
        setTokenPackages(normalizeTokenPackages(pricingResult.value));
      } else {
        setPricingConfig(null);
        setPricingForm({ ...PRICING_FORM_DEFAULTS });
        setTokenPackages([]);
      }

      if (
        overviewResult.status === "rejected" ||
        transactionsResult.status === "rejected" ||
        pricingResult.status === "rejected"
      ) {
        setLoadError("Some wallet data could not be loaded.");
      }

      setIsLoading(false);
    }

    loadWalletData();
  }, []);

  const stats = useMemo(
    () => [
      {
        label: "Total Tokens Purchased",
        value: overview?.total_tokens_purchased,
      },
      {
        label: "Pending Purchases",
        value: overview?.pending_purchases,
      },
      {
        label: "Total Transactions",
        value: overview?.transactions_total,
      },
    ],
    [overview],
  );

  const totalPages = useMemo(
    () => Math.max(Math.ceil(transactions.length / ITEMS_PER_PAGE), 1),
    [transactions.length],
  );

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const paginatedTransactions = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return transactions.slice(start, start + ITEMS_PER_PAGE);
  }, [currentPage, transactions]);

  const pricingSections = useMemo(
    () => [
      {
        title: "Token Pricing",
        fields: [
          { key: "base_token_price", label: "Base Token Price", unit: "PHP / token" },
          { key: "min_token_purchase", label: "Minimum Token Purchase", unit: "tokens" },
          { key: "max_token_purchase", label: "Maximum Token Purchase", unit: "tokens" },
          { key: "token_deduction_percentage", label: "Token Deduction Per Job", unit: "%" },
        ],
      },
      {
        title: "Distance Pricing",
        fields: [
          { key: "base_distance_fee", label: "Base Distance Fee", unit: "PHP" },
          { key: "price_per_km", label: "Price Per KM", unit: "PHP / km" },
          { key: "free_distance_km", label: "Free Distance", unit: "km" },
        ],
      },
      {
        title: "Traffic Surcharges",
        fields: [
          { key: "traffic_low_multiplier", label: "Low Traffic Multiplier", unit: "x" },
          { key: "traffic_medium_multiplier", label: "Medium Traffic Multiplier", unit: "x" },
          { key: "traffic_high_multiplier", label: "High Traffic Multiplier", unit: "x" },
        ],
      },
      {
        title: "Convenience Fee",
        fields: [
          { key: "convenience_fee_percentage", label: "Convenience Fee Percentage", unit: "%" },
          { key: "convenience_fee_fixed", label: "Convenience Fee Fixed", unit: "PHP" },
        ],
      },
      {
        title: "Job Pricing",
        fields: [
          { key: "min_job_price", label: "Minimum Job Price", unit: "PHP" },
          { key: "platform_commission_percentage", label: "Platform Commission", unit: "%" },
        ],
      },
    ],
    [],
  );

  async function handlePricingSave(event) {
    event.preventDefault();
    setPricingMessage("");
    setPricingMessageType("idle");
    setIsSavingPricing(true);

    const payload = buildPricingPayload(pricingForm);
    const tokenPackagesPayload = buildTokenPackagesPayload(tokenPackages);

    if (tokenPackagesPayload.error) {
      setPricingMessage(tokenPackagesPayload.error);
      setPricingMessageType("error");
      setIsSavingPricing(false);
      return;
    }

    payload.token_packages = tokenPackagesPayload.packages;

    const hasInvalidValue = Object.values(payload).some((value) => Number.isNaN(value));
    if (hasInvalidValue) {
      setPricingMessage("Please enter valid numeric values for all pricing fields.");
      setPricingMessageType("error");
      setIsSavingPricing(false);
      return;
    }

    try {
      const updated = await updateAdminPricingConfig(payload);
      setPricingConfig(updated);
      setPricingForm(normalizePricingForm(updated));
      setTokenPackages(normalizeTokenPackages(updated));
      setPricingMessage("Pricing configuration updated successfully.");
      setPricingMessageType("success");
    } catch (error) {
      setPricingMessage(error?.message || "Failed to update pricing configuration.");
      setPricingMessageType("error");
    } finally {
      setIsSavingPricing(false);
    }
  }

  function handlePricingInputChange(key, value) {
    setPricingForm((prev) => ({
      ...prev,
      [key]: value,
    }));
  }

  function handleTokenPackageChange(index, key, value) {
    setTokenPackages((prev) =>
      prev.map((item, currentIndex) => {
        if (currentIndex !== index) {
          return item;
        }
        return {
          ...item,
          [key]: value,
        };
      }),
    );
  }

  function addTokenPackageRow() {
    setTokenPackages((prev) => [...prev, { tokens: "", price: "" }]);
  }

  function removeTokenPackageRow(index) {
    setTokenPackages((prev) => prev.filter((_, currentIndex) => currentIndex !== index));
  }

  return (
    <AdminLayout title="Wallet & Token Ledger">
      <div className="space-y-4 rounded-xl bg-[#1A1C1E] p-4 text-white">
        <Card className="border-[#2A2C2E] bg-[#1A1C1E] text-white">
          <CardHeader>
            <CardTitle className="text-xl">Wallet & Token Ledger</CardTitle>
            <CardDescription>
              Observe token movement, payouts, and transaction volume across the platform.
            </CardDescription>
            {loadError && <p className="text-sm text-red-600">{loadError}</p>}
          </CardHeader>
        </Card>

        <Card className="border-[#2A2C2E] bg-[#1A1C1E] text-white">
          <CardHeader>
            <CardTitle className="text-xl text-[#FF8C00]">Pricing Configuration</CardTitle>
            <CardDescription>
              Configure token, distance, traffic, convenience fee, and job pricing values.
            </CardDescription>
            <p className="text-xs text-zinc-300">
              Last updated: {formatDateTime(pricingConfig?.updated_at)}
            </p>
          </CardHeader>
          <CardContent>
            <form className="space-y-5" onSubmit={handlePricingSave}>
              {pricingSections.map((section) => (
                <div key={section.title} className="rounded-lg border border-[#2A2C2E] bg-[#161819] p-4">
                  <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[#FF8C00]">
                    {section.title}
                  </h3>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {section.fields.map((field) => (
                      <label key={field.key} className="flex flex-col gap-1 text-sm">
                        <span className="text-zinc-200">{field.label}</span>
                        <div className="flex items-center rounded-md border border-[#2A2C2E] bg-[#1A1C1E] px-2">
                          <input
                            type="number"
                            step={INTEGER_FIELDS.has(field.key) ? "1" : "0.01"}
                            value={pricingForm[field.key] ?? ""}
                            onChange={(event) => handlePricingInputChange(field.key, event.target.value)}
                            className="w-full bg-transparent py-2 text-sm text-white outline-none"
                          />
                          <span className="whitespace-nowrap pl-2 text-xs text-zinc-400">{field.unit}</span>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              ))}

              <div className="rounded-lg border border-[#2A2C2E] bg-[#161819] p-4">
                <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-[#FF8C00]">
                  Token Packages
                </h3>
                <p className="mb-3 text-xs text-zinc-300">
                  Optional: set exact packages (for example, 100 tokens = PHP 100, 200 tokens = PHP 200).
                  When packages are set, mechanic wallet top-up is restricted to these exact choices.
                </p>

                <div className="space-y-2">
                  {tokenPackages.length === 0 && (
                    <p className="text-xs text-zinc-400">
                      No packages configured yet. Wallet uses base token price fallback.
                    </p>
                  )}

                  {tokenPackages.map((pkg, index) => (
                    <div key={`${index}-${pkg.tokens}-${pkg.price}`} className="grid grid-cols-1 gap-2 md:grid-cols-3">
                      <label className="flex flex-col gap-1 text-sm">
                        <span className="text-zinc-200">Tokens</span>
                        <input
                          type="number"
                          step="1"
                          min="1"
                          value={pkg.tokens}
                          onChange={(event) => handleTokenPackageChange(index, "tokens", event.target.value)}
                          className="rounded-md border border-[#2A2C2E] bg-[#1A1C1E] px-2 py-2 text-sm text-white outline-none"
                        />
                      </label>

                      <label className="flex flex-col gap-1 text-sm">
                        <span className="text-zinc-200">Price (PHP)</span>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={pkg.price}
                          onChange={(event) => handleTokenPackageChange(index, "price", event.target.value)}
                          className="rounded-md border border-[#2A2C2E] bg-[#1A1C1E] px-2 py-2 text-sm text-white outline-none"
                        />
                      </label>

                      <div className="flex items-end">
                        <button
                          type="button"
                          onClick={() => removeTokenPackageRow(index)}
                          className="rounded-md border border-red-500 px-3 py-2 text-sm text-red-400 transition hover:bg-red-500/10"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={addTokenPackageRow}
                  className="mt-3 rounded-md border border-[#FF8C00] px-3 py-2 text-sm font-semibold text-[#FF8C00] transition hover:bg-[#FF8C00]/10"
                >
                  Add Token Package
                </button>
              </div>

              {pricingMessage && (
                <p className={`text-sm ${pricingMessageType === "error" ? "text-red-400" : "text-emerald-400"}`}>
                  {pricingMessage}
                </p>
              )}

              <button
                type="submit"
                disabled={isSavingPricing}
                className="inline-flex items-center justify-center rounded-md bg-[#FF8C00] px-4 py-2 text-sm font-semibold text-black transition hover:bg-orange-400 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSavingPricing ? "Saving..." : "Save Pricing Configuration"}
              </button>
            </form>
          </CardContent>
        </Card>

        <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {stats.map((item) => (
            <Card key={item.label} className="border-[#2A2C2E] bg-[#1A1C1E] text-white">
              <CardHeader className="pb-2">
                <CardDescription>{item.label}</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-semibold">{formatCount(item.value, isLoading)}</p>
              </CardContent>
            </Card>
          ))}
        </section>

        <Card className="border-[#2A2C2E] bg-[#1A1C1E] text-white">
          <CardHeader>
            <CardTitle className="text-lg">Recent Transactions</CardTitle>
            <CardDescription>
              Ledger entries will appear here once backend integration is connected.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border border-[#2A2C2E]">
              <div className="overflow-x-auto">
                <div className="min-w-[680px]">
                  <div className="grid grid-cols-5 gap-4 border-b border-[#2A2C2E] bg-[#161819] px-4 py-3 text-sm font-medium text-zinc-100">
                    <span className="whitespace-nowrap">User</span>
                    <span className="whitespace-nowrap">Type</span>
                    <span className="whitespace-nowrap">Amount</span>
                    <span className="whitespace-nowrap">Date</span>
                    <span className="whitespace-nowrap">Status</span>
                  </div>
                  <div className="px-4">
                    {isLoading && (
                      <>
                        <TransactionSkeletonRow />
                        <TransactionSkeletonRow />
                        <TransactionSkeletonRow />
                      </>
                    )}

                    {!isLoading && transactions.length === 0 && (
                      <div className="py-6 text-sm text-muted-foreground">No wallet transactions found.</div>
                    )}

                    {!isLoading &&
                      paginatedTransactions.map((transaction) => {
                        const isCredit = Number(transaction.tokens) > 0;
                        return (
                          <div key={transaction.id} className="grid grid-cols-5 items-center gap-4 border-b border-[#2A2C2E] py-4 text-sm last:border-b-0">
                            <span>{transaction.account_username}</span>
                            <span className="capitalize">{transaction.reason || "adjustment"}</span>
                            <span className={`${isCredit ? "text-green-700" : "text-red-700"} whitespace-nowrap`}>
                              {isCredit ? "+" : ""}
                              {transaction.tokens}
                            </span>
                            <span className="whitespace-nowrap">{formatDateTime(transaction.created_at)}</span>
                            <span>
                              <Badge variant={isCredit ? "secondary" : "outline"}>
                                {isCredit ? "Credit" : "Debit"}
                              </Badge>
                            </span>
                          </div>
                        );
                      })}
                  </div>
                </div>
              </div>
            </div>

            {!isLoading && transactions.length > 0 && (
              <PaginationControls
                currentPage={currentPage}
                totalItems={transactions.length}
                pageSize={ITEMS_PER_PAGE}
                onPageChange={setCurrentPage}
              />
            )}
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
