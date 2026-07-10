'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Loader2, ArrowLeft, Eye, EyeOff, Building2, User, Mail, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { useAppStore } from '@/stores/app-store';

export default function SignupView() {
  const [businessName, setBusinessName] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const passwordChecks = [
    { label: 'At least 8 characters', met: password.length >= 8 },
    { label: 'One uppercase letter', met: /[A-Z]/.test(password) },
    { label: 'One digit', met: /[0-9]/.test(password) },
  ];

  const allChecksMet = passwordChecks.every((c) => c.met);
  const formValid = businessName.trim() && name.trim() && email.trim() && allChecksMet;

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formValid || loading) return;

    setLoading(true);
    try {
      const res = await fetch('/api/tenants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ businessName: businessName.trim(), name: name.trim(), email: email.trim(), password }),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || 'Registration failed');
        return;
      }

      // Auto-login with returned token
      if (data.token && data.user) {
        useAppStore.getState().setAuth(data.user, data.token, data.csrfToken);
        toast.success('Account created successfully! Welcome to QueueFlow!');
        window.location.href = '/dashboard';
      }
    } catch {
      toast.error('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-emerald-50/30 p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md"
      >
        {/* Back link */}
        <Button
          variant="ghost"
          size="sm"
          className="mb-4 text-muted-foreground hover:text-emerald-600"
          onClick={() => useAppStore.getState().setCurrentView('marketing')}
        >
          <ArrowLeft className="w-4 h-4 mr-1" />
          Back to Home
        </Button>

        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-emerald-600 text-white text-2xl font-bold mb-4">
            QF
          </div>
          <h1 className="text-3xl font-bold text-foreground">Create Account</h1>
          <p className="text-muted-foreground mt-2">
            Start your free queue management system
          </p>
        </div>

        <Card className="shadow-lg border-slate-200">
          <CardContent className="pt-6">
            <form onSubmit={handleSignup} className="space-y-4">
              {/* Business Name */}
              <div className="space-y-2">
                <Label htmlFor="businessName">Business Name</Label>
                <div className="relative">
                  <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="businessName"
                    placeholder="e.g. QuickBite Restaurant"
                    value={businessName}
                    onChange={(e) => setBusinessName(e.target.value)}
                    required
                    className="pl-10"
                  />
                </div>
              </div>

              {/* Full Name */}
              <div className="space-y-2">
                <Label htmlFor="name">Full Name</Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="name"
                    placeholder="John Doe"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    className="pl-10"
                  />
                </div>
              </div>

              {/* Email */}
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="manager@yourbusiness.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="pl-10"
                  />
                </div>
              </div>

              {/* Password */}
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Create a strong password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="pl-10 pr-10"
                  />
                  <button
                    type="button"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>

                {/* Password requirements */}
                {password.length > 0 && (
                  <div className="space-y-1.5 pt-1">
                    {passwordChecks.map((check) => (
                      <div
                        key={check.label}
                        className={`flex items-center gap-2 text-xs transition-colors ${
                          check.met ? 'text-emerald-600' : 'text-muted-foreground'
                        }`}
                      >
                        <div
                          className={`h-1.5 w-1.5 rounded-full flex-shrink-0 ${
                            check.met ? 'bg-emerald-600' : 'bg-gray-300'
                          }`}
                        />
                        {check.label}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <Button
                type="submit"
                className="w-full bg-emerald-600 hover:bg-emerald-700 font-semibold"
                disabled={loading || !formValid}
              >
                {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Create Account
              </Button>
            </form>

            <div className="mt-4 text-center">
              <span className="text-sm text-muted-foreground">Already have an account? </span>
              <button
                className="text-sm font-medium text-emerald-600 hover:text-emerald-700 transition-colors"
                onClick={() => window.location.href = '/dashboard'}
              >
                Sign in
              </button>
            </div>
          </CardContent>
        </Card>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Free plan includes 500 tickets credit, 2 queues, and 3 staff members.
          No credit card required.
        </p>
      </motion.div>
    </div>
  );
}