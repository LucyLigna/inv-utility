import MasterScreen from '../../components/MasterScreen';
import { StatusCell } from '../../components/ListTable';

const config = {
  title: 'Driver Master',
  entity: 'Driver',
  apiPath: '/drivers',
  exportFile: 'drivers',
  searchFields: ['name', 'short_code'],
  searchPlaceholder: 'Search name or short code',
  columns: [
    { label: 'Name', field: 'name' },
    { label: 'Short Code', field: 'short_code', width: 160 },
    { label: 'Status', field: 'status', width: 160, render: (r) => <StatusCell status={r.status} /> },
  ],
  description: 'Driver name, short code and status',
  fields: [
    { name: 'name', label: 'Driver Name', required: true, maxLength: 100, upper: true, unique: true, cols: 5 },
    { name: 'short_code', label: 'Short Code', required: true, maxLength: 10, upper: true, unique: true, cols: 3 },
  ],
  statusCols: 4,
  empty: { name: '', short_code: '', status: 'Active' },
  toForm: (r) => ({ name: r.name, short_code: r.short_code || '', status: r.status }),
};

export default function Driver() {
  return <MasterScreen config={config} />;
}
