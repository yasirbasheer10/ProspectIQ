"use client";

import { useState, useTransition } from "react";
import { Topbar } from "@/components/layout/Topbar";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Check, X, Filter, Edit2, Info, Save } from "lucide-react";
import { updateOutreachStatus } from "./actions";

interface OutreachClientProps {
// eslint-disable-next-line @typescript-eslint/no-explicit-any
  initialQueue: any[];
  /** Passed down from the server page so the button says what it does. */
  outboundSendingEnabled: boolean;
}

export function OutreachClient({ initialQueue, outboundSendingEnabled }: OutreachClientProps) {
  const [queue, setQueue] = useState(initialQueue);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState("");
  const [isPending, startTransition] = useTransition();

  const handleAction = (id: string, action: 'APPROVE' | 'REJECT', newBody?: string) => {
    // Optimistically remove from UI queue
    setQueue(prev => prev.filter(msg => msg.id !== id));
    
    startTransition(async () => {
      await updateOutreachStatus(id, action === 'APPROVE' ? 'APPROVED' : 'REJECTED', newBody);
    });
  };

  const startEdit = (id: string, body: string) => {
    setEditingId(id);
    setEditBody(body);
  };

  const saveEdit = (id: string) => {
    startTransition(async () => {
      await updateOutreachStatus(id, 'DRAFT', editBody);
      setQueue(prev => prev.map(msg => msg.id === id ? { ...msg, preview: editBody } : msg));
      setEditingId(null);
    });
  };

  return (
    <div className="flex h-full flex-col bg-white">
      <Topbar 
        title="Outreach Studio" 
        actions={<Button variant="secondary" size="sm" icon={Filter}>Filter</Button>}
      />
      
      <main className="flex-1 overflow-y-auto p-8 bg-[#F5F5F7]">
        <div className="mx-auto max-w-5xl space-y-8">
          
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-medium text-[#1D1D1F]">Approval Queue</h3>
              <Badge variant="warning">{queue.length} Pending</Badge>
            </div>

            {/* The primary button used to read "Approve & Send" while nothing
                sent. Approving is real and worth doing — it's the human review
                step — but the queue has to say where an approved draft goes. */}
            {!outboundSendingEnabled && (
              <div className="mb-4 flex items-start gap-3 rounded-xl border border-[#B25000]/20 bg-[#B25000]/[0.06] p-4">
                <Info size={18} className="mt-0.5 shrink-0 text-[#B25000]" />
                <p className="text-[13px] leading-relaxed text-[#B25000]">
                  <span className="font-semibold">Sending is not enabled.</span> Approved drafts are
                  saved and marked approved, but nothing is emailed — there is no send path yet.
                </p>
              </div>
            )}


            {queue.length > 0 ? (
              <div className="space-y-4">
                {queue.map(msg => (
                  <Card key={msg.id} className="p-6 transition-all duration-300">
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#E5E5EA] text-[#4B5563] font-medium text-[14px]">
                          {msg.contact.split(' ').map((n: string) => n[0]).join('')}
                        </div>
                        <div>
                          <p className="text-[15px] font-medium text-[#1D1D1F]">{msg.contact}</p>
                          <p className="text-[13px] text-[#86868B]">{msg.company}</p>
                        </div>
                      </div>
                      <Badge variant="warning">Pending Review</Badge>
                    </div>
                    
                    <div className="rounded-lg border border-[#E5E5EA] bg-[#F5F5F7] p-4 mb-4">
                      <p className="text-[13px] font-medium text-[#1D1D1F] mb-2">Subject: {msg.subject}</p>
                      {editingId === msg.id ? (
                        <textarea
                          className="w-full min-h-[150px] p-3 text-[13px] text-[#4B5563] border border-[#E5E5EA] rounded-md focus:ring-1 focus:ring-[#0071E3] focus:border-[#0071E3] outline-none"
                          value={editBody}
                          onChange={(e) => setEditBody(e.target.value)}
                        />
                      ) : (
                        <p className="text-[13px] text-[#4B5563] whitespace-pre-wrap">{msg.preview}</p>
                      )}
                    </div>
                    
                    <div className="flex gap-3">
                      {editingId === msg.id ? (
                        <>
                          <Button variant="primary" size="sm" icon={Save} onClick={() => saveEdit(msg.id)} loading={isPending}>Save</Button>
                          <Button variant="ghost" size="sm" icon={X} onClick={() => setEditingId(null)}>Cancel</Button>
                        </>
                      ) : (
                        <>
                          <Button variant="primary" size="sm" icon={Check} onClick={() => handleAction(msg.id, 'APPROVE')} disabled={isPending}>
                            {outboundSendingEnabled ? "Approve & Send" : "Approve"}
                          </Button>
                          <Button variant="secondary" size="sm" icon={Edit2} onClick={() => startEdit(msg.id, msg.preview)} disabled={isPending}>Edit Draft</Button>
                          <Button variant="ghost" size="sm" icon={X} className="text-[#FF3B30]" onClick={() => handleAction(msg.id, 'REJECT')} disabled={isPending}>Reject</Button>
                        </>
                      )}
                    </div>
                  </Card>
                ))}
              </div>
            ) : (
              <Card className="p-16 text-center">
                <div className="flex justify-center mb-4 text-[#34C759]">
                  <Check size={48} />
                </div>
                <h3 className="text-xl font-medium text-[#1D1D1F] mb-2">Nothing pending approval</h3>
                <p className="text-[#86868B] text-[15px]">
                  Drafts appear here once an agent run produces them. Start one from Discovery or
                  Deploy.
                </p>
              </Card>
            )}
          </div>
          
        </div>
      </main>
    </div>
  );
}
