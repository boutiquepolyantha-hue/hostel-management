-- Demo data for the Residence Management system.
-- Run this once in Supabase SQL Editor.  It creates demo users for both
-- buildings and uses 12345678 as the password for every demo student and guardian.
-- The rows are prefixed with UDEMO/GDEMO/DEMO so they can be removed safely.

begin;

-- Ensure both residences exist without changing existing buildings.
insert into buildings (code, name, is_active)
values ('B1', 'Building 1', true), ('B2', 'Building 2', true)
on conflict (code) do update set name = excluded.name, is_active = true;

-- Remove only rows created by an earlier run, in foreign-key order.
delete from bus_passengers p using bus_trips t
where p.trip_id = t.id and t.bus_number like 'DEMO BUS %';
delete from bus_trips where bus_number like 'DEMO BUS %';
delete from dorm_access_requests where student_id in
  (select id from students where university_id like 'UDEMO%');
delete from entry_exit_records where student_id in
  (select id from students where university_id like 'UDEMO%');
delete from tamam_records where student_id in
  (select id from students where university_id like 'UDEMO%');
delete from guardian_student_links where student_id in
  (select id from students where university_id like 'UDEMO%')
   or guardian_id in (select id from guardians where guardian_code like 'GDEMO%');
delete from student_credentials where student_id in
  (select id from students where university_id like 'UDEMO%');
delete from students where university_id like 'UDEMO%';
delete from guardians where guardian_code like 'GDEMO%';

-- Password hash for 12345678 (PBKDF2-SHA256, the same format used by the API).
-- Students are distributed across both buildings and UAE cities.
with demo_rows as (
  select * from (values
    (1,'UDEMO1001','Mariam Saeed Al Mansoori','mariam.almansoori','0501001001','Abu Dhabi','B1','101','inside'),
    (2,'UDEMO1002','Fatema Khalifa Al Nuaimi','fatema.alnuaimi','0501001002','Al Ain','B1','102','outside'),
    (3,'UDEMO1003','Alya Mohammed Al Dhaheri','alya.aldhaheri','0501001003','Dubai','B1','103','inside'),
    (4,'UDEMO1004','Latifa Hamad Al Mazrouei','latifa.mazrouei','0501001004','Sharjah','B1','104','inside'),
    (5,'UDEMO1005','Noora Saif Al Shamsi','noora.shamsi','0501001005','Al Shahama','B1','105','outside'),
    (6,'UDEMO1006','Hessa Ahmed Al Marri','hessa.almarri','0501001006','Bani Yas','B1','106','inside'),
    (7,'UDEMO1007','Reem Abdullah Al Qasimi','reem.alqasimi','0501001007','Khor Fakkan','B1','107','outside'),
    (8,'UDEMO1008','Maitha Rashid Al Kaabi','maitha.alkaabi','0501001008','Fujairah','B1','108','inside'),
    (9,'UDEMO1009','Shamma Khalid Al Suwaidi','shamma.alsuwaidi','0501001009','Ras Al Khaimah','B1','109','inside'),
    (10,'UDEMO1010','Mona Salem Al Hammadi','mona.alhammadi','0501001010','Khalifa City','B1','110','outside'),
    (11,'UDEMO1011','Aisha Nasser Al Mansoori','aisha.almansoori','0501001011','Mohammed Bin Zayed City','B2','201','inside'),
    (12,'UDEMO1012','Sheikha Faisal Al Ketbi','sheikha.alketbi','0501001012','Al Rahba','B2','202','inside'),
    (13,'UDEMO1013','Dana Rashid Al Falasi','dana.alfalasi','0501001013','Al Samha','B2','203','outside'),
    (14,'UDEMO1014','Mariam Hamdan Al Naqbi','mariam.alnaqbi','0501001014','Madinat Zayed','B2','204','inside'),
    (15,'UDEMO1015','Sarah Yousif Al Darmaki','sarah.aldarmaki','0501001015','Ruwais','B2','205','outside'),
    (16,'UDEMO1016','Noura Ali Al Hosani','noura.alhosani','0501001016','Ghayathi','B2','206','inside'),
    (17,'UDEMO1017','Maha Sultan Al Neyadi','maha.alneyadi','0501001017','Dubai','B2','207','inside'),
    (18,'UDEMO1018','Afra Rashid Al Shamsi','afra.alshamsi','0501001018','Abu Dhabi','B2','208','outside'),
    (19,'UDEMO1019','Mouza Khalfan Al Ameri','mouza.alameri','0501001019','Al Ain','B2','209','inside'),
    (20,'UDEMO1020','Hind Saeed Al Mazrouei','hind.mazrouei','0501001020','Sharjah','B2','210','inside')
  ) as x(n,university_id,full_name,email_prefix,phone,city,building_code,room_number,current_status)
)
insert into students (university_id,full_name,email,phone,city,building_id,room_number,current_status,is_active,face_image,rfid_uid,fingerprint_id)
select university_id, full_name, email_prefix || '@demo.hostel', phone, city,
       b.id, room_number, current_status, true, null,
       'RFID-DEMO-' || lpad(n::text,3,'0'), 9000+n
from demo_rows d join buildings b on b.code=d.building_code;

insert into student_credentials (student_id,password_hash)
select id, '9f1c2d3e4a5b6c7d8e9f001122334455:5fe7280dd8df01e0fcbe1f678c7a45a34b24dfd10bc6aa4e520c3f110aee1db5'
from students where university_id like 'UDEMO%';

insert into guardians (guardian_code,full_name,emirates_id,email,phone,city,relationship,password_hash,is_active,face_image,face_status,identity_match)
select 'GDEMO' || lpad(n::text,3,'0'), full_name, '784-1990-' || lpad((100000+n)::text,7,'0'),
       lower(regexp_replace(full_name,' ','','g')) || '@demo.hostel', '050200' || lpad(n::text,4,'0'), city,
       relationship, '9f1c2d3e4a5b6c7d8e9f001122334455:5fe7280dd8df01e0fcbe1f678c7a45a34b24dfd10bc6aa4e520c3f110aee1db5', true,
       null, case when n % 5 = 0 then 'enrollment_pending' else 'verified' end, case when n % 5 = 0 then 0 else 94+n%6 end
from (values
 (1,'Khalid Saeed Al Mansoori','Abu Dhabi','Father'),(2,'Aisha Mohammed Al Nuaimi','Al Ain','Mother'),
 (3,'Saeed Hamad Al Dhaheri','Dubai','Father'),(4,'Mariam Ahmed Al Mazrouei','Sharjah','Mother'),
 (5,'Ahmed Rashid Al Shamsi','Bani Yas','Brother'),(6,'Noura Khalifa Al Marri','Al Shahama','Mother'),
 (7,'Hamad Abdullah Al Qasimi','Khor Fakkan','Father'),(8,'Fatma Saif Al Kaabi','Fujairah','Mother'),
 (9,'Rashid Khalid Al Suwaidi','Ras Al Khaimah','Father'),(10,'Salem Nasser Al Hammadi','Khalifa City','Uncle'),
 (11,'Hessa Faisal Al Ketbi','Al Rahba','Mother'),(12,'Mubarak Yousif Al Falasi','Madinat Zayed','Father')
) as g(n,full_name,city,relationship);

-- A mixture of approved, pending, and rejected relationships.
insert into guardian_student_links (guardian_id,student_id,relationship,status,can_check_in,can_check_out,requested_at,reviewed_at,supervisor_note)
select g.id,s.id,case when (g.id+s.id)%3=0 then 'Mother' when (g.id+s.id)%3=1 then 'Father' else 'Brother' end,
       case when s.id%5=0 then 'rejected' when s.id%3=0 then 'pending' else 'approved' end,
       s.id%5<>0,s.id%5<>0,now()-((s.id%20)||' days')::interval,
       case when s.id%3=0 then null else now()-((s.id%10)||' days')::interval end,
       'Demo relationship record'
from guardians g join students s on g.guardian_code='GDEMO' || lpad((((s.id-1)%12)+1)::text,3,'0')
where s.university_id like 'UDEMO%';

-- Today’s Tamam rows: a deliberately mixed completion pattern.
insert into tamam_records (student_id,record_date,status,verification_method,completed_at)
select id,current_date::text,case when id%4 in (0,1) then 'completed' else 'not_completed' end,
       case when id%4=0 then 'fingerprint' when id%4=1 then 'face' else null end,
       case when id%4 in (0,1) then now()-((id%180)||' minutes')::interval else null end
from students where university_id like 'UDEMO%';

-- Entry/exit activity for both buildings, including failed/expired cases.
insert into entry_exit_records (student_id,guardian_id,action,qr_status,face_status,occurred_at)
select s.id,g.id,case when s.id%2=0 then 'check_out' else 'check_in' end,
       case when s.id%6=0 then 'expired' when s.id%4=0 then 'used' else 'unused' end,
       case when s.id%7=0 then 'failed' else 'verified' end,
       now()-((s.id%12)||' hours')::interval
from students s left join guardians g on g.guardian_code='GDEMO' || lpad((((s.id-1)%12)+1)::text,3,'0')
where s.university_id like 'UDEMO%';

-- Bus schedules for both buildings and passenger verification statuses.
insert into bus_trips (building_id,bus_number,destination,departure_at,capacity,status)
select b.id,'DEMO BUS '||n, date_trunc('day', now()) + ((7 + (n % 8)) || ' hours')::interval,30,
       case when n%4=0 then 'completed' when n%3=0 then 'departed' when n%2=0 then 'boarding' else 'scheduled' end
from (values (1,'Abu Dhabi'),(2,'Al Ain'),(3,'Dubai'),(4,'Al Shahama'),
             (5,'Bani Yas'),(6,'Fujairah'),(7,'Ruwais'),(8,'Ghayathi')) as x(n,city)
join buildings b on b.code=case when n<=4 then 'B1' else 'B2' end;

insert into bus_passengers (trip_id,student_id,status,verification_method,boarded_at)
select t.id,s.id,case when s.id%3=0 then 'not_boarded' when s.id%5=0 then 'pending' else 'boarded' end,
       case when s.id%3=0 then null when s.id%2=0 then 'rfid' else 'face' end,
       case when s.id%3=0 then null else now()-((s.id%90)||' minutes')::interval end
from bus_trips t join students s on s.building_id=t.building_id and s.university_id like 'UDEMO%'
where t.bus_number like 'DEMO BUS %' and s.id%4 = (t.id%4);

insert into dorm_access_requests (student_id,guardian_id,action,status,face_verified,created_at,expires_at,used_at)
select s.id,g.id,case when s.id%2=0 then 'check_out' else 'check_in' end,
       case when s.id%4=0 then 'approved' when s.id%3=0 then 'denied' else 'face_pending' end,
       s.id%4=0,now()-((s.id%8)||' hours')::interval,now()+interval '2 hours',case when s.id%4=0 then now()-interval '1 hour' else null end
from students s join guardians g on g.guardian_code='GDEMO' || lpad((((s.id-1)%12)+1)::text,3,'0')
where s.university_id like 'UDEMO%';

insert into audit_logs (event_type,entity_type,entity_id,occurred_at,details)
select 'demo_seed','student',id,now(),'{"source":"demo seed","password":"12345678"}'
from students where university_id like 'UDEMO%';

commit;

-- Verification query: should return non-zero counts for every major page.
select
 (select count(*) from students where university_id like 'UDEMO%') as demo_students,
 (select count(*) from guardians where guardian_code like 'GDEMO%') as demo_guardians,
 (select count(*) from guardian_student_links where supervisor_note='Demo relationship record') as relationships,
 (select count(*) from tamam_records t join students s on s.id=t.student_id where s.university_id like 'UDEMO%') as tamam,
 (select count(*) from bus_trips where bus_number like 'DEMO BUS %') as bus_trips,
 (select count(*) from entry_exit_records e join students s on s.id=e.student_id where s.university_id like 'UDEMO%') as entry_exit;
