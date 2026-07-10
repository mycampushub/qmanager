'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { useAppStore } from '@/stores/app-store';

export function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const { setAuth, setAdminAuth } = useAppStore();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Login failed');
        return;
      }
      // Store csrfToken if present
      if (data.csrfToken) {
        localStorage.setItem('qms_csrf', data.csrfToken);
      }
      // Platform admin → store admin auth + redirect to root
      if (data.user.type === 'platform_admin' || data.user.role === 'PLATFORM_ADMIN') {
        useAppStore.getState().setAdminAuth(
          { id: data.user.id, email: data.user.email, name: data.user.name },
          data.token
        );
        toast.success(`Welcome back, ${data.user.name}!`);
        window.location.href = '/';
        return;
      }
      // Master tenant admin → store MT auth + redirect to root
      if (data.user.type === 'master_tenant_admin' || data.user.role === 'MASTER_TENANT_ADMIN') {
        useAppStore.getState().setMtAuth(
          {
            id: data.user.id,
            email: data.user.email,
            name: data.user.name,
            masterTenantId: data.user.masterTenantId,
            masterTenant: data.user.masterTenant,
          },
          data.token
        );
        toast.success(`Welcome back, ${data.user.name}!`);
        window.location.href = '/';
        return;
      }
      // Staff/Manager/Agent → stay on dashboard
      setAuth(data.user, data.token, data.csrfToken);
      toast.success(`Welcome back, ${data.user.name}!`);
    } catch {
      toast.error('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-emerald-50/30 p-4">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-emerald-600 text-white text-2xl font-bold mb-4">QF</div>
          <h1 className="text-3xl font-bold text-foreground">Login</h1>
          <p className="text-muted-foreground mt-2">Sign in to your account</p>
        </div>
        <Card className="shadow-lg border-slate-200">
          <CardContent className="pt-6">
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" placeholder="manager@quickbiterestaurant.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input id="password" type="password" placeholder="Enter your password" value={password} onChange={(e) => setPassword(e.target.value)} required />
              </div>
              <Button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-700" disabled={loading}>
                {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Sign In
              </Button>
            </form>
            <div className="mt-4 flex gap-2">
              <Button variant="ghost" size="sm" className="text-xs text-muted-foreground" onClick={() => window.location.href = '/'}>
                ← Back to Home
              </Button>
            </div>
          </CardContent>
        </Card>
        <div className="mt-6 text-center">
          <p className="text-xs text-muted-foreground">Agent: agent1@quickbiterestaurant.com / Agent@2024!Secure</p>
          <p className="text-xs text-muted-foreground mt-1">Manager: manager@quickbiterestaurant.com / Manager@2024!Secure</p>
          <p className="text-xs text-muted-foreground mt-1">Platform Admin: admin@yourqueueapp.com / Admin@2024!Secure</p>
          <p className="text-xs text-muted-foreground mt-1">HQ Admin: hq@cityhealthgroup.com / Manager@2024!Secure</p>
        </div>
      </motion.div>
    </div>
  );
}