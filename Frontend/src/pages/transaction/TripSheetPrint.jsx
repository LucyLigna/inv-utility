import { GlobalStyles } from '@mui/material';

const showDate = (d) => (d ? d.split('-').reverse().join('-') : '');

// While printing (A4 landscape), only the .trip-sheet-print block is shown; on screen it is hidden
const PRINT_STYLES = {
  '.trip-sheet-print': { display: 'none' },
  '@media print': {
    '@page': { size: 'A4 landscape', margin: '12mm' },
    'body *': { visibility: 'hidden' },
    '.trip-sheet-print, .trip-sheet-print *': { visibility: 'visible' },
    '.trip-sheet-print': { display: 'block', position: 'absolute', left: 0, top: 0, width: '100%' },
  },
};

const td = { border: '1px solid #555', padding: '4px 6px', fontSize: 12 };
const th = { ...td, background: '#eee', fontWeight: 700, textAlign: 'center' };
const numTd = { ...td, textAlign: 'right' };

// Printed trip sheet: one row per customer (in the sheet's order) with its cases (pack qty) per company - branch.
// groups: the Selected Customer groups from the screen ({ name, place, bills: [{ company_branch, pack_qty }] })
export default function TripSheetPrint({ sheet, groups }) {
  if (!sheet) return null;
  const branches = [...new Set(groups.flatMap((g) => g.bills.map((b) => b.company_branch)))].sort();
  const cases = (bills, branch) => bills
    .filter((b) => branch === undefined || b.company_branch === branch)
    .reduce((sum, b) => sum + (Number(b.pack_qty) || 0), 0);
  const allBills = groups.flatMap((g) => g.bills);

  return (
    <>
      <GlobalStyles styles={PRINT_STYLES} />
      <div className="trip-sheet-print" style={{ fontFamily: 'Arial, sans-serif', color: '#000' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 8 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>Trip Sheet {sheet.tsc_no}</div>
            <div style={{ fontSize: 13 }}>
              Route: <b>{sheet.route_name}</b> &nbsp;·&nbsp; Loading: <b>{showDate(sheet.loading_date)} ({sheet.loading_day})</b>
              &nbsp;·&nbsp; Driver: <b>{sheet.driver_name}</b>
            </div>
          </div>
          <div style={{ fontSize: 11, textAlign: 'right' }}>
            {groups.length} customers · {allBills.length} bills · {cases(allBills)} cases
            <br />
            Printed {new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
          </div>
        </div>

        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={th}>Sl #</th>
              <th style={{ ...th, textAlign: 'left' }}>Customer</th>
              <th style={{ ...th, textAlign: 'left' }}>Place</th>
              {branches.map((br) => <th key={br} style={th}>{br}</th>)}
              <th style={th}>Total</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((g, i) => (
              <tr key={g.key} style={{ breakInside: 'avoid' }}>
                <td style={{ ...td, textAlign: 'center' }}>{i + 1}</td>
                <td style={td}>{g.name}</td>
                <td style={td}>{g.place}</td>
                {branches.map((br) => <td key={br} style={numTd}>{cases(g.bills, br) || ''}</td>)}
                <td style={{ ...numTd, fontWeight: 700 }}>{cases(g.bills)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td style={{ ...td, fontWeight: 700 }} colSpan={3}>Total</td>
              {branches.map((br) => <td key={br} style={{ ...numTd, fontWeight: 700 }}>{cases(allBills, br)}</td>)}
              <td style={{ ...numTd, fontWeight: 700 }}>{cases(allBills)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </>
  );
}
