'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Loader2, ArrowLeft, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { useAppStore } from '@/stores/app-store';

export function SignupScreen() {
  const [businessName, setBusinessName] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const { setAuth } = useAppStore();

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();

    if (password.length < 8) {
      toast.error('Password must be at least 8 characters');
      return;
    }
    if (!/[A-Z]/.test(password)) {
      toast.error('Password must contain at least one uppercase letter');
      return;
    }
    if (!/[0-9]/.test(password)) {
      toast.error('Password must contain at least one digit');
      return;
    }
    if (password !== confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/tenants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ businessName, name, email, password }),
      });
      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || 'Registration failed');
        return;
      }

      // Auto-login on successful registration
      if (data.token && data.user) {
        if (data.csrfToken) {
          localStorage.setItem('qms_csrf', data.csrfToken);
        }
        setAuth(data.user, data.token, data.csrfToken);
        toast.success(`Welcome to QueueFlow, ${data.user.name}!`);
        setSuccess(true);
        // Redirect to dashboard after a short delay
        setTimeout(() => {
          window.location.href = '/dashboard';
        }, 1500);
      }
    } catch {
      toast.error('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-emerald-50/30 p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center max-w-md"
        >
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 mb-4">
            <CheckCircle2 className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-bold text-foreground mb-2">Account Created!</h1>
          <p className="text-muted-foreground">Redirecting to your dashboard...</p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-emerald-50/30 p-4">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-emerald-600 text-white text-2xl font-bold mb-4">QF</div>
          <h1 className="text-3xl font-bold text-foreground">Create Your Account</h1>
          <p className="text-muted-foreground mt-2">Start your free trial — no credit card required</p>
        </div>
        <Card className="shadow-lg border-slate-200">
          <CardHeader className="pb-4">
            <CardTitle className="text-lg">Business Registration</CardTitle>
            <CardDescription>Set up your queue management in under 2 minutes</CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <form onSubmit={handleSignup} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="businessName">Business Name *</Label>
                <Input
                  id="businessName"
                  placeholder="e.g. QuickBite Restaurant"
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="name">Your Full Name *</Label>
                <Input
                  id="name"
                  placeholder="e.g. John Smith"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email *</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@business.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password *</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="Min 8 chars, 1 uppercase, 1 digit"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirm Password *</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  placeholder="Re-enter your password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  minLength={8}
                />
              </div>
              <Button
                type="submit"
                className="w-full bg-emerald-600 hover:bg-emerald-700"
                disabled={loading}
              >
                {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Create Account & Start Free Trial
              </Button>
            </form>
            <div className="mt-4 flex gap-2">
              <Button
                variant="ghost"
                size="sm"
                className="text-xs text-muted-foreground"
                onClick={() => window.location.href = '/dashboard'}
              >
                <ArrowLeft className="w-3 h-3 mr-1" />
                Back to Login
              </Button>
            </div>
          </CardContent>
        </Card>
        <p className="mt-4 text-center text-xs text-muted-foreground">
          By signing up, you agree to our Terms of Service and Privacy Policy.
        </p>
      </motion.div>
    </div>
  );
}