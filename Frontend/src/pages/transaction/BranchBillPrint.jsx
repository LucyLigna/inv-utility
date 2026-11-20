import { createPortal } from 'react-dom';
import { GlobalStyles } from '@mui/material';

// Branch Wise Bill Marking: one page per trip sheet with this branch's bills on it, customers in route order.
// Rendered straight into <body> and shown only while printing (like Trip Sheet - Bill Details' print).
const printStyles = {
  '.branch-bill-print': { display: 'none' },
  '@media print': {
    '@page': { size: 'A4 portrait', margin: '12mm' },
    'body > *:not(.branch-bill-print)': { display: 'none !important' },
    '.branch-bill-print': { display: 'block' },
  },
};

const showDate = (d) => (d ? d.split('-').reverse().join('-') : '');
const money = (v) => Number(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const td = { border: '1px solid #555', padding: '4px 6px', fontSize: 12, verticalAlign: 'top' };
const th = { ...td, background: '#eee', fontWeight: 700, textAlign: 'center' };
const numTd = { ...td, textAlign: 'right', whiteSpace: 'nowrap' };

// sheets: the tree's trip sheets [{ code, name, info, customers: [{ key, name, place, bills, cases, amount, hasAmount }],
//   bills, cases, amount, hasAmount }]; casesOf(bill, sheetCode): the bill's cases on that sheet
export default function BranchBillPrint({ sheets, branch, fromDate, toDate, casesOf }) {
  if (!sheets || !sheets.length) return null;
  const printed = new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
  return createPortal(
    <>
      <GlobalStyles styles={printStyles} />
      <div className="branch-bill-print" style={{ fontFamily: 'Arial, sans-serif', color: '#000' }}>
        {sheets.map((s, si) => {
          let sl = 0;
          return (
            <div key={s.code} style={si < sheets.length - 1 ? { breakAfter: 'page' } : undefined}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 10 }}>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 700 }}>Trip Sheet {s.name}</div>
                  {s.info && <div style={{ fontSize: 13 }}>{s.info}</div>}
                  <div style={{ fontSize: 13 }}>
                    Branch: <b>{branch}</b> &nbsp;·&nbsp; Bill date {showDate(fromDate)}{toDate !== fromDate ? ` to ${showDate(toDate)}` : ''}
                  </div>
                </div>
                <div style={{ fontSize: 11, textAlign: 'right' }}>
                  {s.customers.length} customers · {s.bills} bills · {s.cases} cases
                  <br />
                  Printed {printed}
                </div>
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                <colgroup>
                  <col style={{ width: 36 }} />
                  <col />
                  <col style={{ width: '17%' }} />
                  <col style={{ width: 80 }} />
                  <col style={{ width: 78 }} />
                  <col style={{ width: 52 }} />
                  <col style={{ width: 92 }} />
                </colgroup>
                <thead>
                  <tr>
                    <th style={th}>Sl #</th>
                    <th style={{ ...th, textAlign: 'left' }}>Customer</th>
                    <th style={{ ...th, textAlign: 'left' }}>Place</th>
                    <th style={th}>Bill #</th>
                    <th style={th}>Bill date</th>
                    <th style={{ ...th, fontSize: 11 }}>Cases</th>
                    <th style={th}>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {s.customers.map((c) => {
                    sl += 1;
                    const n = sl;
                    return c.bills.map((b, bi) => (
                      <tr key={`${c.key}:${b.sm_slno}`} style={{ breakInside: 'avoid' }}>
                        {bi === 0 && (
                          <>
                            <td style={{ ...td, textAlign: 'center' }} rowSpan={c.bills.length + (c.bills.length > 1 ? 1 : 0)}>{n}</td>
                            <td style={td} rowSpan={c.bills.length + (c.bills.length > 1 ? 1 : 0)}><b>{c.name}</b></td>
                            <td style={td} rowSpan={c.bills.length + (c.bills.length > 1 ? 1 : 0)}>{c.place}</td>
                          </>
                        )}
                        <td style={{ ...td, textAlign: 'center' }}>{b.smc_no}</td>
                        <td style={{ ...td, textAlign: 'center' }}>{showDate(b.bill_date)}</td>
                        <td style={numTd}>{casesOf(b, s.code)}</td>
                        <td style={numTd}>{b.net_amount == null ? '' : money(b.net_amount)}</td>
                      </tr>
                    )).concat(c.bills.length > 1 ? [(
                      <tr key={`${c.key}:total`} style={{ breakInside: 'avoid' }}>
                        <td style={{ ...td, textAlign: 'right', fontStyle: 'italic' }} colSpan={2}>Customer total</td>
                        <td style={{ ...numTd, fontWeight: 700 }}>{c.cases}</td>
                        <td style={{ ...numTd, fontWeight: 700 }}>{c.hasAmount ? money(c.amount) : ''}</td>
                      </tr>
                    )] : []);
                  })}
                </tbody>
                <tfoot>
                  <tr>
                    <td style={{ ...td, fontWeight: 700 }} colSpan={5}>Total ({s.bills} bills)</td>
                    <td style={{ ...numTd, fontWeight: 700 }}>{s.cases}</td>
                    <td style={{ ...numTd, fontWeight: 700 }}>{s.hasAmount ? money(s.amount) : ''}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          );
        })}
      </div>
    </>,
    document.body,
  );
}
