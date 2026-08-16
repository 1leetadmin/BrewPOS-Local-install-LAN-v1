import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar, Legend } from 'recharts';
import { CATEGORY_LABELS, getChartColor } from '@/lib/ingredientReports';
import { format } from 'date-fns';

function fmtMoney(v) {
  return `$${(v || 0).toFixed(2)}`;
}

export function LineView({ data }) {
  return (
    <ResponsiveContainer width="100%" height={400}>
      <LineChart data={data} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
        <XAxis dataKey="label" tick={{ fontSize: 11 }} className="text-muted-foreground" />
        <YAxis tickFormatter={fmtMoney} tick={{ fontSize: 11 }} width={70} />
        <Tooltip formatter={(v) => fmtMoney(v)} labelStyle={{ fontSize: 12 }} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Line type="monotone" dataKey="cost" stroke="#f59e0b" strokeWidth={2} name="Total Cost" dot={{ r: 3 }} />
        <Line type="monotone" dataKey="wastage" stroke="#ef4444" strokeWidth={2} name="Wastage" dot={{ r: 3 }} />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function PieView({ data }) {
  return (
    <ResponsiveContainer width="100%" height={400}>
      <PieChart>
        <Pie data={data} dataKey="cost" nameKey="label" cx="50%" cy="50%" outerRadius={140} label={({ label, percent }) => `${label} ${((percent || 0) * 100).toFixed(0)}%`} labelLine={{ fontSize: 11 }}>
          {data.map((entry, i) => (
            <Cell key={i} fill={getChartColor(i, entry.name)} />
          ))}
        </Pie>
        <Tooltip formatter={(v) => fmtMoney(v)} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
      </PieChart>
    </ResponsiveContainer>
  );
}

export function BarView({ data }) {
  return (
    <ResponsiveContainer width="100%" height={400}>
      <BarChart data={data} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
        <XAxis dataKey="label" tick={{ fontSize: 11 }} angle={-30} textAnchor="end" height={70} interval={0} />
        <YAxis tickFormatter={fmtMoney} tick={{ fontSize: 11 }} width={70} />
        <Tooltip formatter={(v) => fmtMoney(v)} cursor={{ fill: 'hsl(var(--muted) / 0.3)' }} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="cost" fill="#f59e0b" name="Cost" radius={[4, 4, 0, 0]} />
        <Bar dataKey="wastage" fill="#ef4444" name="Wastage" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function TableView({ transactions, summary }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead className="bg-muted/50">
          <tr className="text-left">
            <th className="px-3 py-2 font-medium">Date</th>
            <th className="px-3 py-2 font-medium">Ingredient</th>
            <th className="px-3 py-2 font-medium">Category</th>
            <th className="px-3 py-2 font-medium">Type</th>
            <th className="px-3 py-2 font-medium text-right">Qty</th>
            <th className="px-3 py-2 font-medium text-right">Cost/Unit</th>
            <th className="px-3 py-2 font-medium text-right">Total</th>
            <th className="px-3 py-2 font-medium">Event</th>
            <th className="px-3 py-2 font-medium">Notes</th>
          </tr>
        </thead>
        <tbody>
          {transactions.map(t => (
            <tr key={t.id} className="border-t border-border hover:bg-muted/30">
              <td className="px-3 py-2 whitespace-nowrap">{format(new Date(t.date), 'dd/MM/yy HH:mm')}</td>
              <td className="px-3 py-2">{t.ingredient_name}</td>
              <td className="px-3 py-2">{CATEGORY_LABELS[t.category] || t.category}</td>
              <td className="px-3 py-2">
                <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                  t.transaction_type === 'wastage' ? 'bg-destructive/15 text-destructive' :
                  t.transaction_type === 'purchase' ? 'bg-green-500/15 text-green-600' :
                  t.transaction_type === 'usage' ? 'bg-blue-500/15 text-blue-600' :
                  'bg-muted text-muted-foreground'
                }`}>{t.transaction_type}</span>
              </td>
              <td className="px-3 py-2 text-right font-mono">{t.quantity} {t.unit}</td>
              <td className="px-3 py-2 text-right font-mono">{fmtMoney(t.cost_per_unit)}</td>
              <td className="px-3 py-2 text-right font-mono font-semibold">{fmtMoney(t.total_cost)}</td>
              <td className="px-3 py-2">{t.event_name || '—'}</td>
              <td className="px-3 py-2 text-muted-foreground max-w-[200px] truncate">{t.notes || '—'}</td>
            </tr>
          ))}
          {transactions.length === 0 && (
            <tr><td colSpan={9} className="px-3 py-8 text-center text-muted-foreground">No transactions in this period</td></tr>
          )}
        </tbody>
        {transactions.length > 0 && (
          <tfoot className="bg-muted/50 font-semibold">
            <tr className="border-t-2 border-border">
              <td colSpan={6} className="px-3 py-2 text-right">Total</td>
              <td className="px-3 py-2 text-right font-mono">{fmtMoney(summary.total)}</td>
              <td colSpan={2}></td>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}