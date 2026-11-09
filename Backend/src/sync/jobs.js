// What each scheduled job pulls from the INV API and where it stores it.
// API fields come back in capitals (COMPANY_CODE); table columns are the same names in lower case.

const BASE_URL = process.env.INV_API_URL || 'http://192.168.3.24/INVUtility/Service1.svc/getinvdata';

const DAILY = '0 6 * * *'; // 06:00 every day
const EVERY_30_MIN = '*/30 * * * *';
 
module.exports = {
  company: {
    url: `${BASE_URL}/company`,
    table: 'company',
    schedule: DAILY,
    intervalMinutes: 24 * 60,
    keys: ['company_code'],
    columns: ['company_code', 'coc_desc', 'coc_add1', 'coc_add2', 'coc_add3', 'coc_add4', 'email'],
  },
  branch: {
    url: `${BASE_URL}/branch`,
    table: 'branch',
    schedule: DAILY,
    intervalMinutes: 24 * 60,
    keys: ['company_code', 'ba_code'],
    columns: [
      'company_code', 'ba_code', 'brc_desc', 'brc_alias', 'brc_add1', 'brc_add2', 'brc_add3', 'brc_add4',
      'brc_status', 'brc_link', 'last_update', 'brc_ho', 'link_yn',
    ],
  },
  territory: {
    url: `${BASE_URL}/territory`,
    table: 'territory',
    schedule: DAILY,
    intervalMinutes: 24 * 60,
    keys: ['company_code', 'tr_code'],
    columns: ['company_code', 'tr_code', 'trc_desc', 'trc_alias', 'weekday', 'ro_code', 'trc_status', 'inp_dt_tm'],
  },
  route: {
    url: `${BASE_URL}/route`,
    table: 'route',
    schedule: DAILY,
    intervalMinutes: 24 * 60,
    keys: ['company_code', 'ro_code'],
    columns: ['company_code', 'ro_code', 'roc_desc', 'roc_alias', 'se_code', 'ba_code', 'roc_status', 'inp_dt_tm'],
  },
  salesexecutive: {
    url: `${BASE_URL}/salesexecutive`,
    table: 'salesexecutive',
    schedule: DAILY,
    intervalMinutes: 24 * 60,
    keys: ['company_code', 'se_code'],
    columns: [
      'company_code', 'se_code', 'sec_desc', 'sec_alias', 'sec_status', 'us_code', 'inp_dt_tm', 'executive_type',
      'emc_alias', 'ba_code',
    ],
  },
  salesdetails: {
    url: `${BASE_URL}/salesdetails`,
    table: 'salesdetails',
    schedule: EVERY_30_MIN,
    intervalMinutes: 30,
    // Like customer, each call returns the next batch, so keep calling until it returns nothing
    loopUntilEmpty: true,
    keys: ['company_code', 'ba_code', 'sm_slno'],
    columns: [
      'company_code', 'ba_code', 'sm_slno', 'cu_code', 'cuc_desc', 'roc_desc', 'smc_no', 'smd_date', 'tp_code', 'tpc_desc', 'transporter_type',
      'net_amount', 'pack_qty', 'eway_billno', 'checked_ok', 'printed', 'inp_dt_tm',
    ],
  },
  customer: {
    url: `${BASE_URL}/customer`,
    table: 'customer',
    schedule: EVERY_30_MIN,
    intervalMinutes: 30,
    // The customer API returns the next batch on every call, so keep calling until it returns nothing
    loopUntilEmpty: true,
    keys: ['company_code', 'ba_code', 'cu_code'],
    columns: [
      'company_code', 'cu_code', 'sa_code', 'cuc_desc', 'cuc_alias', 'cuc_add1', 'cuc_add2', 'cuc_add3',
      'cuc_add4', 'cuc_pincode', 'cuc_mobile', 'tr_code', 'ba_code', 'cun_creditlimit', 'avg_sales', 'avg_coll',
      'avg_days', 'outstanding', 'over_due', 'cuc_status', 'cud_eddate', 'new_cucode', 'main_cucode',
      'main_cucname', 'account_code', 'cuc_place', 'gst_number',
    ],
  },
};
