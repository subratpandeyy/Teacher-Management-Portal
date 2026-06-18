import { Feather } from '@expo/vector-icons';
import { useEffect, useState, useCallback } from 'react';
import { ScrollView, Text, View, Pressable, TextInput, FlatList, ActivityIndicator, Alert, Platform } from 'react-native';
import { useAuth } from '../../lib/auth';
import { supabase } from '../../lib/supabase';
import { Card } from '../../components/ui/Card';

export default function CoordinatorWork() {
  const { profile } = useAuth();
  const [reports, setReports] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Today's report state
  const todayStr = new Date().toISOString().split('T')[0];
  const [todayReportId, setTodayReportId] = useState<string | null>(null);
  const [target, setTarget] = useState('');
  const [completedTasks, setCompletedTasks] = useState('');
  const [remarks, setRemarks] = useState('');

  const fetchReports = useCallback(async () => {
    if (!profile) return;
    try {
      const { data, error } = await supabase
        .from('daily_reports')
        .select('*')
        .eq('coordinator_id', profile.id)
        .order('date', { ascending: false });

      if (error) throw error;
      setReports(data || []);

      // Check if today's report already exists
      const todayReport = data?.find(r => r.date === todayStr);
      if (todayReport) {
        setTodayReportId(todayReport.id);
        setTarget(todayReport.target || '');
        setCompletedTasks(todayReport.completed_tasks?.toString() || '0');
        setRemarks(todayReport.remarks || '');
      } else {
        setTodayReportId(null);
        setTarget('');
        setCompletedTasks('0');
        setRemarks('');
      }
    } catch (err) {
      console.error('Error fetching daily reports:', err);
    } finally {
      setLoading(false);
    }
  }, [profile, todayStr]);

  useEffect(() => {
    fetchReports();
  }, [fetchReports]);

  const handleSubmitReport = async () => {
    if (!profile) return;
    setSubmitting(true);

    const parsedCompleted = parseInt(completedTasks, 10);
    const payload = {
      coordinator_id: profile.id,
      date: todayStr,
      target: target.trim() || null,
      completed_tasks: isNaN(parsedCompleted) ? 0 : parsedCompleted,
      remarks: remarks.trim() || null,
    };

    try {
      if (todayReportId) {
        // Update
        const { error } = await supabase
          .from('daily_reports')
          .update(payload)
          .eq('id', todayReportId);

        if (error) throw error;
        Alert.alert('Success', 'Today\'s report updated successfully');
      } else {
        // Insert
        const { error } = await supabase
          .from('daily_reports')
          .insert(payload);

        if (error) throw error;
        Alert.alert('Success', 'Today\'s report submitted successfully');
      }
      fetchReports();
    } catch (err: any) {
      Alert.alert('Submission Error', err?.message || 'Something went wrong');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-canvas">
        <ActivityIndicator size="large" color="#10B981" />
      </View>
    );
  }

  return (
    <ScrollView className="flex-1 bg-canvas p-4" contentContainerStyle={{ paddingBottom: 60 }}>
      {/* Header */}
      <View className="mb-4">
        <Text className="text-2xl font-bold text-slate-900">Work Tracking</Text>
        <Text className="text-slate-500 text-sm">Submit your daily target and work progress logs</Text>
      </View>

      {/* Today's Submission Form */}
      <Card className="p-5 mb-6">
        <View className="flex-row justify-between items-center mb-4 border-b border-slate-100 pb-3">
          <View>
            <Text className="text-base font-bold text-slate-800">Today's Daily Log</Text>
            <Text className="text-slate-400 text-xs mt-0.5">{todayStr}</Text>
          </View>
          <View className={`px-2.5 py-1 rounded-full ${todayReportId ? 'bg-green-50' : 'bg-amber-50'}`}>
            <Text className={`text-xs font-semibold uppercase ${todayReportId ? 'text-blue-600' : 'text-amber-600'}`}>
              {todayReportId ? 'Submitted' : 'Pending'}
            </Text>
          </View>
        </View>

        <View className="space-y-4">
          {/* Target */}
          <View>
            <Text className="text-slate-700 text-xs font-bold mb-1.5">Daily Completion Targets</Text>
            <TextInput
              value={target}
              onChangeText={setTarget}
              placeholder="What are your goals or targets for today?"
              placeholderTextColor="#94A3B8"
              className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-slate-800 text-sm min-h-[50]"
              multiline
            />
          </View>

          {/* Completed Tasks Count */}
          <View>
            <Text className="text-slate-700 text-xs font-bold mb-1.5">Completed Tasks (Count)</Text>
            <TextInput
              value={completedTasks}
              onChangeText={setCompletedTasks}
              placeholder="0"
              keyboardType="number-pad"
              placeholderTextColor="#94A3B8"
              className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-slate-800 text-sm"
            />
          </View>

          {/* Remarks */}
          <View>
            <Text className="text-slate-700 text-xs font-bold mb-1.5">Remarks / Comments</Text>
            <TextInput
              value={remarks}
              onChangeText={setRemarks}
              placeholder="Any comments or notes on today's target?"
              placeholderTextColor="#94A3B8"
              className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-slate-800 text-sm min-h-[70]"
              multiline
            />
          </View>

          {/* Submit button */}
          <Pressable
            onPress={handleSubmitReport}
            disabled={submitting}
            className={`py-3.5 rounded-xl items-center shadow-sm ${
              submitting ? 'bg-slate-300' : 'bg-emerald-500'
            }`}
          >
            {submitting ? (
              <ActivityIndicator size="small" color="white" />
            ) : (
              <Text className="text-white font-bold text-base">
                {todayReportId ? 'Update Report' : 'Submit Today\'s Report'}
              </Text>
            )}
          </Pressable>
        </View>
      </Card>

      {/* Reports History */}
      <View className="mb-3">
        <Text className="text-lg font-bold text-slate-900 mb-3">Submission History</Text>
        {reports.length === 0 ? (
          <View className="py-12 items-center justify-center bg-white rounded-2xl border border-slate-100">
            <Feather name="folder" size={40} color="#CBD5E1" />
            <Text className="text-slate-400 text-sm mt-3 font-medium">No previous reports found</Text>
          </View>
        ) : (
          reports.map(report => (
            <Card key={report.id} className="mb-3 p-4">
              <View className="flex-row justify-between items-center mb-2 border-b border-slate-50 pb-2">
                <Text className="font-bold text-slate-800 text-sm">{report.date}</Text>
                <View className="bg-slate-100 px-2 py-0.5 rounded">
                  <Text className="text-slate-600 text-xs font-semibold">
                    {report.completed_tasks} completed task(s)
                  </Text>
                </View>
              </View>

              {report.target && (
                <View className="mb-2">
                  <Text className="text-xs font-bold text-slate-500">Target:</Text>
                  <Text className="text-slate-700 text-sm mt-0.5">{report.target}</Text>
                </View>
              )}

              {report.remarks && (
                <View>
                  <Text className="text-xs font-bold text-slate-500">Remarks:</Text>
                  <Text className="text-slate-600 text-sm mt-0.5 italic">{report.remarks}</Text>
                </View>
              )}
            </Card>
          ))
        )}
      </View>
    </ScrollView>
  );
}
