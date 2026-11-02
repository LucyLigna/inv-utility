import { useEffect, useState } from 'react';
import {
  Autocomplete, Button, Checkbox, Chip, FormControlLabel, Stack, TextField,
} from '@mui/material';
import FormSection from '../../components/FormSection';
import MasterScreen from '../../components/MasterScreen';
import { StatusCell } from '../../components/ListTable';
import api, { errorMessage } from '../../api';

const branchKey = (b) => `${b.company_code}:${b.ba_code}`;
const branchesText = (branches) => (branches || []).map((b) => b.company_branch).join(', ');

// Pick the branches this route serves, from view_branch_list ('BAD - CAL UNIT I')
function BranchPicker({ form, setForm, readOnly }) {
  const [options, setOptions] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/trip-routes/branch-list')
      .then(({ data }) => setOptions(data))
      .catch((err) => setError(errorMessage(err)));
  }, []);

  return (
    <FormSection title="Branches" hint="Select the branches this route serves.">
      <Autocomplete
        multiple
        disableCloseOnSelect
        readOnly={readOnly}
        options={options}
        value={form.branches}
        onChange={(e, value) => setForm({ ...form, branches: value })}
        getOptionLabel={(b) => b.company_branch}
        isOptionEqualToValue={(a, b) => branchKey(a) === branchKey(b)}
        renderOption={(props, b, { selected }) => (
          <li {...props} key={branchKey(b)}>
            <Checkbox size="small" checked={selected} sx={{ mr: 1 }} />
            {b.company_branch}
          </li>
        )}
        renderTags={(value, getTagProps) => value.map((b, i) => (
          <Chip {...getTagProps({ index: i })} key={branchKey(b)} label={b.company_branch} size="small" />
        ))}
        renderInput={(params) => (
          <TextField
            {...params}
            placeholder={readOnly || form.branches.length ? '' : 'Search branch'}
            error={Boolean(error)}
            helperText={error || `${form.branches.length} selected`}
          />
        )}
      />
    </FormSection>
  );
}

const WEEKDAYS = [
  { value: 'MON', label: 'Monday' },
  { value: 'TUE', label: 'Tuesday' },
  { value: 'WED', label: 'Wednesday' },
  { value: 'THU', label: 'Thursday' },
  { value: 'FRI', label: 'Friday' },
  { value: 'SAT', label: 'Saturday' },
];

// 'MON,THU' from the API -> 'Mon, Thu' for the list
const daysText = (weekdays) => {
  const days = (weekdays || '').split(',').filter(Boolean);
  if (days.length === WEEKDAYS.length) return 'All days';
  return days.map((d) => d.charAt(0) + d.slice(1).toLowerCase()).join(', ');
};

function WeekdayPicker({ form, setForm, readOnly }) {
  const allPicked = form.weekdays.length === WEEKDAYS.length;
  const toggleDay = (day) => {
    const weekdays = form.weekdays.includes(day) ? form.weekdays.filter((d) => d !== day) : [...form.weekdays, day];
    setForm({ ...form, weekdays });
  };
  return (
    <FormSection title="Weekdays" hint="Tick the days this route runs.">
      <Stack direction="row" alignItems="center" flexWrap="wrap" columnGap={1}>
        {WEEKDAYS.map((d) => (
          <FormControlLabel
            key={d.value}
            label={d.label}
            disabled={readOnly}
            sx={{ mr: 2, '& .MuiFormControlLabel-label': { fontWeight: 600 } }}
            control={<Checkbox checked={form.weekdays.includes(d.value)} onChange={() => toggleDay(d.value)} />}
          />
        ))}
        {!readOnly && (
          <Button size="small" onClick={() => setForm({ ...form, weekdays: allPicked ? [] : WEEKDAYS.map((d) => d.value) })}>
            {allPicked ? 'Clear all' : 'Select all'}
          </Button>
        )}
      </Stack>
    </FormSection>
  );
}

const config = {
  title: 'Trip Route Master',
  entity: 'Route',
  apiPath: '/trip-routes',
  exportFile: 'trip-routes',
  searchFields: ['name', 'short_code'],
  searchPlaceholder: 'Search route name or short code',
  columns: [
    { label: 'Route Name', field: 'name' },
    { label: 'Short Code', field: 'short_code', width: 160 },
    { label: 'Days', field: 'weekdays', render: (r) => daysText(r.weekdays), exportValue: (r) => daysText(r.weekdays) },
    {
      label: 'Branches',
      field: 'branches',
      render: (r) => branchesText(r.branches),
      exportValue: (r) => branchesText(r.branches),
    },
    { label: 'Status', field: 'status', width: 160, render: (r) => <StatusCell status={r.status} /> },
  ],
  description: 'Route name, short code, running days and status',
  fields: [
    { name: 'name', label: 'Route Name', required: true, maxLength: 100, upper: true, unique: true, cols: 5 },
    { name: 'short_code', label: 'Short Code', required: true, maxLength: 10, upper: true, unique: true, cols: 3 },
  ],
  statusCols: 4,
  empty: { name: '', short_code: '', weekdays: [], branches: [], status: 'Active' },
  toForm: (r) => ({
    name: r.name,
    short_code: r.short_code || '',
    weekdays: (r.weekdays || '').split(',').filter(Boolean),
    branches: r.branches || [],
    status: r.status,
  }),
  renderExtra: (props) => (
    <>
      <WeekdayPicker {...props} />
      <BranchPicker {...props} />
    </>
  ),
};

export default function TripRoute() {
  return <MasterScreen config={config} />;
}
