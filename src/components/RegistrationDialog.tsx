'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { useAppStore } from '@/stores/app-store';

export function RegistrationDialog() {
  const { registrationOpen, setRegistrationOpen, setAuth } = useAppStore();
  const [businessName, setBusinessName] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const resetForm = () => {
    setBusinessName('');
    setName('');
    setEmail('');
    setPassword('');
    setConfirmPassword('');
    setErrors({});
  };

  const validate = () => {
    const e: Record<string, string> = {};
    if (!businessName.trim()) e.businessName = 'Business name is required';
    if (!name.trim()) e.name = 'Your name is required';
    if (!email.trim()) e.email = 'Email is required';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) e.email = 'Invalid email format';
    if (!password) e.password = 'Password is required';
    else if (password.length < 8) e.password = 'Password must be at least 8 characters';
    if (password !== confirmPassword) e.confirmPassword = 'Passwords do not match';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!validate()) return;
    setLoading(true);
    try {
      const res = await fetch('/api/tenants/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ businessName, name, email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Registration failed');
        return;
      }
      toast.success('Account created successfully!');
      setRegistrationOpen(false);
      resetForm();
      if (data.user && data.token) {
        setAuth(data.user, data.token);
        window.location.href = '/dashboard';
      }
    } catch {
      toast.error('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={registrationOpen} onOpenChange={(open) => { if (!open) { setRegistrationOpen(false); resetForm(); } }}>
      <DialogContent className="sm:max-w-md">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
          <DialogHeader>
            <DialogTitle className="text-xl">Start Free Trial</DialogTitle>
            <DialogDescription>Create your business account and start managing queues in minutes.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label htmlFor="reg-business">Business Name</Label>
              <Input id="reg-business" placeholder="e.g. CityHealth Clinic" value={businessName} onChange={(e) => setBusinessName(e.target.value)} />
              {errors.businessName && <p className="text-xs text-red-500">{errors.businessName}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="reg-name">Your Name</Label>
              <Input id="reg-name" placeholder="John Doe" value={name} onChange={(e) => setName(e.target.value)} />
              {errors.name && <p className="text-xs text-red-500">{errors.name}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="reg-email">Email</Label>
              <Input id="reg-email" type="email" placeholder="john@cityhealth.com" value={email} onChange={(e) => setEmail(e.target.value)} />
              {errors.email && <p className="text-xs text-red-500">{errors.email}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="reg-password">Password</Label>
              <Input id="reg-password" type="password" placeholder="Min 8 characters" value={password} onChange={(e) => setPassword(e.target.value)} />
              {errors.password && <p className="text-xs text-red-500">{errors.password}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="reg-confirm">Confirm Password</Label>
              <Input id="reg-confirm" type="password" placeholder="Repeat your password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
              {errors.confirmPassword && <p className="text-xs text-red-500">{errors.confirmPassword}</p>}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => { setRegistrationOpen(false); resetForm(); }}>Cancel</Button>
              <Button type="submit" className="bg-emerald-600 hover:bg-emerald-700" disabled={loading}>
                {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Create Account
              </Button>
            </DialogFooter>
          </form>
        </motion.div>
      </DialogContent>
    </Dialog>
  );
}