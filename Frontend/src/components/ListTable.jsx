import {
  Box, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
} from '@mui/material';
import { Cancel, CheckCircle, Lock } from '@mui/icons-material';

const BORDER = '1px solid #d5d8e0';
const SELECTED = '#1a35b0';

// Status cell: green tick for Active, blue lock for Closed, grey cross for Inactive / Cancelled
export function StatusCell({ status }) {
  const icon = {
    Active: <CheckCircle sx={{ color: '#4cc9a0', fontSize: 26 }} />,
    Closed: <Lock sx={{ color: '#1a35b0', fontSize: 24 }} />,
  }[status] || <Cancel sx={{ color: '#b0b4bd', fontSize: 26 }} />;
  return (
    <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
      {icon}
      {status}
    </Box>
  );
}

// Bordered list with a fixed header. Click a row to select it (onSelect); double-click opens it (onOpen).
// columns: [{ label, field, align, width, render(row) }]
export default function ListTable({ columns, rows, selected, onSelect, onOpen, emptyText }) {
  const cell = { border: BORDER, px: 2.5, py: 1.25, fontSize: 15 };

  return (
    <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 'calc(100vh - 150px)' }}>
      <Table stickyHeader size="small" sx={{ borderCollapse: 'collapse' }}>
        <TableHead>
          <TableRow>
            {columns.map((c) => (
              <TableCell
                key={c.label}
                align="center"
                sx={{ ...cell, width: c.width, fontWeight: 700, bgcolor: '#f5f6fa', color: '#111' }}
              >
                {c.label}
              </TableCell>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((r) => {
            const isSelected = selected === r.code;
            return (
              <TableRow
                key={r.code}
                onClick={() => onSelect(r.code)}
                onDoubleClick={() => onOpen && onOpen(r)}
                sx={{
                  cursor: 'pointer',
                  bgcolor: isSelected ? SELECTED : 'inherit',
                  '&:hover': { bgcolor: isSelected ? SELECTED : '#eef1f8' },
                  '& td': { color: isSelected ? '#fff' : '#333' },
                }}
              >
                {columns.map((c) => (
                  <TableCell key={c.label} align={c.align} sx={cell}>
                    {c.render ? c.render(r) : r[c.field]}
                  </TableCell>
                ))}
              </TableRow>
            );
          })}
          {rows.length === 0 && (
            <TableRow>
              <TableCell colSpan={columns.length} align="center" sx={cell}>{emptyText}</TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
