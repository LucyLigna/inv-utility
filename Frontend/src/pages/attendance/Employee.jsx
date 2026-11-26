import { useMemo, useRef, useState } from 'react';
import { Chip } from '@mui/material';
import { Face } from '@mui/icons-material';
import MasterScreen from '../../components/MasterScreen';
import { StatusCell } from '../../components/ListTable';
import EnrolFaceDialog from './EnrolFaceDialog';

// Employee master for attendance (sample). Enrol Face takes face samples with the camera; the kiosk then knows them.
const makeConfig = (openEnrol) => ({
  title: 'Employee',
  entity: 'Employee',
  apiPath: '/att-employees',
  exportFile: 'employees',
  searchFields: ['emp_no', 'name', 'department', 'mobile'],
  searchPlaceholder: 'Search number, name, department or mobile',
  columns: [
    { label: 'Emp #', field: 'emp_no', width: 120 },
    { label: 'Name', field: 'name' },
    { label: 'Department', field: 'department', width: 200 },
    { label: 'Mobile', field: 'mobile', width: 140 },
    {
      label: 'Face', field: 'faces', width: 130, align: 'center',
      render: (r) => (r.faces
        ? <Chip size="small" color="success" label={`${r.faces} sample${r.faces > 1 ? 's' : ''}`} />
        : <Chip size="small" variant="outlined" label="Not enrolled" />),
      exportValue: (r) => r.faces,
    },
    { label: 'Status', field: 'status', width: 140, render: (r) => <StatusCell status={r.status} /> },
  ],
  description: 'Employee number, name, department and mobile; then Enrol Face to take face samples',
  fields: [
    { name: 'emp_no', label: 'Emp #', required: true, maxLength: 20, upper: true, unique: true, cols: 3 },
    { name: 'name', label: 'Name', required: true, maxLength: 100, upper: true, cols: 5 },
    { name: 'mobile', label: 'Mobile', maxLength: 10, digits: true, cols: 4 },
    { name: 'department', label: 'Department', maxLength: 100, cols: 6 },
  ],
  statusCols: 6,
  empty: { emp_no: '', name: '', department: '', mobile: '', status: 'Active' },
  toForm: (r) => ({ emp_no: r.emp_no, name: r.name, department: r.department || '', mobile: r.mobile || '', status: r.status }),
  validate: (f) => (f.mobile && !/^\d{10}$/.test(f.mobile) ? 'Mobile number must be exactly 10 digits' : null),
  actions: [{
    label: 'Enrol Face',
    icon: <Face />,
    availableFor: (r) => r.status === 'Active',
    request: (r) => openEnrol(r),
    done: (r) => `Face samples saved for ${r.name}`,
  }],
});

export default function Employee() {
  const [enrolling, setEnrolling] = useState(null);
  const finish = useRef(null);
  // The action waits for the dialog; it resolves false when nothing was saved
  const config = useMemo(() => makeConfig((row) => new Promise((resolve) => {
    finish.current = resolve;
    setEnrolling(row);
  })), []);
  return (
    <>
      <MasterScreen config={config} />
      <EnrolFaceDialog
        employee={enrolling}
        onClose={(saved) => {
          setEnrolling(null);
          finish.current?.(saved);
        }}
      />
    </>
  );
}
