import { createPortal } from 'react-dom';
import { GlobalStyles } from '@mui/material';

const showDate = (d) => (d ? d.split('-').reverse().join('-') : '');
const money = (v) => Number(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// While printing, only the .trip-sheet-print block is shown; on screen it is hidden.
// The block is rendered straight into <body>, beside the app (#root) and MUI's pop-ups, so all of those can
// be left out of the printout completely; hiding them with visibility would still take up their height and
// add blank pages.
const printStyles = (landscape) => ({
  '.trip-sheet-print': { display: 'none' },
  '@media print': {
    '@page': { size: `A4 ${landscape ? 'landscape' : 'portrait'}`, margin: '12mm' },
    'body > *:not(.trip-sheet-print)': { display: 'none !important' },
    '.trip-sheet-print': { display: 'block' },
  },
});

const td = { border: '1px solid #555', padding: '4px 6px', fontSize: 12 };
const th = { ...td, background: '#eee', fontWeight: 700, textAlign: 'center' };
const numTd = { ...td, textAlign: 'right' };
const QTY_WIDTH = 62; // px, each branch's pack qty column and the total; Customer and Place share the rest

const packs = (bills, branch) => bills
  .filter((b) => branch === undefined || b.company_branch === branch)
  .reduce((sum, b) => sum + (Number(b.pack_qty) || 0), 0);
const amount = (bills) => bills.reduce((sum, b) => sum + (Number(b.net_amount) || 0), 0);

const branchesOf = (bills) => [...new Set(bills.map((b) => b.company_branch))].sort();

// The customer summary as an .xlsx file: the same table as the "Summary by branch" print
export async function exportSummaryExcel(sheet, groups) {
  const { default: writeExcelFile } = await import('write-excel-file/browser');
  const allBills = groups.flatMap((g) => g.bills);
  const branches = branchesOf(allBills);
  const bold = (value) => ({ value, fontWeight: 'bold' });
  // Table cells get a thin border all round, empty ones too, so the table reads as a grid
  const boxed = (value, extra) => ({ value: value ?? '', type: typeof value === 'number' ? Number : String, borderStyle: 'thin', ...extra });
  const head = (value) => boxed(value, { fontWeight: 'bold' });
  const data = [
    [bold(`Trip Sheet ${sheet.tsc_no}`)],
    [`Route: ${sheet.route_name}`, null, `Loading: ${showDate(sheet.loading_date)} (${sheet.loading_day})`, null, `Driver: ${sheet.driver_name}`],
    [],
    [head('Sl #'), head('Customer'), head('Place'), ...branches.map(head), head('Total')],
    ...groups.map((g, i) => [
      boxed(i + 1), boxed(g.name), boxed(g.place), ...branches.map((br) => boxed(packs(g.bills, br) || null)), boxed(packs(g.bills)),
    ]),
    [head('Total'), head(null), head(null), ...branches.map((br) => head(packs(allBills, br))), head(packs(allBills))],
  ];
  await writeExcelFile(data, {
    sheet: sheet.tsc_no,
    columns: [{ width: 6 }, { width: 40 }, { width: 22 }, ...branches.map(() => ({ width: 12 })), { width: 10 }],
  }).toFile(`${sheet.tsc_no} customer summary.xlsx`);
}

// Summary: one row per customer with its cases (pack qty) per company - branch
function BranchSummary({ groups, allBills }) {
  const branches = branchesOf(allBills);
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
      <colgroup>
        <col style={{ width: 40 }} />
        <col />
        <col style={{ width: '22%' }} />
        {branches.map((br) => <col key={br} style={{ width: QTY_WIDTH }} />)}
        <col style={{ width: QTY_WIDTH }} />
      </colgroup>
      <thead>
        <tr>
          <th style={th}>Sl #</th>
          <th style={{ ...th, textAlign: 'left' }}>Customer</th>
          <th style={{ ...th, textAlign: 'left' }}>Place</th>
          {branches.map((br) => <th key={br} style={{ ...th, fontSize: 11, padding: '4px 2px' }}>{br}</th>)}
          <th style={{ ...th, fontSize: 11, padding: '4px 2px' }}>Total</th>
        </tr>
      </thead>
      <tbody>
        {groups.map((g, i) => (
          <tr key={g.key} style={{ breakInside: 'avoid' }}>
            <td style={{ ...td, textAlign: 'center' }}>{i + 1}</td>
            <td style={td}>{g.name}</td>
            <td style={td}>{g.place}</td>
            {branches.map((br) => <td key={br} style={numTd}>{packs(g.bills, br) || ''}</td>)}
            <td style={{ ...numTd, fontWeight: 700 }}>{packs(g.bills)}</td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr>
          <td style={{ ...td, fontWeight: 700 }} colSpan={3}>Total</td>
          {branches.map((br) => <td key={br} style={{ ...numTd, fontWeight: 700 }}>{packs(allBills, br)}</td>)}
          <td style={{ ...numTd, fontWeight: 700 }}>{packs(allBills)}</td>
        </tr>
      </tfoot>
    </table>
  );
}

// Customer-wise: for each customer its place, mobile and sales executive, then its bills, and on the right the
// delivery QR code the driver scans at that customer (with its code underneath, to type if the scan fails)
// Each customer takes a quarter of the page (A4 portrait leaves about 273 mm), four customers to a page
const CUSTOMERS_PER_PAGE = 4;
const CUSTOMER_BLOCK_HEIGHT = '60mm';
const QR_SIZE = '30mm';

function CustomerBills({ groups, allBills, contacts, qr }) {
  const info = { ...td, fontSize: 12, background: '#f7f7f7' };
  return (
    <>
      {groups.map((g, i) => {
        const c = contacts[g.key] || {};
        const q = qr[g.key];
        const pageEnds = (i + 1) % CUSTOMERS_PER_PAGE === 0 && i < groups.length - 1;
        return (
          <div
            key={g.key}
            style={{
              breakInside: 'avoid', minHeight: CUSTOMER_BLOCK_HEIGHT, display: 'flex', alignItems: 'flex-start', gap: '3mm',
              ...(pageEnds && { breakAfter: 'page' }),
            }}
          >
            {/* One box per customer: its details on top, then its bills */}
            <table style={{ flex: 1, minWidth: 0, borderCollapse: 'collapse', tableLayout: 'fixed' }}>
              <colgroup>
                <col style={{ width: '25%' }} />
                <col style={{ width: '30%' }} />
                <col style={{ width: '25%' }} />
                <col style={{ width: '20%' }} />
              </colgroup>
              <thead>
                <tr>
                  <td style={{ ...info, fontSize: 13 }} colSpan={2}><b>{i + 1}. {g.name}</b></td>
                  <td style={info} colSpan={2}>Place: <b>{g.place || '—'}</b></td>
                </tr>
                <tr>
                  <td style={info} colSpan={2}>Sales Executive: <b>{c.sales_executive || '—'}</b></td>
                  <td style={info} colSpan={2}>Mobile #: <b>{c.mobile || '—'}</b></td>
                </tr>
                <tr>
                  <th style={{ ...th, textAlign: 'left' }}>Bill #</th>
                  <th style={{ ...th, textAlign: 'left' }}>Branch Code</th>
                  <th style={{ ...th, textAlign: 'right' }}>Amount</th>
                  <th style={{ ...th, textAlign: 'right' }}>No. of Packs</th>
                </tr>
              </thead>
              <tbody>
                {g.bills.map((b) => (
                  <tr key={`${b.company_code}|${b.ba_code}|${b.sm_slno}`}>
                    <td style={td}>{b.smc_no}</td>
                    <td style={td}>{b.company_branch}</td>
                    <td style={numTd}>{money(b.net_amount)}</td>
                    <td style={numTd}>{b.pack_qty}</td>
                  </tr>
                ))}
                {g.bills.length > 1 && (
                  <tr>
                    <td style={{ ...td, fontWeight: 700 }} colSpan={2}>Total ({g.bills.length} bills)</td>
                    <td style={{ ...numTd, fontWeight: 700 }}>{money(amount(g.bills))}</td>
                    <td style={{ ...numTd, fontWeight: 700 }}>{packs(g.bills)}</td>
                  </tr>
                )}
              </tbody>
            </table>
            {q && (
              <div style={{ width: QR_SIZE, flex: 'none', textAlign: 'center', border: '1px solid #555', padding: '1.5mm' }}>
                <img src={q.image} alt={`Delivery QR ${q.code}`} style={{ width: '100%', display: 'block' }} />
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, marginTop: 2 }}>{q.code}</div>
                <div style={{ fontSize: 9 }}>Scan on delivery</div>
              </div>
            )}
          </div>
        );
      })}
      <div style={{ borderTop: '2px solid #000', paddingTop: 6, fontSize: 13, fontWeight: 700, breakInside: 'avoid' }}>
        Grand total: {allBills.length} bills · ₹ {money(amount(allBills))} · {packs(allBills)} packs
      </div>
    </>
  );
}

// Printed trip sheet. format: 'branch' (summary per company - branch, landscape) | 'customer' (bills per customer).
// groups: the Selected Customer groups from the screen ({ key, name, place, bills }); contacts: mobile and sales
// executive per customer key; qr: delivery QR per customer key ({ code, image }).
export default function TripSheetPrint({ sheet, groups, format = 'branch', contacts = {}, qr = {} }) {
  if (!sheet) return null;
  const allBills = groups.flatMap((g) => g.bills);

  return createPortal(
    <>
      <GlobalStyles styles={printStyles(format === 'branch')} />
      <div className="trip-sheet-print" style={{ fontFamily: 'Arial, sans-serif', color: '#000' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 10 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>Trip Sheet {sheet.tsc_no}</div>
            <div style={{ fontSize: 13 }}>
              Route: <b>{sheet.route_name}</b> &nbsp;·&nbsp; Loading: <b>{showDate(sheet.loading_date)} ({sheet.loading_day})</b>
              &nbsp;·&nbsp; Driver: <b>{sheet.driver_name}</b>
            </div>
          </div>
          <div style={{ fontSize: 11, textAlign: 'right' }}>
            {groups.length} customers · {allBills.length} bills · {packs(allBills)} cases
            <br />
            Printed {new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
          </div>
        </div>
        {format === 'customer'
          ? <CustomerBills groups={groups} allBills={allBills} contacts={contacts} qr={qr} />
          : <BranchSummary groups={groups} allBills={allBills} />}
      </div>
    </>,
    document.body,
  );
}
