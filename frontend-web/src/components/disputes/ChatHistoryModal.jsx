import { useEffect, useState } from "react";
import { X, MessageCircle } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { fetchChatHistory } from "@/services/adminDataService";

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString();
}

function parseMessageContent(content) {
  try {
    const parsed = JSON.parse(content);
    if (parsed.type === "backjob_request") {
      return `[Backjob Request] ${parsed.reason || "No reason provided"}`;
    }
    return parsed.content || content;
  } catch {
    return content;
  }
}

export function ChatHistoryModal({ isOpen, onClose, bookingId, clientName, mechanicName }) {
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isOpen || !bookingId) return;

    async function loadMessages() {
      setIsLoading(true);
      setError("");
      try {
        const data = await fetchChatHistory(bookingId);
        setMessages(data?.messages || []);
      } catch (err) {
        setError(err.message || "Failed to load chat history.");
      } finally {
        setIsLoading(false);
      }
    }

    loadMessages();
  }, [isOpen, bookingId]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4">
      <div
        className="relative w-full max-w-3xl overflow-hidden rounded-xl border border-border bg-background shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div className="flex items-center gap-3">
            <MessageCircle className="size-5 text-primary" />
            <div>
              <h3 className="text-lg font-semibold text-foreground">Chat History</h3>
              <p className="text-sm text-muted-foreground">
                Booking #{bookingId} • {clientName || "Client"} vs {mechanicName || "Mechanic"}
              </p>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8">
            <X className="size-4" />
          </Button>
        </div>

        {/* Content */}
        <div className="max-h-[70vh] overflow-y-auto p-6">
          {isLoading ? (
            <div className="space-y-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="animate-pulse space-y-2">
                  <div className="h-4 w-32 rounded bg-muted" />
                  <div className="h-16 rounded bg-muted" />
                </div>
              ))}
            </div>
          ) : error ? (
            <div className="rounded-md border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
              {error}
            </div>
          ) : messages.length === 0 ? (
            <div className="text-center py-8">
              <MessageCircle className="mx-auto size-12 text-muted-foreground/30" />
              <p className="mt-3 text-muted-foreground">No messages found for this booking.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {messages.map((msg, index) => {
                const isClient = msg.sender_name?.toLowerCase().includes(clientName?.toLowerCase()) ||
                                 msg.sender_role === "client";
                const isSystem = msg.content?.startsWith("{");

                return (
                  <div
                    key={msg.id || index}
                    className={`flex flex-col gap-1 ${
                      isClient ? "items-start" : "items-end"
                    }`}
                  >
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">
                        {msg.sender_name || "Unknown"}
                      </span>
                      <span>•</span>
                      <span>{formatDate(msg.created_at)}</span>
                    </div>
                    <div
                      className={`max-w-[85%] rounded-lg px-4 py-2.5 text-sm ${
                        isSystem
                          ? "bg-amber-500/10 border border-amber-500/30 text-amber-200"
                          : isClient
                          ? "bg-muted border border-border"
                          : "bg-primary/10 border border-primary/30 text-primary"
                      }`}
                    >
                      {parseMessageContent(msg.content)}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-border px-6 py-3 bg-muted/30">
          <p className="text-xs text-muted-foreground">
            Showing {messages.length} message{messages.length !== 1 ? "s" : ""}
          </p>
        </div>
      </div>
    </div>
  );
}
