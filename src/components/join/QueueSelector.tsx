'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Timer } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import type { Tenant, Queue } from '@/lib/types';
import { parseBranding, formatEwt, fadeInUp } from './join-helpers';
import JoinForm from './JoinForm';

interface QueueSelectorProps {
  tenant: Tenant;
  queues: Queue[];
  loading: boolean;
  joining: boolean;
  onJoin: (queueId: string, name: string, phone: string | undefined) => void;
  onBack: () => void;
}

export default function QueueSelector({
  tenant,
  queues,
  loading,
  joining,
  onJoin,
  onBack,
}: QueueSelectorProps) {
  const [selectedQueue, setSelectedQueue] = useState<string | null>(null);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');

  const branding = parseBranding(tenant.brandingConfig);
  const welcomeMsg = branding?.welcomeMessage || tenant.welcomeMessage;
  const primaryColor = branding?.primaryColor || '#059669';

  const handleSubmit = () => {
    if (!selectedQueue) {
      toast.error('Please select a queue');
      return;
    }
    if (!customerName.trim()) {
      toast.error('Please enter your name');
      return;
    }
    const phone = customerPhone.trim() ? `+880${customerPhone.trim().replace(/^880/, '')}` : undefined;
    onJoin(selectedQueue, customerName.trim(), phone);
  };

  return (
    <div className="flex flex-col gap-5">
      {/* Tenant Header */}
      <div className="text-center">
        <h2 className="text-xl font-bold text-foreground">{tenant.name}</h2>
        {welcomeMsg && (
          <p className="text-sm text-muted-foreground mt-1">{welcomeMsg}</p>
        )}
      </div>

      {/* Queue Selection */}
      <div>
        <Label className="text-sm font-semibold mb-2 block">Select a Queue</Label>
        {loading ? (
          <div className="flex flex-col gap-3">
            {[1, 2].map((i) => (
              <Skeleton key={i} className="h-20 w-full rounded-xl" />
            ))}
          </div>
        ) : queues.length === 0 ? (
          <div className="text-center py-8 border border-dashed rounded-xl">
            <p className="text-sm text-muted-foreground">No active queues available</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2.5 max-h-56 overflow-y-auto">
            {queues.map((q, i) => (
              <motion.button
                key={q.id}
                custom={i}
                variants={fadeInUp}
                initial="hidden"
                animate="visible"
                whileTap={{ scale: 0.97 }}
                className="w-full text-left"
                onClick={() => setSelectedQueue(q.id)}
              >
                <Card
                  className={`py-3.5 px-4 transition-all cursor-pointer border-2 ${
                    selectedQueue === q.id
                      ? 'bg-opacity-5 shadow-sm'
                      : 'border-transparent hover:bg-accent/50'
                  }`}
                  style={selectedQueue === q.id ? {
                    borderColor: primaryColor,
                    backgroundColor: `${primaryColor}0D`,
                  } : undefined}
                >
                  <CardContent className="p-0">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className="flex size-10 shrink-0 items-center justify-center rounded-lg text-sm font-bold text-white"
                          style={selectedQueue === q.id ? { backgroundColor: primaryColor } : { backgroundColor: 'var(--muted)' }}
                        >
                          {q.prefix}
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium text-foreground text-sm truncate">{q.name}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {q._waitingCount ?? 0} waiting
                          </p>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Timer className="size-3" />
                          <span>{formatEwt(q._ewt ?? 0)}</span>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.button>
            ))}
          </div>
        )}
      </div>

      <Separator />

      {/* Check-in Form */}
      <JoinForm
        customerName={customerName}
        setCustomerName={setCustomerName}
        customerPhone={customerPhone}
        setCustomerPhone={setCustomerPhone}
        primaryColor={primaryColor}
        joining={joining}
        selectedQueue={selectedQueue}
        onSubmit={handleSubmit}
        onBack={onBack}
      />
    </div>
  );
}