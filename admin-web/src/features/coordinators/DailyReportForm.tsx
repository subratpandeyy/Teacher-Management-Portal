import { useState } from 'react';
import { coordinatorService } from '../../core/services/coordinatorService';
import { useAuth } from '../../core/auth/AuthContext';

export function DailyReportForm() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState({
    completed_tasks: 0,
    target: '',
    remarks: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setLoading(true);
    try {
      await coordinatorService.submitDailyReport({
        coordinator_id: user.id,
        date: new Date().toISOString().split('T')[0],
        ...report,
      });
      alert('Report submitted successfully!');
    } catch (err) {
      console.error('Error submitting report:', err);
      alert('Failed to submit report');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6 rounded-xl border border-slate-100 bg-white p-6 shadow-sm">
      <h3 className="text-lg font-bold text-slate-900">Submit Daily Work Report</h3>
      
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <div className="space-y-2">
          <label className="text-sm font-medium text-slate-700">Completed Tasks</label>
          <input
            type="number"
            value={report.completed_tasks}
            onChange={(e) => setReport({ ...report, completed_tasks: parseInt(e.target.value) })}
            className="w-full rounded-lg border border-slate-200 px-4 py-2 focus:border-green-500 focus:outline-none"
          />
        </div>
        
        <div className="space-y-2">
          <label className="text-sm font-medium text-slate-700">Today's Target</label>
          <input
            type="text"
            value={report.target}
            onChange={(e) => setReport({ ...report, target: e.target.value })}
            placeholder="e.g. Contact 5 students"
            className="w-full rounded-lg border border-slate-200 px-4 py-2 focus:border-green-500 focus:outline-none"
          />
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-slate-700">Remarks / Feedback</label>
        <textarea
          value={report.remarks}
          onChange={(e) => setReport({ ...report, remarks: e.target.value })}
          rows={3}
          className="w-full rounded-lg border border-slate-200 px-4 py-2 focus:border-green-500 focus:outline-none"
        />
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-lg bg-green-600 py-3 font-semibold text-white transition-colors hover:bg-green-700 disabled:opacity-50"
      >
        {loading ? 'Submitting...' : 'Submit Report'}
      </button>
    </form>
  );
}
