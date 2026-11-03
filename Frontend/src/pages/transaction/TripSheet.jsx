import { LockOpenOutlined, LockOutlined } from '@mui/icons-material';
import MasterScreen from '../../components/MasterScreen';
import { StatusCell } from '../../components/ListTable';
import api from '../../api';

// '2026-11-03' -> '03-11-2026'
const showDate = (d) => (d ? d.split('-').reverse().join('-') : '');
// '2026-11-03 16:57' -> '03-11-2026 16:57'
const showDateTime = (d) => (d ? `${showDate(d.slice(0, 10))} ${d.slice(11)}` : '');

// Today plus the given number of days, as 'YYYY-MM-DD' in local time
const dayFromToday = (days = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const dateColumn = (label, field) => ({
  label, field, width: 120, align: 'center', render: (r) => showDate(r[field]), exportValue: (r) => showDate(r[field]),
});

const config = {
  title: 'Trip Sheet',
  entity: 'Trip Sheet',
  apiPath: '/trip-sheets',
  exportFile: 'trip-sheets',
  searchFields: ['tsc_no', 'route_name', 'driver_name', 'remarks', 'status'],
  searchPlaceholder: 'Search sheet no, route, driver',
  dateFilter: { field: 'loading_date', label: 'Loading date' },
  columns: [
    { label: 'Sheet No', field: 'tsc_no', width: 130 },
    dateColumn('Entry Date', 'entry_date'),
    { label: 'Trip Route', field: 'route_name' },
    { label: 'Driver', field: 'driver_name' },
    dateColumn('Loading Date', 'loading_date'),
    dateColumn('Start Date', 'start_date'),
    dateColumn('End Date', 'end_date'),
    { label: 'Bills', field: 'total_bills', width: 80, align: 'right' },
    { label: 'Cases', field: 'total_pack_qty', width: 80, align: 'right' },
    { label: 'Status', field: 'status', width: 140, render: (r) => <StatusCell status={r.status} /> },
    {
      label: 'Closed On',
      field: 'closed_at',
      width: 150,
      align: 'center',
      render: (r) => showDateTime(r.closed_at),
      exportValue: (r) => showDateTime(r.closed_at),
    },
  ],
  // Deleting only marks the sheet Cancelled; cancelled sheets stay in the list and can only be viewed
  deletable: {
    confirm: (r) => `Cancel trip sheet ${r.tsc_no}? It will stay in the list marked Cancelled and can no longer be edited.`,
    done: (r) => `Trip sheet ${r.tsc_no} cancelled`,
    blockedReason: (r) => (r.total_bills > 0
      ? `Trip sheet ${r.tsc_no} has ${r.total_bills} bill${r.total_bills > 1 ? 's' : ''}. Remove them in Trip Sheet - Bill Details before deleting it.`
      : null),
  },
  // Close: the trip is done. The sheet and its bills are then fixed and it leaves Trip Sheet - Bill Details.
  actions: [{
    label: 'Close',
    icon: <LockOutlined />,
    confirm: (r) => ({
      title: `Close trip sheet ${r.tsc_no}?`,
      message: `${r.route_name}, ${r.total_bills} bill${r.total_bills === 1 ? '' : 's'} and ${r.total_pack_qty} cases. Once closed it can't be edited and won't appear in Trip Sheet - Bill Details. It can be reopened only today.`,
      cancelLabel: 'Keep it open',
      confirmLabel: 'Close sheet',
    }),
    request: (r) => api.post(`/trip-sheets/${r.code}/close`),
    done: (r) => `Trip sheet ${r.tsc_no} closed`,
  }, {
    // Reopen: only on the day the sheet was closed
    label: 'Reopen',
    icon: <LockOpenOutlined />,
    availableFor: (r) => r.status === 'Closed',
    blockedReason: (r) => ((r.closed_at || '').slice(0, 10) === dayFromToday()
      ? null
      : `Trip sheet ${r.tsc_no} was closed on ${showDateTime(r.closed_at)}. Only a sheet closed today can be reopened.`),
    confirm: (r) => ({
      title: `Reopen trip sheet ${r.tsc_no}?`,
      message: 'It becomes Active again: it can be edited and appears in Trip Sheet - Bill Details.',
      cancelLabel: 'Keep it closed',
      confirmLabel: 'Reopen',
    }),
    request: (r) => api.post(`/trip-sheets/${r.code}/reopen`),
    done: (r) => `Trip sheet ${r.tsc_no} reopened`,
  }],
  // Cancelled and closed sheets stay in the list and can only be viewed
  isLocked: (r) => r.status !== 'Active',
  description: 'Trip route, driver, loading and trip dates',
  noStatus: true,
  fields: [
    { name: 'tsc_no', label: 'Sheet No', type: 'auto', cols: 3 },
    { name: 'entry_date', label: 'Entry Date', type: 'date', required: true, cols: 3 },
    {
      name: 'trip_code',
      label: 'Trip Route',
      type: 'select',
      required: true,
      cols: 6,
      optionsPath: '/trip-routes',
      optionLabel: (r) => `${r.name} (${r.short_code})`,
      lockOnEdit: true,
      lockedHint: 'The trip route of a saved trip sheet cannot be changed',
    },
    {
      name: 'driver_code',
      label: 'Driver',
      type: 'select',
      required: true,
      cols: 6,
      optionsPath: '/drivers',
      optionLabel: (d) => `${d.name} (${d.short_code})`,
    },
    { name: 'loading_date', label: 'Loading Date', type: 'date', required: true, cols: 2 },
    { name: 'start_date', label: 'Start Date', type: 'date', required: true, cols: 2 },
    { name: 'end_date', label: 'End Date', type: 'date', cols: 2 },
    { name: 'remarks', label: 'Remarks', maxLength: 500, rows: 2, cols: 12 },
  ],
  // New sheet: entry and loading today, start and end tomorrow
  empty: () => ({
    tsc_no: '', entry_date: dayFromToday(), trip_code: '', driver_code: '',
    loading_date: dayFromToday(), start_date: dayFromToday(1), end_date: dayFromToday(1), remarks: '',
  }),
  toForm: (r) => ({
    tsc_no: r.tsc_no,
    entry_date: r.entry_date || '',
    trip_code: r.trip_code,
    driver_code: r.driver_code,
    loading_date: r.loading_date || '',
    start_date: r.start_date || '',
    end_date: r.end_date || '',
    remarks: r.remarks || '',
  }),
  validate: (f) => {
    if (f.start_date < f.loading_date) return 'Start date cannot be before the loading date';
    if (f.end_date && f.end_date < f.start_date) return 'End date cannot be before the start date';
    return null;
  },
};

export default function TripSheet() {
  return <MasterScreen config={config} />;
}
