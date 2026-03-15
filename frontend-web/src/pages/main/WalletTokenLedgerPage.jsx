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
  fetchAdminWalletOverview,
  fetchAdminWalletTransactions,
} from "@/services/adminDataService";

const ITEMS_PER_PAGE = 10;

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
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    async function loadWalletData() {
      setIsLoading(true);
      setLoadError("");

      const [overviewResult, transactionsResult] = await Promise.allSettled([
        fetchAdminWalletOverview(),
        fetchAdminWalletTransactions({ limit: 200 }),
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

      if (overviewResult.status === "rejected" || transactionsResult.status === "rejected") {
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

  return (
    <AdminLayout title="Wallet & Token Ledger">
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Wallet & Token Ledger</CardTitle>
            <CardDescription>
              Observe token movement, payouts, and transaction volume across the platform.
            </CardDescription>
            {loadError && <p className="text-sm text-red-600">{loadError}</p>}
          </CardHeader>
        </Card>

        <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {stats.map((item) => (
            <Card key={item.label}>
              <CardHeader className="pb-2">
                <CardDescription>{item.label}</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-semibold">{formatCount(item.value, isLoading)}</p>
              </CardContent>
            </Card>
          ))}
        </section>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Recent Transactions</CardTitle>
            <CardDescription>
              Ledger entries will appear here once backend integration is connected.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border">
              <div className="overflow-x-auto">
                <div className="min-w-[680px]">
                  <div className="grid grid-cols-5 gap-4 border-b bg-muted/40 px-4 py-3 text-sm font-medium">
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
                          <div key={transaction.id} className="grid grid-cols-5 items-center gap-4 border-b py-4 text-sm last:border-b-0">
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
