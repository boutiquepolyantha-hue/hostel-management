-- Creates records for every city currently saved in the students table.
-- Run in Supabase SQL Editor after the student/guardian seed.

begin;

-- Remove only city-bus rows made by this script so it is safe to rerun.
delete from bus_passengers p
using bus_trips t
where p.trip_id = t.id and t.bus_number like 'B%-CITY-%';
delete from bus_trips where bus_number like 'B%-CITY-%';

-- Add a Tamam record for every active student who does not yet have one today.
with numbered as (
  select s.id, row_number() over (order by s.id) as n
  from students s
  where s.is_active = true
    and not exists (
      select 1 from tamam_records t
      where t.student_id = s.id and t.record_date = current_date::text
    )
)
insert into tamam_records (student_id,record_date,status,verification_method,completed_at)
select id, current_date::text,
       case when n % 4 in (0,1) then 'completed' else 'not_completed' end,
       case when n % 4 = 0 then 'fingerprint'
            when n % 4 = 1 then 'face' else null end,
       case when n % 4 in (0,1) then now() - ((n % 180) || ' minutes')::interval else null end
from numbered;

-- Create one trip for every saved city in each building.
with cities as (
  select city, row_number() over (order by city) as n
  from (select distinct city from students where city is not null and trim(city) <> '') c
), buildings_to_use as (
  select id, code from buildings where code in ('B1','B2') and is_active = true
)
insert into bus_trips (building_id,bus_number,destination,departure_at,capacity,status)
select b.id,
       b.code || '-CITY-' || lpad(c.n::text,2,'0'),
       c.city,
       date_trunc('day', now()) + ((7 + (c.n % 10)) || ' hours')::interval,
       40,
       case when c.n % 4 = 0 then 'completed'
            when c.n % 3 = 0 then 'departed'
            when c.n % 2 = 0 then 'boarding'
            else 'scheduled' end
from cities c cross join buildings_to_use b;

-- Link students from each city to that city's trip in their building.
insert into bus_passengers (trip_id,student_id,status,verification_method,boarded_at)
select t.id, s.id,
       case when row_number() over (partition by t.id order by s.id) % 4 = 0 then 'not_boarded'
            when row_number() over (partition by t.id order by s.id) % 3 = 0 then 'pending'
            else 'boarded' end,
       case when s.id % 3 = 0 then 'rfid' when s.id % 2 = 0 then 'face' else 'card' end,
       case when s.id % 4 = 0 then null else now() - ((s.id % 90) || ' minutes')::interval end
from bus_trips t
join students s
  on s.building_id = t.building_id
 and s.city = t.destination
 and s.is_active = true
where t.bus_number like 'B%-CITY-%';

commit;

-- Counts by city, so you can confirm every saved city has data.
select s.city,
       count(distinct s.id) as students,
       count(distinct t.id) as tamam_records_today,
       count(distinct bt.id) as city_bus_trips,
       count(distinct bp.id) as bus_passengers
from students s
left join tamam_records t on t.student_id=s.id and t.record_date=current_date::text
left join bus_trips bt on bt.destination=s.city and bt.building_id=s.building_id and bt.bus_number like 'B%-CITY-%'
left join bus_passengers bp on bp.trip_id=bt.id and bp.student_id=s.id
group by s.city
order by s.city;
