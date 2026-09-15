insert into public.schools (id, name, city, state) values
  ('SCH-TEXARKANACOL', 'Texarkana College', 'Texarkana', 'TX'),
  ('SCH-LOCALTRAINING', 'Local Trade Training Partner', 'Texarkana', 'TX')
on conflict do nothing;

insert into public.programs (id, school_id, name, trade) values
  ('PRG-TC-HVAC', 'SCH-TEXARKANACOL', 'HVAC Technology', 'HVAC'),
  ('PRG-TC-ELEC', 'SCH-TEXARKANACOL', 'Electrical Technology', 'Electrical'),
  ('PRG-LTP-PLUMB', 'SCH-LOCALTRAINING', 'Plumbing Technology', 'Plumbing')
on conflict do nothing;

insert into public.skills (id, trade, category, name, description, sort_order) values
  ('SKL-HVAC-R410A', 'HVAC', 'Refrigeration', 'R-410A Refrigerant Recovery', 'Safely recover R-410A using approved equipment and procedures.', 10),
  ('SKL-HVAC-ELECDIAG', 'HVAC', 'Diagnostics', 'Electrical Diagnostics', 'Use a multimeter and sequence-of-operation checks to diagnose common faults.', 20),
  ('SKL-HVAC-SPLIT', 'HVAC', 'Installation', 'Residential Split-System Install', 'Assist with equipment placement, line-set preparation, drain routing, and startup.', 30),
  ('SKL-HVAC-STATIC', 'HVAC', 'Airflow', 'Static Pressure Measurement', 'Measure total external static pressure and interpret basic airflow constraints.', 40),
  ('SKL-ALL-LOTO', 'HVAC', 'Safety', 'Electrical Lockout / Tagout', 'Demonstrate safe de-energization and verification procedures before service work.', 50),
  ('SKL-ELEC-ROUGHIN', 'Electrical', 'Residential', 'Residential Rough-In Wiring', 'Lay out and install branch-circuit wiring during residential rough-in.', 10),
  ('SKL-ELEC-PANEL', 'Electrical', 'Service', 'Panel Termination Basics', 'Identify, route, and terminate conductors under instructor supervision.', 20),
  ('SKL-PLUMB-ROUGHIN', 'Plumbing', 'Residential', 'Residential Supply & DWV Rough-In', 'Lay out basic water supply and drain-waste-vent routing from plans.', 10),
  ('SKL-PLUMB-FIXTURE', 'Plumbing', 'Service', 'Fixture Installation', 'Install and test common residential plumbing fixtures.', 20)
on conflict do nothing;

insert into public.program_skills (program_id, skill_id, required, sort_order)
select 'PRG-TC-HVAC', id, true, sort_order from public.skills where trade = 'HVAC'
on conflict do nothing;
insert into public.program_skills (program_id, skill_id, required, sort_order)
select 'PRG-TC-ELEC', id, true, sort_order from public.skills where trade = 'Electrical'
on conflict do nothing;
insert into public.program_skills (program_id, skill_id, required, sort_order)
select 'PRG-LTP-PLUMB', id, true, sort_order from public.skills where trade = 'Plumbing'
on conflict do nothing;

insert into public.employer_profiles (id, business_name, city, state, service_trades, approved) values
  ('EMP-LIVEWIRE', 'LiveWire Electric', 'Texarkana', 'TX', array['Electrical'], true),
  ('EMP-AIRPRO', 'AirPro Texarkana', 'Texarkana', 'TX', array['HVAC'], true),
  ('EMP-REDRIVER', 'Red River Plumbing', 'Texarkana', 'TX', array['Plumbing'], true)
on conflict do nothing;
