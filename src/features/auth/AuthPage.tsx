import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { motion } from 'framer-motion'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/app/AuthProvider'
import { signIn, signUp } from '@/services/supabase/auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { APP_NAME } from '@/lib/constants'

const credentialsSchema = z.object({
  email: z.string().email('Enter a valid email address'),
  password: z.string().min(8, 'At least 8 characters'),
})

type Credentials = z.infer<typeof credentialsSchema>

export default function AuthPage() {
  const { user, loading, localOnly } = useAuth()
  if (localOnly) return <Navigate to="/" replace />
  if (!loading && user) return <Navigate to="/" replace />

  return (
    <div className="flex min-h-dvh items-center justify-center px-4 py-10">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: 'easeOut' }}
        className="w-full max-w-sm"
      >
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <svg viewBox="0 0 64 64" className="h-14 w-14" aria-hidden>
            <rect width="64" height="64" rx="16" className="fill-card" />
            <rect
              x="12"
              y="34"
              width="8"
              height="8"
              rx="2"
              className="fill-primary opacity-40"
            />
            <rect
              x="23"
              y="27"
              width="8"
              height="15"
              rx="2"
              className="fill-primary opacity-60"
            />
            <rect
              x="34"
              y="20"
              width="8"
              height="22"
              rx="2"
              className="fill-primary opacity-80"
            />
            <rect x="45" y="13" width="8" height="29" rx="2" className="fill-primary" />
          </svg>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">{APP_NAME}</h1>
            <p className="text-muted-foreground mt-1 text-sm">
              Build streaks. Keep promises to yourself.
            </p>
          </div>
        </div>

        <Tabs defaultValue="signin">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="signin">Sign in</TabsTrigger>
            <TabsTrigger value="signup">Sign up</TabsTrigger>
          </TabsList>
          <TabsContent value="signin">
            <CredentialsForm mode="signin" />
          </TabsContent>
          <TabsContent value="signup">
            <CredentialsForm mode="signup" />
          </TabsContent>
        </Tabs>
      </motion.div>
    </div>
  )
}

function CredentialsForm({ mode }: { mode: 'signin' | 'signup' }) {
  const navigate = useNavigate()
  const [submitting, setSubmitting] = useState(false)
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<Credentials>({ resolver: zodResolver(credentialsSchema) })

  const onSubmit = handleSubmit(async ({ email, password }) => {
    setSubmitting(true)
    try {
      if (mode === 'signup') {
        await signUp(email, password)
        toast.success('Account created', {
          description: 'Check your inbox to confirm your email, then sign in.',
        })
      } else {
        await signIn(email, password)
        navigate('/', { replace: true })
      }
    } catch (err) {
      toast.error(mode === 'signup' ? 'Sign up failed' : 'Sign in failed', {
        description: err instanceof Error ? err.message : 'Please try again.',
      })
    } finally {
      setSubmitting(false)
    }
  })

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <div className="space-y-1.5">
        <Label htmlFor={`${mode}-email`}>Email</Label>
        <Input
          id={`${mode}-email`}
          type="email"
          autoComplete="email"
          inputMode="email"
          placeholder="you@example.com"
          {...register('email')}
        />
        {errors.email ? (
          <p className="text-destructive text-xs">{errors.email.message}</p>
        ) : null}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${mode}-password`}>Password</Label>
        <Input
          id={`${mode}-password`}
          type="password"
          autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
          placeholder="â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢"
          {...register('password')}
        />
        {errors.password ? (
          <p className="text-destructive text-xs">{errors.password.message}</p>
        ) : null}
      </div>
      <Button type="submit" className="w-full" size="lg" disabled={submitting}>
        {submitting ? <Loader2 className="animate-spin" /> : null}
        {mode === 'signup' ? 'Create account' : 'Sign in'}
      </Button>
    </form>
  )
}

