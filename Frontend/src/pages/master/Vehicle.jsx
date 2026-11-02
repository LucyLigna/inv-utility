import MasterScreen from '../../components/MasterScreen';
import { StatusCell } from '../../components/ListTable';

const config = {
  title: 'Vehicle Master',
  entity: 'Vehicle',
  apiPath: '/vehicles',
  exportFile: 'vehicles',
  searchFields: ['number', 'make'],
  searchPlaceholder: 'Search number or make',
  columns: [
    { label: 'Vehicle Number', field: 'number' },
    { label: 'Make', field: 'make' },
    { label: 'Status', field: 'status', width: 160, render: (r) => <StatusCell status={r.status} /> },
  ],
  description: 'Vehicle number, make and status',
  fields: [
    { name: 'number', label: 'Vehicle Number', required: true, maxLength: 20, upper: true, unique: true, cols: 4 },
    { name: 'make', label: 'Make', required: true, maxLength: 100, cols: 4 },
  ],
  statusCols: 4,
  empty: { number: '', make: '', status: 'Active' },
  toForm: (r) => ({ number: r.number, make: r.make, status: r.status }),
};

export default function Vehicle() {
  return <MasterScreen config={config} />;
}
