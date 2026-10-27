// Supports the existing daily UTC tasks only. Reject changes we cannot evaluate.
const GRACE_MS = 2 * 3600000;
function scheduleParts(schedule) {
  const lines = String(schedule).split(/\r?\n/);
  const rules = lines.filter(line => line.startsWith('RRULE:'));
  if (rules.length !== 1) throw Error('Unsupported watchdog schedule');
  const fields = rules[0].slice(6).split(';').map(part => part.split('='));
  const allowed = new Set(['FREQ','BYHOUR','BYMINUTE','BYSECOND','INTERVAL']);
  if (fields.some(([key,value,...extra]) => !allowed.has(key) || !value || extra.length) || new Set(fields.map(([key]) => key)).size !== fields.length) throw Error('Unsupported watchdog schedule');
  const rule = Object.fromEntries(fields);
  if (rule.FREQ !== 'DAILY' || rule.INTERVAL && rule.INTERVAL !== '1' || rule.BYSECOND && rule.BYSECOND !== '0' || !/^\d+(,\d+)*$/.test(rule.BYHOUR || '') || !/^\d+$/.test(rule.BYMINUTE || '0')) throw Error('Unsupported watchdog schedule');
  const hours = rule.BYHOUR.split(',').map(Number), minute = Number(rule.BYMINUTE || 0);
  if (hours.some(hour => hour > 23) || minute > 59) throw Error('Unsupported watchdog schedule');
  const starts = lines.filter(line => line.startsWith('DTSTART'));
  if (starts.length > 1 || lines.some(line => /^(EXDATE|RDATE|EXRULE)/.test(line))) throw Error('Unsupported watchdog schedule');
  let start = -Infinity;
  if (starts.length) {
    const match = starts[0].match(/^DTSTART(?:(?:;TZID=Etc\/UTC)|(?:;TZID=UTC))?:(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z?$/);
    if (!match) throw Error('Unsupported watchdog timezone or start');
    const [,year,month,day,hour,min,sec] = match;
    const iso = `${year}-${month}-${day}T${hour}:${min}:${sec}.000Z`;
    start = Date.parse(iso);
    if (!Number.isFinite(start) || new Date(start).toISOString() !== iso) throw Error('Invalid watchdog start');
  }
  return {hours,minute,start};
}
export function dueUTC(schedule, now = new Date(), graceMs = GRACE_MS) {
  if (!Number.isFinite(+now) || !Number.isFinite(graceMs) || graceMs < 0) throw Error('Invalid watchdog clock');
  const {hours,minute,start} = scheduleParts(schedule), cutoff = +now - graceMs;
  const dates = [];
  for (let day = 0; day < 2; day++) for (const hour of hours) {
    const date = new Date(cutoff);
    date.setUTCDate(date.getUTCDate() - day);
    date.setUTCHours(hour,minute,0,0);
    if (+date <= cutoff && +date >= start) dates.push(+date);
  }
  return dates.length ? new Date(Math.max(...dates)).toISOString() : null;
}
export function checkRun(task, now = new Date()) {
  if (!task?.is_enabled) return {ok:false,reason:'Task missing or disabled'};
  if (task.default_timezone && !['Etc/UTC','UTC'].includes(task.default_timezone)) throw Error('Unsupported watchdog timezone');
  const expected = dueUTC(task.schedule,now), run = task.run_details?.last_run;
  if (!run && !expected) return {ok:true,pending:true,reason:'No run due yet',expected,deliveryVerified:false};
  const scheduled = Date.parse(run?.scheduled_for);
  if (!run || !Number.isFinite(scheduled) || scheduled > +now || expected && scheduled < Date.parse(expected)) return {ok:false,reason:'Expected scheduled run has no valid record',expected};
  // Reject off-schedule records instead of letting an arbitrary recent timestamp hide a miss.
  if (dueUTC(task.schedule,new Date(scheduled),0) !== new Date(scheduled).toISOString()) return {ok:false,reason:'Run timestamp does not match schedule',expected};
  if (run.recorded_status === 'in_progress' && +now - scheduled < GRACE_MS) return {ok:true,pending:true,reason:'Run remains within grace period; earlier run history is not available',expected,deliveryVerified:false};
  if (!['completed','no_update'].includes(run.recorded_status)) return {ok:false,reason:'Latest run failed or has not completed',expected,status:run.recorded_status};
  const result = task.run_details.latest_result;
  if (result?.run_id === run.id && result?.is_failure_message) {
    const created = Date.parse(result.created_at), started = Date.parse(run.started_at);
    if (!Number.isFinite(created) || !Number.isFinite(started) || created >= started) return {ok:false,reason:'Latest task result reports failure or cannot be attributed safely',expected};
  }
  return {ok:true,expected,scheduledFor:run.scheduled_for,deliveryVerified:task.run_details.delivery_status === 'delivered'};
}
