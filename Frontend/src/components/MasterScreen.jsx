import { useEffect, useState } from 'react';
import {
  Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, FormControlLabel, MenuItem,
  Paper, Radio, RadioGroup, Snackbar, Stack, TextField, Typography,
} from '@mui/material';
import {
  AddCircle, ArrowBack, Close, Delete, Download, Edit, Info, Refresh, Save, Visibility,
} from '@mui/icons-material';
import ActionBar from './ActionBar';
import ListTable from './ListTable';
import api, { errorMessage } from '../api';

// Outlined fields with bold labels; once filled, the label sits on the border in blue
const FIELD_SX = {
  '& .MuiInputLabel-root': { fontWeight: 700, color: '#222' },
  '& .MuiInputLabel-root.MuiInputLabel-shrink': { fontWeight: 600, color: '#1a35b0' },
  '& .MuiInputLabel-root.Mui-error': { color: 'error.main' },
  '& .MuiOutlinedInput-input': { fontWeight: 600, py: 1.6 },
  '& .MuiOutlinedInput-notchedOutline': { borderColor: '#c8ccd4' },
};
// Width in a 12-column grid; full width on narrow screens
const span = (cols) => ({ xs: 'span 12', md: `span ${cols}` });

// One master screen: a list, and an entry form shown in the page itself for add / view / edit.
// config:
//   title         'Driver Master'
//   entity        'Driver' (used in headings and messages)
//   apiPath       '/drivers' (GET list, POST, PUT /:code, GET /check-duplicate?field=&value=&excludeCode=)
//   columns       list columns: [{ label, field, width, render(row), exportValue(row) }]
//   description   one line under the form heading ('Vehicle number, make and status')
//   fields        [{ name, label, required, maxLength, upper, unique, cols (of 12), rows, type }]
//                 type: 'text' (default) | 'date' | 'auto' (read-only, filled by the server on save)
//                       | 'select' with optionsPath ('/drivers') and optionLabel(option); only Active options are
//                         offered, plus the one the record already uses
//   statusCols    width of the Status field (of 12); noStatus hides it
//   empty         new-record values (or a function returning them), toForm(row) -> form values for an existing row
//   renderExtra   optional ({ form, setForm, readOnly }) => extra form controls
//   validate      optional (form) => error message for the extra controls, or nothing when valid
//   deletable     optional { confirm(row) -> question, done(row) -> message }: adds a Delete button
//                 (DELETE apiPath/:code; the server decides what deleting means, e.g. marking it cancelled)
//   isLocked      optional (row) => true for rows that can only be viewed (e.g. cancelled ones)
//   searchFields, searchPlaceholder, exportFile
export default function MasterScreen({ config }) {
  const {
    title, entity, description, apiPath, columns, fields, statusCols, noStatus, empty, toForm, renderExtra, validate,
    deletable, isLocked = () => false, searchFields, searchPlaceholder, exportFile,
  } = config;

  const [rows, setRows] = useState([]);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(null);
  const [mode, setMode] = useState('list'); // list | add | edit | view
  // empty may be a function, for defaults worked out when the form opens (such as today's date)
  const newRecord = () => (typeof empty === 'function' ? empty() : empty);
  const [form, setForm] = useState(newRecord);
  const [editCode, setEditCode] = useState(null);
  const [error, setError] = useState('');
  const [formError, setFormError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [options, setOptions] = useState({}); // dropdown choices per select field

  useEffect(() => {
    fields.filter((f) => f.type === 'select').forEach((f) => {
      api.get(f.optionsPath)
        .then(({ data }) => setOptions((o) => ({ ...o, [f.name]: data })))
        .catch((err) => setError(errorMessage(err)));
    });
  }, []);

  const load = () =>
    api.get(apiPath)
      .then(({ data }) => {
        setRows(data);
        setError('');
      })
      .catch((err) => setError(errorMessage(err)));

  useEffect(() => {
    load();
  }, []);

  const selectedRow = rows.find((r) => r.code === selected);
  const selectedLocked = Boolean(selectedRow) && isLocked(selectedRow);
  const [confirmDelete, setConfirmDelete] = useState(null); // row waiting for the user to confirm
  const [notice, setNotice] = useState('');

  const doDelete = async () => {
    const row = confirmDelete;
    setConfirmDelete(null);
    try {
      await api.delete(`${apiPath}/${row.code}`);
      await load();
      setNotice(deletable.done ? deletable.done(row) : `${entity} deleted`);
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const openForm = (nextMode, row) => {
    setForm(row ? toForm(row) : newRecord());
    setEditCode(row ? row.code : null);
    if (row) setSelected(row.code);
    setFormError('');
    setFieldErrors({});
    setMode(nextMode);
  };

  const backToList = () => setMode('list');

  const changeField = (field, value) => {
    setForm({ ...form, [field.name]: field.upper ? value.toUpperCase() : value });
    setFieldErrors({ ...fieldErrors, [field.name]: '' });
  };

  // Runs when focus leaves a field that must be unique
  const checkDuplicate = async (field) => {
    const value = String(form[field.name] || '').trim();
    if (!field.unique || !value) return;
    try {
      const { data } = await api.get(`${apiPath}/check-duplicate`, {
        params: { field: field.name, value, excludeCode: editCode || 0 },
      });
      setFieldErrors((errs) => ({ ...errs, [field.name]: data.exists ? data.message : '' }));
    } catch (err) {
      setFieldErrors((errs) => ({ ...errs, [field.name]: errorMessage(err) }));
    }
  };

  const hasFieldErrors = Object.values(fieldErrors).some(Boolean);

  const save = async () => {
    const missing = fields.filter((f) => f.required && f.type !== 'auto' && !String(form[f.name] ?? '').trim());
    if (missing.length) {
      setFormError(`${missing.map((f) => f.label).join(' and ')} required`);
      return;
    }
    const extraError = validate && validate(form);
    if (extraError) {
      setFormError(extraError);
      return;
    }
    if (hasFieldErrors) return;
    try {
      const { data } = editCode
        ? await api.put(`${apiPath}/${editCode}`, form)
        : await api.post(apiPath, form);
      await load();
      setSelected(data.code);
      setMode('list');
    } catch (err) {
      setFormError(errorMessage(err));
    }
  };

  const q = search.trim().toLowerCase();
  const filtered = rows.filter((r) => !q || searchFields.some((f) => String(r[f] || '').toLowerCase().includes(q)));

  const exportExcel = async () => {
    const { default: writeExcelFile } = await import('write-excel-file/browser');
    const header = columns.map((c) => ({ value: c.label, fontWeight: 'bold' }));
    const data = filtered.map((r) => columns.map((c) => (c.exportValue ? c.exportValue(r) : r[c.field]) ?? null));
    await writeExcelFile([header, ...data], {
      sheet: entity,
      columns: columns.map(() => ({ width: 25 })),
      stickyRowsCount: 1,
    }).toFile(`${exportFile}.xlsx`);
  };

  const listActions = {
    left: [
      { label: 'Add', icon: <AddCircle />, onClick: () => openForm('add', null) },
      { label: 'View', icon: <Visibility />, onClick: () => openForm('view', selectedRow), disabled: !selectedRow },
      {
        label: 'Edit', icon: <Edit />, onClick: () => openForm('edit', selectedRow), disabled: !selectedRow || selectedLocked,
      },
      ...(deletable ? [{
        label: 'Delete', icon: <Delete />, onClick: () => setConfirmDelete(selectedRow), disabled: !selectedRow || selectedLocked,
      }] : []),
      { label: 'Refresh', icon: <Refresh />, onClick: load },
    ],
    right: [
      {
        icon: <Info />,
        tooltip: `${filtered.length} of ${rows.length} records. Click a row to select it; double-click to edit it.`,
      },
      { label: 'Export Excel', icon: <Download />, onClick: exportExcel, disabled: !filtered.length },
    ],
  };
  const formActions = mode === 'view'
    ? { left: [
      { label: 'Edit', icon: <Edit />, onClick: () => setMode('edit'), disabled: selectedLocked },
      { label: 'Back', icon: <ArrowBack />, onClick: backToList },
    ] }
    : { left: [
      { label: 'Save', icon: <Save />, onClick: save, disabled: hasFieldErrors },
      { label: 'Cancel', icon: <Close />, onClick: backToList },
    ] };

  const readOnly = mode === 'view';
  const firstEditable = fields.find((f) => f.type !== 'auto')?.name;
  const heading = { add: `Add ${entity}`, edit: `Edit ${entity}`, view: `View ${entity}` }[mode];

  return (
    <Box>
      <ActionBar {...(mode === 'list' ? listActions : formActions)} />
      <Box sx={{ p: 2.5 }}>
        {mode === 'list' ? (
          <>
            <Stack direction="row" alignItems="center" justifyContent="space-between" mb={2} gap={2}>
              <Typography variant="h5">{title}</Typography>
              <TextField
                size="small"
                placeholder={searchPlaceholder}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                sx={{ width: 300 }}
              />
            </Stack>
            {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
            <ListTable
              columns={columns}
              rows={filtered}
              selected={selected}
              onSelect={setSelected}
              onOpen={(r) => openForm(isLocked(r) ? 'view' : 'edit', r)}
              emptyText={`No ${entity.toLowerCase()} records found`}
            />
          </>
        ) : (
          <Paper variant="outlined" sx={{ borderRadius: 2 }}>
            {/* Header: step badge, title and a one-line description */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, px: 2, py: 2.5, borderBottom: '1px solid #eceef2' }}>
              <Box
                sx={{
                  width: 36, height: 36, borderRadius: 1.5, bgcolor: '#e8ecfb', color: '#1a35b0',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 14,
                }}
              >
                1
              </Box>
              <Box>
                <Typography sx={{ fontSize: 17, fontWeight: 600, color: '#222' }}>
                  {heading}
                  {mode === 'view' && selectedLocked && selectedRow.status && (
                    <Box component="span" sx={{ ml: 1, px: 1, py: 0.25, borderRadius: 1, fontSize: 13, bgcolor: '#fdecea', color: '#b3261e' }}>
                      {selectedRow.status}
                    </Box>
                  )}
                </Typography>
                <Typography sx={{ fontSize: 14, color: '#666' }}>{description}</Typography>
              </Box>
            </Box>
            <Box
              sx={{
                display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', columnGap: 3, rowGap: 2.75,
                px: { xs: 2, md: 5 }, py: 3,
              }}
            >
              {formError && <Alert severity="error" sx={{ gridColumn: 'span 12' }}>{formError}</Alert>}
              {fields.map((f) => {
                const auto = f.type === 'auto';
                const choices = f.type === 'select'
                  ? (options[f.name] || []).filter((o) => o.status === 'Active' || o.code === form[f.name])
                  : null;
                return (
                  <TextField
                    key={f.name}
                    label={f.label}
                    required={f.required && !readOnly && !auto}
                    autoFocus={f.name === firstEditable && !readOnly}
                    select={Boolean(choices)}
                    type={f.type === 'date' ? 'date' : 'text'}
                    multiline={Boolean(f.rows)}
                    minRows={f.rows}
                    value={auto ? form[f.name] || 'Generated on save' : form[f.name] ?? ''}
                    onChange={(e) => changeField(f, e.target.value)}
                    onBlur={() => checkDuplicate(f)}
                    error={Boolean(fieldErrors[f.name])}
                    helperText={fieldErrors[f.name]}
                    InputLabelProps={f.type === 'date' || auto ? { shrink: true } : undefined}
                    InputProps={{ readOnly: readOnly || auto }}
                    inputProps={{ maxLength: f.maxLength }}
                    sx={{
                      ...FIELD_SX,
                      gridColumn: span(f.cols || 4),
                      ...(auto && { '& .MuiOutlinedInput-root': { bgcolor: '#f5f6fa' } }),
                      ...(auto && !form[f.name] && { '& .MuiOutlinedInput-input': { color: '#888', fontWeight: 400 } }),
                    }}
                  >
                    {choices && choices.map((o) => <MenuItem key={o.code} value={o.code}>{f.optionLabel(o)}</MenuItem>)}
                  </TextField>
                );
              })}
              {/* Status as Active / Inactive radio buttons inside an outlined box with the label on its border */}
              {!noStatus && (
              <Box
                component="fieldset"
                sx={{
                  gridColumn: span(statusCols || 4), justifySelf: 'start', width: 'fit-content', m: 0, px: 1.5, py: 0,
                  border: '1px solid #c8ccd4', borderRadius: 1,
                }}
              >
                <Box component="legend" sx={{ px: 0.5, fontSize: 12, fontWeight: 600, color: '#1a35b0' }}>
                  Status *
                </Box>
                <RadioGroup
                  row
                  value={form.status}
                  onChange={(e) => !readOnly && setForm({ ...form, status: e.target.value })}
                  sx={{ mt: -0.75, flexWrap: 'nowrap' }}
                >
                  {['Active', 'Inactive'].map((s) => (
                    <FormControlLabel
                      key={s}
                      value={s}
                      label={s}
                      disabled={readOnly && form.status !== s}
                      control={<Radio sx={{ color: '#555', '&.Mui-checked': { color: '#1a35b0' } }} />}
                      sx={{ mr: s === 'Active' ? 1.5 : 0.5, whiteSpace: 'nowrap', '& .MuiFormControlLabel-label': { fontWeight: 700, fontSize: 16 } }}
                    />
                  ))}
                </RadioGroup>
              </Box>
              )}
              {renderExtra && renderExtra({ form, setForm, readOnly })}
            </Box>
          </Paper>
        )}
      </Box>

      <Dialog open={Boolean(confirmDelete)} onClose={() => setConfirmDelete(null)}>
        <DialogTitle>Delete {entity}</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {confirmDelete && (deletable.confirm ? deletable.confirm(confirmDelete) : `Delete this ${entity.toLowerCase()}?`)}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmDelete(null)}>Keep it</Button>
          <Button color="error" variant="contained" onClick={doDelete}>Delete</Button>
        </DialogActions>
      </Dialog>
      <Snackbar open={Boolean(notice)} autoHideDuration={3000} onClose={() => setNotice('')} message={notice} />
    </Box>
  );
}
