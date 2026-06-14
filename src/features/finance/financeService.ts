import { supabase } from '../../../mobile/lib/supabase';

class FinanceService {
  /**
   * Get total revenue
   */
  async getTotalRevenue() {
    const { data, error } = await supabase
      .from('financial_records')
      .select('amount')
      .eq('type', 'revenue');

    if (error) throw error;
    return data.reduce((sum, record) => sum + Number(record.amount), 0);
  }

  /**
   * Add a financial record
   */
  async addRecord(params: {
    amount: number;
    type: 'revenue' | 'expense';
    category?: string;
    description?: string;
    date?: string;
  }) {
    const { data, error } = await supabase
      .from('financial_records')
      .insert({
        amount: params.amount,
        type: params.type,
        category: params.category,
        description: params.description,
        date: params.date || new Date().toISOString().split('T')[0],
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  }
}

export const financeService = new FinanceService();
