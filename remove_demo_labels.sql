-- Rename the seeded records so the website does not display "DEMO".
-- Run this after seed_demo_all.sql in Supabase SQL Editor.

begin;

update students
set university_id = 'U2026' || right(university_id, 4),
    email = replace(email, '@demo.hostel', '@university.ae'),
    rfid_uid = replace(rfid_uid, 'RFID-DEMO-', 'RFID-')
where university_id like 'UDEMO%';

update guardians
set guardian_code = 'G2026' || right(guardian_code, 3),
    email = replace(email, '@demo.hostel', '@mail.ae')
where guardian_code like 'GDEMO%';

update guardian_student_links
set supervisor_note = 'Relationship submitted for review'
where supervisor_note = 'Demo relationship record';

update bus_trips
set bus_number = replace(bus_number, 'DEMO BUS', 'Bus')
where bus_number like 'DEMO BUS %';

update audit_logs
set details = '{"source":"initial data setup"}'
where details::text like '%demo seed%';

commit;

-- Verify that no visible seeded record still contains DEMO.
select
 (select count(*) from students where university_id like '%DEMO%') as demo_student_ids,
 (select count(*) from guardians where guardian_code like '%DEMO%') as demo_guardian_ids,
 (select count(*) from bus_trips where bus_number like '%DEMO%') as demo_bus_names;
