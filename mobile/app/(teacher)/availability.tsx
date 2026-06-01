import { Feather } from '@expo/vector-icons';
import { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, Text, TextInput, View } from 'react-native';
import { useAuth } from '../../lib/auth';
import { addAvailability, deleteAvailability, fetchAvailability } from '../../lib/api';
import { ErrorBanner } from '../../components/ErrorBanner';
import { LoadingScreen } from '../../components/LoadingScreen';
import { Card } from '../../components/ui/Card';
import { EmptyState } from '../../components/ui/EmptyState';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

type Entry = {
  id: string;
  kind: 'date_range' | 'recurring_weekly';
  start_date: string | null;
  end_date: string | null;
  day_of_week: number | null;
  start_time: string;
  end_time: string;
  notes: string | null;
};

export default function AvailabilityScreen() {
  const { user } = useAuth();
  const teacherId = user!.id;
  const [entries, setEntries] = useState<Entry[]>([]);
  const [kind, setKind] = useState<'date_range' | 'recurring_weekly'>('date_range');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [dayOfWeek, setDayOfWeek] = useState('1');
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('17:00');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const { data, error: err } = await fetchAvailability(teacherId);
    if (err) setError(err.message);
    else setEntries((data as Entry[]) ?? []);
  }, [teacherId]);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  async function save() {
    setError('');
    const { error: err } = await addAvailability(teacherId, {
      kind,
      start_date: kind === 'date_range' ? startDate : null,
      end_date: kind === 'date_range' ? endDate : null,
      day_of_week: kind === 'recurring_weekly' ? parseInt(dayOfWeek, 10) : null,
      start_time: startTime,
      end_time: endTime,
      notes: notes || null,
    });
    if (err) setError(err.message);
    else {
      setNotes('');
      await load();
    }
  }

  async function remove(id: string) {
    await deleteAvailability(teacherId, id);
    await load();
  }

  if (loading) return <LoadingScreen label="Loading availability…" />;

  return (
    <View className="flex-1 bg-canvas">
      <ErrorBanner message={error} onDismiss={() => setError('')} />
      <FlatList
        data={entries}
        keyExtractor={(item) => item.id}
        contentContainerClassName="px-4 pb-8"
        ListHeaderComponent={
          <Card className="mt-3">
            <View className="mb-3 flex-row items-center gap-2">
              <Feather name="calendar" size={20} color="#22C55E" />
              <Text className="text-base font-bold text-slate-900">Add availability</Text>
            </View>
            <View className="mb-3 flex-row gap-2">
              <Pressable
                onPress={() => setKind('date_range')}
                className={`flex-1 rounded-xl py-2.5 ${kind === 'date_range' ? 'bg-accent-blue-500' : 'bg-slate-100'}`}
              >
                <Text
                  className={`text-center text-sm font-medium ${kind === 'date_range' ? 'text-white' : 'text-slate-600'}`}
                >
                  Date range
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setKind('recurring_weekly')}
                className={`flex-1 rounded-xl py-2.5 ${kind === 'recurring_weekly' ? 'bg-accent-green-500' : 'bg-slate-100'}`}
              >
                <Text
                  className={`text-center text-sm font-medium ${kind === 'recurring_weekly' ? 'text-white' : 'text-slate-600'}`}
                >
                  Weekly
                </Text>
              </Pressable>
            </View>

            {kind === 'date_range' ? (
              <>
                <Text className="mb-1 text-xs font-medium text-slate-500">Start date</Text>
                <TextInput
                  className="mb-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5"
                  placeholder="YYYY-MM-DD"
                  value={startDate}
                  onChangeText={setStartDate}
                  placeholderTextColor="#94A3B8"
                />
                <Text className="mb-1 text-xs font-medium text-slate-500">End date</Text>
                <TextInput
                  className="mb-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5"
                  placeholder="YYYY-MM-DD"
                  value={endDate}
                  onChangeText={setEndDate}
                  placeholderTextColor="#94A3B8"
                />
              </>
            ) : (
              <View className="mb-3 flex-row flex-wrap gap-1.5">
                {DAYS.map((d, i) => (
                  <Pressable
                    key={d}
                    onPress={() => setDayOfWeek(String(i))}
                    className={`rounded-lg px-3 py-2 ${dayOfWeek === String(i) ? 'bg-accent-green-500' : 'bg-accent-green-50'}`}
                  >
                    <Text
                      className={`text-xs font-semibold ${dayOfWeek === String(i) ? 'text-white' : 'text-accent-green-700'}`}
                    >
                      {d}
                    </Text>
                  </Pressable>
                ))}
              </View>
            )}

            <View className="flex-row gap-2">
              <View className="flex-1">
                <Text className="mb-1 text-xs font-medium text-slate-500">Start time</Text>
                <TextInput
                  className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5"
                  placeholder="09:00"
                  value={startTime}
                  onChangeText={setStartTime}
                />
              </View>
              <View className="flex-1">
                <Text className="mb-1 text-xs font-medium text-slate-500">End time</Text>
                <TextInput
                  className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5"
                  placeholder="17:00"
                  value={endTime}
                  onChangeText={setEndTime}
                />
              </View>
            </View>
            <TextInput
              className="mt-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5"
              placeholder="Notes (optional)"
              value={notes}
              onChangeText={setNotes}
              placeholderTextColor="#94A3B8"
            />
            <Pressable
              onPress={save}
              className="mt-4 flex-row items-center justify-center gap-2 rounded-xl bg-accent-green-500 py-3"
            >
              <Feather name="clock" size={18} color="#fff" />
              <Text className="font-semibold text-white">Save availability</Text>
            </Pressable>
          </Card>
        }
        ListEmptyComponent={
          <EmptyState
            icon="clock"
            title="No availability set"
            description="Add your teaching hours so administrators can schedule around you."
          />
        }
        renderItem={({ item }) => (
          <Card className="mb-2 mt-2 flex-row items-center gap-3">
            <View className="h-10 w-10 items-center justify-center rounded-xl bg-accent-green-100">
              <Feather name="clock" size={18} color="#16A34A" />
            </View>
            <View className="flex-1">
              {item.kind === 'recurring_weekly' ? (
                <Text className="font-semibold text-slate-900">
                  Every {DAYS[item.day_of_week ?? 0]} · {item.start_time.slice(0, 5)} –{' '}
                  {item.end_time.slice(0, 5)}
                </Text>
              ) : (
                <Text className="font-semibold text-slate-900">
                  {item.start_date} → {item.end_date} · {item.start_time.slice(0, 5)} –{' '}
                  {item.end_time.slice(0, 5)}
                </Text>
              )}
              {item.notes ? <Text className="mt-0.5 text-sm text-slate-500">{item.notes}</Text> : null}
            </View>
            <Pressable onPress={() => remove(item.id)} className="p-2">
              <Feather name="trash-2" size={18} color="#DC2626" />
            </Pressable>
          </Card>
        )}
      />
    </View>
  );
}
