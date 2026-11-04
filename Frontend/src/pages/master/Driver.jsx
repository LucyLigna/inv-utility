import MasterScreen from '../../components/MasterScreen';
import { StatusCell } from '../../components/ListTable';

const config = {
  title: 'Driver Master',
  entity: 'Driver',
  apiPath: '/drivers',
  exportFile: 'drivers',
  searchFields: ['name', 'short_code', 'mobile'],
  searchPlaceholder: 'Search name, short code or mobile',
  columns: [
    { label: 'Name', field: 'name' },
    { label: 'Short Code', field: 'short_code', width: 160 },
    { label: 'Mobile', field: 'mobile', width: 160 },
    { label: 'Status', field: 'status', width: 160, render: (r) => <StatusCell status={r.status} /> },
  ],
  description: 'Driver name, short code, mobile (for the delivery page login) and status',
  fields: [
    { name: 'name', label: 'Driver Name', required: true, maxLength: 100, upper: true, unique: true, cols: 5 },
    { name: 'short_code', label: 'Short Code', required: true, maxLength: 10, upper: true, unique: true, cols: 3 },
    { name: 'mobile', label: 'Mobile', maxLength: 15, unique: true, cols: 4 },
  ],
  statusCols: 12,
  empty: { name: '', short_code: '', mobile: '', status: 'Active' },
  toForm: (r) => ({ name: r.name, short_code: r.short_code || '', mobile: r.mobile || '', status: r.status }),
};

export default function Driver() {
  return <MasterScreen config={config} />;
}
