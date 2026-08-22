import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { fmtTime } from '@/lib/analytics';

export default function AnalyticsTable({ rows, rowDimension, emptyMessage }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-heading">
          Breakdown by {rowDimension === 'category' ? 'Category' : 'Item'}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground uppercase tracking-wide border-b border-border">
                <th className="py-2 pr-4 font-semibold">{rowDimension === 'category' ? 'Category' : 'Item'}</th>
                <th className="py-2 px-3 text-right font-semibold">Ordered</th>
                <th className="py-2 px-3 text-right font-semibold">Revenue</th>
                <th className="py-2 px-3 text-right font-semibold">Avg prep</th>
                <th className="py-2 px-3 text-right font-semibold">Min prep</th>
                <th className="py-2 px-3 text-right font-semibold">Max prep</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan={6} className="py-8 text-center text-muted-foreground">{emptyMessage || 'No data for current filters'}</td></tr>
              ) : rows.map(r => (
                <tr key={r.name} className="border-b border-border/60 last:border-0">
                  <td className="py-2 pr-4 font-medium">
                    {r.name}
                    {r.printed < r.count && (
                      <span className="ml-2 text-xs text-muted-foreground">({r.printed}/{r.count} printed)</span>
                    )}
                  </td>
                  <td className="py-2 px-3 text-right font-mono">{r.count}</td>
                  <td className="py-2 px-3 text-right font-mono">${r.revenue.toFixed(2)}</td>
                  <td className="py-2 px-3 text-right font-mono">{fmtTime(r.avg)}</td>
                  <td className="py-2 px-3 text-right font-mono">{fmtTime(r.min)}</td>
                  <td className="py-2 px-3 text-right font-mono">{fmtTime(r.max)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}