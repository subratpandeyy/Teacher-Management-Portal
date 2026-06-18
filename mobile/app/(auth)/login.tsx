import { Feather } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../lib/auth';
import { ErrorBanner } from '../../components/ErrorBanner';
import { Logo } from '../../components/Logo';
import { PasswordStrength } from '../../components/PasswordStrength';

export default function LoginScreen() {
  const { signIn, signUp, authRedirectUrl } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ admin?: string; verified?: string }>();
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [role, setRole] = useState<'teacher' | 'student' | 'coordinator'>('teacher');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState(
    params.verified === '1' ? 'Email verified. You can sign in now.' : ''
  );

  const isAdminHint = params.admin === '1';
  const isSignup = mode === 'signup';

  async function handleSubmit() {
    setError('');
    setInfo('');
    setLoading(true);
    const result =
      mode === 'login'
        ? await signIn(email.trim(), password)
        : await signUp(email.trim(), password, displayName.trim(), role);
    setLoading(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    if (mode === 'login') {
      // Route through index so role-based redirects apply after profile loads
      router.replace('/');
    } else {
      setInfo(
        `Check your email to confirm your account. Open the link on this device so the app can complete sign-in (${authRedirectUrl}).`
      );
      setMode('login');
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      className="flex-1 bg-white"
    >
      <View className="absolute inset-0 overflow-hidden">
        <View className="absolute -right-16 -top-16 h-56 w-56 rounded-full bg-accent-blue-50 opacity-80" />
        <View className="absolute -left-12 top-1/3 h-40 w-40 rounded-full bg-accent-green-50 opacity-90" />
        <View className="absolute bottom-0 right-0 h-48 w-48 rounded-full bg-accent-blue-100 opacity-60" />
      </View>

      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          justifyContent: 'center',
          paddingHorizontal: 24,
          paddingTop: insets.top + 24,
          paddingBottom: insets.bottom + 24,
        }}
        keyboardShouldPersistTaps="handled"
      >
        <View className="mb-8 items-center">
          <Logo size={80} />
          <Text className="mt-4 text-center text-2xl font-bold text-slate-900">
            Genieclasses Teachers Portal
          </Text>
          <Text className="mt-2 text-center text-sm text-slate-500">
            {isSignup
              ? 'Create your teacher account to get started.'
              : 'Welcome back — sign in to continue.'}
          </Text>
        </View>

        <View
          className="rounded-2xl border border-slate-100 bg-white p-6"
          style={{
            shadowColor: '#000',
            shadowOpacity: 0.08,
            shadowRadius: 16,
            shadowOffset: { width: 0, height: 4 },
            elevation: 4,
          }}
        >
          {isAdminHint ? (
            <View className="mb-4 flex-row items-start gap-2 rounded-xl bg-accent-blue-50 px-3 py-2.5">
              <Feather name="info" size={16} color="#2563EB" style={{ marginTop: 2 }} />
              <Text className="flex-1 text-xs leading-5 text-accent-blue-700">
                Admins should use the web admin panel. Teachers sign in below.
              </Text>
            </View>
          ) : null}

          {info ? (
            <View className="mb-4 rounded-xl bg-accent-green-50 px-3 py-2.5">
              <Text className="text-sm text-accent-green-700">{info}</Text>
            </View>
          ) : null}

          <ErrorBanner message={error} onDismiss={() => setError('')} />

          {isSignup ? (
            <View className="mb-4">
              <Text className="mb-1.5 text-sm font-medium text-slate-700">I am a...</Text>
              <View className="flex-row gap-2">
                {(['teacher', 'student', 'coordinator'] as const).map((r) => (
                  <Pressable
                    key={r}
                    onPress={() => setRole(r)}
                    className={`flex-1 rounded-xl border py-2.5 items-center ${
                      role === r ? 'bg-accent-blue-50 border-accent-blue-200' : 'bg-slate-50 border-slate-200'
                    }`}
                  >
                    <Text className={`text-xs font-medium capitalize ${role === r ? 'text-accent-blue-700' : 'text-slate-500'}`}>
                      {r}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ) : null}

          {isSignup ? (
            <View className="mb-4">
              <Text className="mb-1.5 text-sm font-medium text-slate-700">Full name</Text>
              <View className="flex-row items-center rounded-xl border border-slate-200 bg-slate-50 px-3">
                <Feather name="user" size={18} color="#94A3B8" />
                <TextInput
                  className="ml-2 flex-1 py-3.5 text-base text-slate-900"
                  placeholder="Your display name"
                  value={displayName}
                  onChangeText={setDisplayName}
                  autoCapitalize="words"
                />
              </View>
            </View>
          ) : null}

          <View className="mb-4">
            <Text className="mb-1.5 text-sm font-medium text-slate-700">Email</Text>
            <View className="flex-row items-center rounded-xl border border-slate-200 bg-slate-50 px-3">
              <Feather name="mail" size={18} color="#94A3B8" />
              <TextInput
                className="ml-2 flex-1 py-3.5 text-base text-slate-900"
                placeholder="you@school.edu"
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
                autoComplete="email"
              />
            </View>
          </View>

          <View className="mb-2">
            <Text className="mb-1.5 text-sm font-medium text-slate-700">Password</Text>
            <View className="flex-row items-center rounded-xl border border-slate-200 bg-slate-50 px-3">
              <Feather name="lock" size={18} color="#94A3B8" />
              <TextInput
                className="ml-2 flex-1 py-3.5 text-base text-slate-900"
                placeholder="••••••••"
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                autoComplete={isSignup ? 'password-new' : 'password'}
              />
              <Pressable onPress={() => setShowPassword((v) => !v)} className="p-2">
                <Feather name={showPassword ? 'eye-off' : 'eye'} size={18} color="#64748B" />
              </Pressable>
            </View>
            {isSignup ? <PasswordStrength password={password} /> : null}
          </View>

          {!isSignup ? (
            <View className="mb-4 flex-row items-center justify-between">
              <Pressable
                onPress={() => setRememberMe((v) => !v)}
                className="flex-row items-center gap-2"
              >
                <View
                  className={`h-5 w-5 items-center justify-center rounded-md border ${rememberMe ? 'border-accent-green-500 bg-accent-green-500' : 'border-slate-300 bg-white'}`}
                >
                  {rememberMe ? <Feather name="check" size={14} color="#fff" /> : null}
                </View>
                <Text className="text-sm text-slate-600">Remember me</Text>
              </Pressable>
              <Pressable
                onPress={() =>
                  Alert.alert(
                    'Forgot password?',
                    'Contact your administrator to reset your password.'
                  )
                }
              >
                <Text className="text-sm font-medium text-accent-blue-600">Forgot password?</Text>
              </Pressable>
            </View>
          ) : null}

          <Pressable
            onPress={handleSubmit}
            disabled={loading}
            className="mt-2 items-center rounded-xl bg-accent-green-500 py-3.5 active:bg-accent-blue-600 disabled:opacity-60"
          >
            <Text className="text-base font-semibold text-white">
              {loading ? 'Please wait…' : isSignup ? 'Create account' : 'Sign in'}
            </Text>
          </Pressable>

          <View className="my-5 flex-row items-center gap-3">
            <View className="h-px flex-1 bg-slate-200" />
            <Text className="text-xs text-slate-400">or</Text>
            <View className="h-px flex-1 bg-slate-200" />
          </View>

          <Pressable
            onPress={() => {
              setMode(isSignup ? 'login' : 'signup');
              setError('');
            }}
            className="items-center rounded-xl border border-slate-200 bg-slate-50 py-3"
          >
            <Text className="text-sm font-semibold text-slate-700">
              {isSignup ? 'Already have an account? Sign in' : 'New teacher? Create account'}
            </Text>
          </Pressable>
        </View>

        <Text className="mt-6 text-center text-xs text-slate-400">
          Secure access for Genieclasses teachers
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
