import {test} from 'node:test';import assert from 'node:assert/strict';import {checkRun,dueUTC} from '../scripts/lib/watchdog.mjs';
const schedule='BEGIN:VEVENT\nRRULE:FREQ=DAILY;BYHOUR=8,20;BYMINUTE=0\nEND:VEVENT';const now=new Date('2026-10-27T11:00:00Z');
test('watchdog catches missing, late, failed and disabled checks; accepts completed run without claiming delivery',()=>{const base={is_enabled:true,schedule};assert.equal(dueUTC(schedule,now),'2026-10-27T08:00:00.000Z');assert.equal(dueUTC(schedule,new Date('2026-10-27T09:00:00Z')),'2026-10-26T20:00:00.000Z');assert(!checkRun(base,now).ok);for(const state of ['failed','in_progress'])assert(!checkRun({...base,run_details:{last_run:{scheduled_for:'2026-10-27T08:00:00Z',recorded_status:state}}},now).ok);const good=checkRun({...base,run_details:{last_run:{id:'current',scheduled_for:'2026-10-27T08:00:00Z',recorded_status:'completed'},delivery_status:'unknown'}},now);assert(good.ok);assert.equal(good.deliveryVerified,false);assert(!checkRun({...base,is_enabled:false},now).ok)});

test('watchdog rejects malformed schedules and missing run timestamps',()=>{assert.throws(()=>dueUTC('RRULE:FREQ=DAILY',now));assert.throws(()=>dueUTC('RRULE:FREQ=DAILY;BYHOUR=8;BYMINUTE=90',now));assert(!checkRun({is_enabled:true,schedule,run_details:{last_run:{recorded_status:'completed'}}},now).ok)});

test('new tasks are not overdue before their first deadline',()=>{
 const future=schedule.replace('RRULE:', 'DTSTART:20261028T080000\nRRULE:');
 assert.equal(dueUTC(future,now),null);
 assert.equal(checkRun({is_enabled:true,schedule:future},now).pending,true);
 assert.equal(dueUTC(future,new Date('2026-10-28T09:59:59Z')),null);
 assert.equal(checkRun({is_enabled:true,schedule:future},new Date('2026-10-28T10:00:00Z')).ok,false);
});
test('in-progress run gets grace but cannot stay healthy past its deadline',()=>{
 const task={is_enabled:true,schedule,run_details:{last_run:{scheduled_for:'2026-10-27T08:00:00Z',recorded_status:'in_progress'}}};
 assert.equal(checkRun(task,new Date('2026-10-27T08:10:00Z')).pending,true);
 assert.equal(checkRun(task,new Date('2026-10-27T10:00:00Z')).ok,false);
});
test('unsupported recurrence rules fail instead of guessing daily UTC',()=>{
 for(const change of ['FREQ=DAILY;INTERVAL=2','FREQ=DAILY;BYDAY=MO','FREQ=DAILY;COUNT=1','FREQ=DAILY;BYSECOND=15']) assert.throws(()=>dueUTC(schedule.replace('FREQ=DAILY',change),now));
 for(const hour of ['8,','8x','24']) assert.throws(()=>dueUTC(schedule.replace('8,20',hour),now));
 assert.throws(()=>dueUTC(schedule.replace('RRULE:', 'DTSTART;TZID=Asia/Singapore:20261025T080000\nRRULE:'),now));
 assert.throws(()=>checkRun({is_enabled:true,schedule,default_timezone:'Asia/Singapore'},now));
});
test('off-schedule timestamps cannot conceal a missing run',()=>{
 assert.equal(checkRun({is_enabled:true,schedule,run_details:{last_run:{scheduled_for:'2026-10-27T10:59:00Z',recorded_status:'completed'}}},now).ok,false);
});
test('failure attribution rejects current failures and ignores stale retry output',()=>{
 const run={id:'same',scheduled_for:'2026-10-27T08:00:00Z',started_at:'2026-10-27T08:05:00Z',recorded_status:'completed'};
 const check=result=>checkRun({is_enabled:true,schedule,run_details:{last_run:run,latest_result:result}},now);
 assert.equal(check({run_id:'same',is_failure_message:true,created_at:'2026-10-27T08:06:00Z'}).ok,false);
 assert.equal(check({run_id:'same',is_failure_message:true,created_at:'2026-10-27T08:04:00Z'}).ok,true);
 assert.equal(check({run_id:'old',is_failure_message:true,created_at:'2026-10-27T08:06:00Z'}).ok,true);
 assert.equal(check({run_id:'same',is_failure_message:true}).ok,false);
});
