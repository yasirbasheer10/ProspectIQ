"use client";

import { useState, useTransition } from "react";
import { Topbar } from "@/components/layout/Topbar";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { User, Building2, Link2, UploadCloud, CheckCircle2, Save } from "lucide-react";
import { updateUserProfile } from "./actions";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function ProfileClient({ user }: { user: any }) {
  const [isPending, startTransition] = useTransition();
  const [isSuccess, setIsSuccess] = useState(false);
  
  const [formData, setFormData] = useState({
    accountType: user.accountType || "COMPANY",
    linkedInUrl: user.linkedInUrl || "",
    demographics: user.demographics || "",
  });

  const handleSave = () => {
    startTransition(async () => {
      // No user ID passed — the action takes identity from the session.
      await updateUserProfile(formData);
      setIsSuccess(true);
      setTimeout(() => setIsSuccess(false), 3000);
    });
  };

  const handleFetchMock = () => {
    if (!formData.linkedInUrl) return;
    setFormData({
      ...formData,
      demographics: "Fetched from LinkedIn:\n- 10+ years in Enterprise Sales\n- Worked at Oracle, Salesforce\n- Focus: B2B SaaS, E-commerce, Fintech\n- Target Audience: VP of Sales, CROs\n\n(This is mock data acting as demographics based on the linkedIn URL)"
    });
  };

  return (
    <div className="flex h-full flex-col bg-white">
      <Topbar title="Profile & Identity" />
      <main className="flex-1 overflow-y-auto p-8 bg-[#F5F5F7]">
        <div className="mx-auto max-w-3xl space-y-8">
          
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#0071E3] text-white shadow-sm">
                <User size={24} />
              </div>
              <div>
                <h1 className="text-2xl font-semibold text-[#1D1D1F] tracking-tight">Identity Settings</h1>
                <p className="text-[14px] text-[#86868B] mt-0.5">Tell the AI who you are so it can target your specific needs.</p>
              </div>
            </div>
            
            <Button 
              onClick={handleSave} 
              disabled={isPending}
              className="bg-[#1D1D1F] hover:bg-[#000000] text-white"
              icon={isSuccess ? CheckCircle2 : Save}
            >
              {isPending ? "Saving..." : isSuccess ? "Saved!" : "Save Profile"}
            </Button>
          </div>

          <div className="space-y-6">
            
            {/* Account Type */}
            <Card className="p-6 border-[#E5E5EA]">
              <h3 className="text-[15px] font-semibold text-[#1D1D1F] mb-4">I am a...</h3>
              <div className="grid grid-cols-2 gap-4">
                <div 
                  onClick={() => setFormData({...formData, accountType: "COMPANY"})}
                  className={`flex flex-col items-center justify-center p-6 rounded-[12px] border cursor-pointer transition-all ${
                    formData.accountType === "COMPANY" 
                      ? 'border-[#0071E3] bg-[#F4F9FF]' 
                      : 'border-[#E5E5EA] bg-white hover:border-[#D1D1D6]'
                  }`}
                >
                  <Building2 size={32} className={`mb-3 ${formData.accountType === "COMPANY" ? "text-[#0071E3]" : "text-[#86868B]"}`} />
                  <span className={`font-medium ${formData.accountType === "COMPANY" ? "text-[#0071E3]" : "text-[#1D1D1F]"}`}>Company</span>
                  <span className="text-[12px] text-[#86868B] mt-1 text-center">I represent an agency or product</span>
                </div>
                
                <div 
                  onClick={() => setFormData({...formData, accountType: "PERSON"})}
                  className={`flex flex-col items-center justify-center p-6 rounded-[12px] border cursor-pointer transition-all ${
                    formData.accountType === "PERSON" 
                      ? 'border-[#0071E3] bg-[#F4F9FF]' 
                      : 'border-[#E5E5EA] bg-white hover:border-[#D1D1D6]'
                  }`}
                >
                  <User size={32} className={`mb-3 ${formData.accountType === "PERSON" ? "text-[#0071E3]" : "text-[#86868B]"}`} />
                  <span className={`font-medium ${formData.accountType === "PERSON" ? "text-[#0071E3]" : "text-[#1D1D1F]"}`}>Individual</span>
                  <span className="text-[12px] text-[#86868B] mt-1 text-center">I am an independent consultant/freelancer</span>
                </div>
              </div>
            </Card>

            {/* LinkedIn Connection */}
            <Card className="p-6 border-[#E5E5EA]">
              <h3 className="text-[15px] font-semibold text-[#1D1D1F] mb-1">LinkedIn Connection</h3>
              <p className="text-[13px] text-[#86868B] mb-4">Link your profile to automatically pull your demographics and area of work.</p>
              
              <div className="flex gap-3">
                <div className="relative flex-1">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Link2 size={18} className="text-[#0A66C2]" />
                  </div>
                  <input 
                    type="text" 
                    value={formData.linkedInUrl}
                    onChange={(e) => setFormData({...formData, linkedInUrl: e.target.value})}
                    placeholder="https://linkedin.com/in/username"
                    className="w-full h-10 pl-10 pr-3 bg-[#F9F9FB] border border-[#E5E5EA] rounded-[8px] text-[14px] outline-none focus:border-[#0A66C2] focus:ring-1 focus:ring-[#0A66C2] transition-all"
                  />
                </div>
                <Button 
                  onClick={handleFetchMock}
                  disabled={!formData.linkedInUrl}
                  variant="secondary"
                  className="bg-[#0A66C2] hover:bg-[#004182] text-white border-0"
                >
                  Fetch Data
                </Button>
              </div>
            </Card>

            {/* Manual Demographics Upload */}
            <Card className="p-6 border-[#E5E5EA]">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-[15px] font-semibold text-[#1D1D1F]">Demographics & Information</h3>
                  <p className="text-[13px] text-[#86868B] mt-0.5">The AI will use this data to target your specific area of work.</p>
                </div>
                <Button variant="ghost" size="sm" icon={UploadCloud}>Upload CV/Deck</Button>
              </div>
              
              <textarea 
                value={formData.demographics}
                onChange={(e) => setFormData({...formData, demographics: e.target.value})}
                placeholder="Describe your target market, past experience, and exact services you offer. You can also paste your resume or company summary here."
                className="w-full p-4 bg-[#F9F9FB] border border-[#E5E5EA] rounded-[8px] text-[14px] outline-none focus:border-[#0071E3] focus:ring-1 focus:ring-[#0071E3] transition-all min-h-[200px] resize-y"
              />
            </Card>

          </div>
        </div>
      </main>
    </div>
  );
}
