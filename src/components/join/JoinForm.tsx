'use client';

import { User, Phone, Loader2, TicketIcon, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface JoinFormProps {
  customerName: string;
  setCustomerName: (v: string) => void;
  customerPhone: string;
  setCustomerPhone: (v: string) => void;
  primaryColor: string;
  joining: boolean;
  selectedQueue: string | null;
  onSubmit: () => void;
  onBack: () => void;
}

export default function JoinForm({
  customerName,
  setCustomerName,
  customerPhone,
  setCustomerPhone,
  primaryColor,
  joining,
  selectedQueue,
  onSubmit,
  onBack,
}: JoinFormProps) {
  return (
    <div className="flex flex-col gap-4">
      <Label className="text-sm font-semibold">Your Details</Label>

      <div className="flex flex-col gap-2">
        <div className="relative">
          <User className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            placeholder="Your name *"
            className="pl-10 h-12 text-base"
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
            maxLength={100}
          />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <div className="relative">
          <Phone className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <div className="absolute left-10 top-1/2 -translate-y-1/2 text-sm text-muted-foreground font-medium pointer-events-none">
            +880
          </div>
          <Input
            placeholder="Phone number (optional)"
            className="pl-[4.5rem] h-12 text-base"
            value={customerPhone}
            onChange={(e) => setCustomerPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
            type="tel"
            inputMode="numeric"
            maxLength={10}
          />
        </div>
        <p className="text-xs text-muted-foreground">
          Add your phone to look up all your tickets later
        </p>
      </div>

      {/* Actions */}
      <div className="flex flex-col gap-2.5 pt-1">
        <Button
          className="h-12 text-base font-semibold text-white w-full"
          style={{ backgroundColor: primaryColor }}
          onClick={onSubmit}
          disabled={joining || !selectedQueue || !customerName.trim()}
        >
          {joining ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Getting Ticket…
            </>
          ) : (
            <>
              <TicketIcon className="size-4" />
              Get Ticket
            </>
          )}
        </Button>
        <Button variant="ghost" className="h-11 w-full" onClick={onBack}>
          <ArrowLeft className="size-4" />
          Go Back
        </Button>
      </div>
    </div>
  );
}