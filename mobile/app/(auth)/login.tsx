import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useAuth } from '../../lib/auth';
import { ErrorBanner } from '../../components/ErrorBanner';

export default function LoginScreen() {
  const { signIn, signUp, authRedirectUrl } = useAuth();
  const router = useRouter();
  const params = useLocalSearchParams<{ admin?: string; verified?: string }>();
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState(
    params.verified === '1' ? 'Email verified. You can sign in now.' : ''
  );

  const isAdminHint = params.admin === '1';

  async function handleSubmit() {
    setError('');
    setInfo('');
    setLoading(true);
    const result =
      mode === 'login'
        ? await signIn(email.trim(), password)
        : await signUp(email.trim(), password, displayName.trim());
    setLoading(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    if (mode === 'login') {
      router.replace('/(teacher)/inbox');
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
      className="flex-1 bg-slate-50"
    >
      <ScrollView
        contentContainerClassName="flex-grow justify-center px-6 py-12"
        keyboardShouldPersistTaps="handled"
      >
        <Text className="text-3xl font-bold text-slate-900">GenieClasses Teacher Portal</Text>
        <Text className="mt-2 text-slate-600">
          {isAdminHint
            ? 'Admins should use the web admin panel. Teachers sign in below.'
            : 'Sign in to view your inbox, documents, and messages.'}
        </Text>

        {info ? (
          <Text className="mt-4 rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-800">
            {info}
          </Text>
        ) : null}

        <ErrorBanner message={error} onDismiss={() => setError('')} />

        {mode === 'signup' ? (
          <TextInput
            className="mt-4 rounded-xl border border-slate-200 bg-white px-4 py-3"
            placeholder="Display name"
            value={displayName}
            onChangeText={setDisplayName}
            autoCapitalize="words"
          />
        ) : null}

        <TextInput
          className="mt-4 rounded-xl border border-slate-200 bg-white px-4 py-3"
          placeholder="Email"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
        />
        <TextInput
          className="mt-3 rounded-xl border border-slate-200 bg-white px-4 py-3"
          placeholder="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />

        <Pressable
          onPress={handleSubmit}
          disabled={loading}
          className="mt-6 items-center rounded-xl bg-brand-600 py-3.5 disabled:opacity-60"
        >
          <Text className="font-semibold text-white">
            {loading ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}
          </Text>
        </Pressable>

        <Pressable
          onPress={() => setMode(mode === 'login' ? 'signup' : 'login')}
          className="mt-4 items-center"
        >
          <Text className="text-brand-600">
            {mode === 'login' ? 'New teacher? Create account' : 'Already have an account? Sign in'}
          </Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
