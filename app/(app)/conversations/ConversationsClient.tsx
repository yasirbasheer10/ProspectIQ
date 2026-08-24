"use client";

import { useState, useTransition } from "react";
import { Topbar } from "@/components/layout/Topbar";
import { EmptyState } from "@/components/ui/EmptyState";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { MessageSquare, Send, Sparkles, CheckCircle2, Bot, X, AlertTriangle } from "lucide-react";
import { simulateReplyAction, processConversationAction } from "./actions";

interface ConversationsClientProps {
// eslint-disable-next-line @typescript-eslint/no-explicit-any
  conversations: any[];
  /** Passed down from the server page so the button says what it does. */
  outboundSendingEnabled: boolean;
}

export function ConversationsClient({ conversations, outboundSendingEnabled }: ConversationsClientProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [showSimulateModal, setShowSimulateModal] = useState(false);

  const selectedConv = conversations.find(c => c.id === selectedId);

  const handleSimulate = (intent: string) => {
    if (!selectedId) return;
    startTransition(async () => {
      await simulateReplyAction(selectedId, intent);
      setShowSimulateModal(false);
    });
  };

  const handleAction = (messageId: string, action: "APPROVE" | "REJECT" | "MANUAL") => {
    startTransition(async () => {
      await processConversationAction(messageId, action);
    });
  };

  const intents = [
    "INTERESTED", "QUESTION", "OBJECTION", "NOT_NOW", 
    "MEETING_REQUEST", "REFERRAL", "NEGATIVE", "UNSUBSCRIBE"
  ];

  return (
    <div className="flex h-full flex-col bg-white overflow-hidden relative">
      <Topbar 
        title="Conversations" 
        actions={
          selectedId ? (
            <Button 
              variant="secondary" 
              size="sm" 
              onClick={() => setShowSimulateModal(true)}
              icon={Bot}
            >
              Simulate Reply
            </Button>
          ) : undefined
        }
      />
      
      <main className="flex-1 overflow-hidden flex bg-[#F5F5F7]">
        {conversations.length === 0 ? (
          <div className="flex-1 flex items-center justify-center">
            <EmptyState
              icon={MessageSquare}
              title="Inbox Empty"
              description="Replies from your outreach campaigns will appear here. Your AI agent will automatically classify sentiment and draft suggested responses."
            />
          </div>
        ) : (
          <div className="flex w-full h-full">
            {/* List Pane */}
            <div className={`w-full md:w-[400px] border-r border-[#E5E5EA] bg-[#F5F5F7] flex flex-col h-full overflow-y-auto ${selectedId ? 'hidden md:flex' : 'flex'}`}>
              <div className="p-4 space-y-3">
                {conversations.map(conv => {
                  const isSelected = conv.id === selectedId;
                  return (
                    <div 
                      key={conv.id} 
                      onClick={() => setSelectedId(conv.id)}
                      className={`p-4 rounded-[12px] cursor-pointer transition-all border ${isSelected ? 'bg-white border-[#0071E3] shadow-sm' : 'bg-white border-[#E5E5EA] hover:border-[#0071E3]/50'}`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="text-[14px] font-medium text-[#1D1D1F]">{conv.contact?.firstName} {conv.contact?.lastName}</h3>
                        {conv.lastClassification && (
                          <Badge variant={conv.lastClassification === 'UNSUBSCRIBE' ? 'danger' : 'info'} className="text-[10px]">
                            {conv.lastClassification}
                          </Badge>
                        )}
                      </div>
                      <div className="text-[12px] font-medium text-[#1D1D1F] mb-1 truncate">{conv.subject}</div>
                      <div className="text-[12px] text-[#86868B] line-clamp-2">
                        {conv.messages[0]?.body || "No messages yet."}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Detail Pane */}
            <div className={`flex-1 bg-white h-full overflow-y-auto flex-col ${!selectedId ? 'hidden md:flex items-center justify-center' : 'flex'}`}>
              {!selectedConv ? (
                <div className="text-center text-[#86868B]">
                  <MessageSquare size={48} className="mx-auto mb-4 opacity-20" />
                  <p>Select a conversation to view details</p>
                </div>
              ) : (
                <div className="flex flex-col h-full relative">
                  {/* Header */}
                  <div className="p-6 border-b border-[#E5E5EA] flex items-center justify-between bg-white shrink-0">
                    <div>
                      <h2 className="text-lg font-medium text-[#1D1D1F]">{selectedConv.subject}</h2>
                      <p className="text-[13px] text-[#86868B]">
                        {selectedConv.contact?.firstName} {selectedConv.contact?.lastName} &middot; {selectedConv.contact?.company?.name || "Company"}
                      </p>
                    </div>
                    {selectedConv.contact?.isUnsubscribed && (
                      <Badge variant="danger">Unsubscribed</Badge>
                    )}
                  </div>

                  {/* Messages */}
                  <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                    {selectedConv.messages.map((msg: any) => (
                      <div key={msg.id} className={`flex flex-col max-w-[85%] ${msg.direction === 'outbound' ? 'ml-auto items-end' : 'mr-auto items-start'}`}>
                        <div className={`p-4 rounded-2xl ${msg.direction === 'outbound' ? 'bg-[#0071E3] text-white rounded-br-sm' : 'bg-[#F5F5F7] text-[#1D1D1F] rounded-bl-sm border border-[#E5E5EA]'}`}>
                          <p className="text-[14px] leading-relaxed whitespace-pre-wrap">{msg.body}</p>
                        </div>
                        <div className="text-[11px] text-[#86868B] mt-2 flex items-center gap-2">
                          {msg.direction === 'outbound' ? 'You' : selectedConv.contact?.firstName} &middot; {new Date(msg.sentAt).toLocaleTimeString()}
                          {msg.classification && msg.direction === 'inbound' && (
                            <span className="text-[#0071E3] font-medium ml-2">Classified: {msg.classification}</span>
                          )}
                        </div>

                        {/* AI Insight Box for inbound messages */}
                        {msg.direction === 'inbound' && selectedConv.suggestedAction && msg.id === selectedConv.messages[selectedConv.messages.length - 1].id && (
                          <div className="mt-4 p-5 bg-[#F5F8FF] border border-[#E5EDFF] rounded-[16px] w-full md:min-w-[400px]">
                            <div className="flex items-center gap-2 mb-3">
                              <Sparkles size={16} className="text-[#0071E3]" />
                              <h4 className="text-[13px] font-semibold text-[#0071E3] uppercase tracking-wider">AI Intelligence</h4>
                            </div>
                            
                            <div className="mb-4">
                              <span className="text-[12px] text-[#86868B] uppercase tracking-wider block mb-1">Recommended Action</span>
                              <p className="text-[14px] font-medium text-[#1D1D1F]">{selectedConv.suggestedAction}</p>
                            </div>

                            {msg.suggestedReply && (
                              <div className="bg-white border border-[#E5E5EA] rounded-xl p-4 mb-4">
                                <span className="text-[12px] text-[#86868B] uppercase tracking-wider block mb-2">Drafted Response</span>
                                <textarea 
                                  defaultValue={msg.suggestedReply}
                                  className="w-full text-[14px] text-[#1D1D1F] focus:outline-none resize-none"
                                  rows={4}
                                />
                              </div>
                            )}

                            {/* Approving records the reply in the thread, which is
                                real work. It does not email it — the button used to
                                say "Approve & Send" regardless. */}
                            {!outboundSendingEnabled && (
                              <div className="mb-4 flex items-start gap-3 rounded-xl border border-[#B25000]/20 bg-[#B25000]/[0.06] p-3">
                                <AlertTriangle size={16} className="mt-0.5 shrink-0 text-[#B25000]" />
                                <p className="text-[12px] leading-relaxed text-[#B25000]">
                                  <span className="font-semibold">Sending is not enabled.</span> An approved
                                  reply is recorded on this thread, but nothing is emailed.
                                </p>
                              </div>
                            )}

                            <div className="flex items-center gap-3 flex-wrap">
                              {selectedConv.lastClassification !== 'UNSUBSCRIBE' && (
                                <Button
                                  variant="primary"
                                  size="sm"
                                  icon={outboundSendingEnabled ? Send : CheckCircle2}
                                  loading={isPending}
                                  onClick={() => handleAction(msg.id, "APPROVE")}
                                >
                                  {outboundSendingEnabled ? "Approve & Send" : "Approve reply"}
                                </Button>
                              )}
                              <Button 
                                variant="secondary" 
                                size="sm"
                                loading={isPending}
                                onClick={() => handleAction(msg.id, "MANUAL")}
                              >
                                Take Over Manually
                              </Button>
                              <Button 
                                variant="danger" 
                                size="sm" 
                                className="md:ml-auto"
                                loading={isPending}
                                onClick={() => handleAction(msg.id, "REJECT")}
                              >
                                Reject
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* Simulate Modal */}
      {showSimulateModal && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm p-4">
          <div className="bg-white rounded-[20px] shadow-2xl p-6 w-full max-w-[400px] border border-[#E5E5EA]">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-lg font-medium text-[#1D1D1F]">Simulate Inbound Reply</h3>
              <Button variant="ghost" size="sm" icon={X} onClick={() => setShowSimulateModal(false)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              {intents.map(intent => (
                <button
                  key={intent}
                  disabled={isPending}
                  onClick={() => handleSimulate(intent)}
                  className="p-3 text-[13px] font-medium text-center border border-[#E5E5EA] rounded-xl hover:bg-[#F5F8FF] hover:border-[#0071E3] hover:text-[#0071E3] transition-colors disabled:opacity-50"
                >
                  {intent}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
