import { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, Text, TextInput, View } from 'react-native';
import { useAuth } from '../../lib/auth';
import { addAvailability, deleteAvailability, fetchAvailability } from '../../lib/api';
import { ErrorBanner } from '../../components/ErrorBanner';
import { LoadingScreen } from '../../components/LoadingScreen';

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
    <View className="flex-1 bg-slate-50">
      <ErrorBanner message={error} onDismiss={() => setError('')} />
      <View className="border-b border-slate-200 bg-white p-4">
        <Text className="mb-2 font-semibold text-slate-900">Add availability</Text>
        <View className="mb-3 flex-row gap-2">
          <Pressable
            onPress={() => setKind('date_range')}
            className={`flex-1 rounded-lg py-2 ${kind === 'date_range' ? 'bg-brand-600' : 'bg-slate-200'}`}
          >
            <Text className={`text-center text-sm ${kind === 'date_range' ? 'text-white' : 'text-slate-700'}`}>
              Date range
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setKind('recurring_weekly')}
            className={`flex-1 rounded-lg py-2 ${kind === 'recurring_weekly' ? 'bg-brand-600' : 'bg-slate-200'}`}
          >
            <Text className={`text-center text-sm ${kind === 'recurring_weekly' ? 'text-white' : 'text-slate-700'}`}>
              Weekly recurring
            </Text>
          </Pressable>
        </View>

        {kind === 'date_range' ? (
          <>
            <TextInput className="mb-2 rounded border bg-white px-3 py-2" placeholder="Start date YYYY-MM-DD" value={startDate} onChangeText={setStartDate} />
            <TextInput className="mb-2 rounded border bg-white px-3 py-2" placeholder="End date YYYY-MM-DD" value={endDate} onChangeText={setEndDate} />
          </>
        ) : (
          <View className="mb-2 flex-row flex-wrap gap-1">
            {DAYS.map((d, i) => (
              <Pressable
                key={d}
                onPress={() => setDayOfWeek(String(i))}
                className={`rounded px-2 py-1 ${dayOfWeek === String(i) ? 'bg-brand-600' : 'bg-slate-200'}`}
              >
                <Text className={dayOfWeek === String(i) ? 'text-white text-xs' : 'text-slate-700 text-xs'}>{d}</Text>
              </Pressable>
            ))}
          </View>
        )}

        <TextInput className="mb-2 rounded border bg-white px-3 py-2" placeholder="Start time HH:MM" value={startTime} onChangeText={setStartTime} />
        <TextInput className="mb-2 rounded border bg-white px-3 py-2" placeholder="End time HH:MM" value={endTime} onChangeText={setEndTime} />
        <TextInput className="mb-3 rounded border bg-white px-3 py-2" placeholder="Notes (optional)" value={notes} onChangeText={setNotes} />
        <Pressable onPress={save} className="items-center rounded-xl bg-brand-600 py-3">
          <Text className="font-semibold text-white">Save availability</Text>
        </Pressable>
      </View>

      <FlatList
        data={entries}
        keyExtractor={(item) => item.id}
        contentContainerClassName="p-4"
        ListEmptyComponent={
          <Text className="py-8 text-center text-slate-500">No availability set yet.</Text>
        }
        renderItem={({ item }) => (
          <View className="mb-2 flex-row items-center rounded-lg border bg-white p-3">
            <View className="flex-1">
              {item.kind === 'recurring_weekly' ? (
                <Text className="font-medium">
                  Every {DAYS[item.day_of_week ?? 0]} · {item.start_time.slice(0, 5)} – {item.end_time.slice(0, 5)}
                </Text>
              ) : (
                <Text className="font-medium">
                  {item.start_date} → {item.end_date} · {item.start_time.slice(0, 5)} – {item.end_time.slice(0, 5)}
                </Text>
              )}
              {item.notes ? <Text className="text-sm text-slate-600">{item.notes}</Text> : null}
            </View>
            <Pressable onPress={() => remove(item.id)}>
              <Text className="text-red-600 text-sm">Delete</Text>
            </Pressable>
          </View>
        )}
      />
    </View>
  );
}
