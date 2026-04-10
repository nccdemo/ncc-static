import { Button } from '../ui/button.jsx'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table.jsx'

export function CustomRidesTable({ rows = [], handleRefund, markCashPaid }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>ID</TableHead>
          <TableHead>Pickup</TableHead>
          <TableHead>Destination</TableHead>
          <TableHead>Date</TableHead>
          <TableHead>Time</TableHead>
          <TableHead>Price</TableHead>
          <TableHead>Email</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.length === 0 ? (
          <TableRow>
            <TableCell colSpan={8} className="text-sm text-muted-foreground">
              No custom rides yet.
            </TableCell>
          </TableRow>
        ) : (
          rows.map((ride) => (
            <TableRow key={ride.id ?? ride.quote_id ?? JSON.stringify(ride)}>
              <TableCell className="font-mono text-xs">{ride.id ?? ride.quote_id ?? '—'}</TableCell>
              <TableCell>{ride.pickup ?? '—'}</TableCell>
              <TableCell>{ride.destination ?? '—'}</TableCell>
              <TableCell>{ride.date ?? '—'}</TableCell>
              <TableCell>{ride.time ?? '—'}</TableCell>
              <TableCell>{typeof ride.price === 'number' ? `${ride.price}€` : ride.price ?? '—'}</TableCell>
              <TableCell>{ride.email ?? '—'}</TableCell>
              <TableCell className="text-right">
                <div className="inline-flex flex-wrap items-center justify-end gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => handleRefund(ride.id)}
                  >
                    Refund
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => markCashPaid(ride.id)}
                  >
                    Cash Paid
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  )
}

