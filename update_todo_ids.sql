-- Migration to update legacy ID references in todos table
-- ID Mapping:
-- "1" (Thalia) -> "1c42e44a-7e58-4c86-94ca-404061f8863d"
-- "2" (Heidy) -> "b7c2ff86-bf39-4a1f-8e35-73ca8c9bbcc6"
-- "3" (Anabella) -> "6bafcb97-6a1b-4224-adbb-1340b86ffeb9"
-- "4" (Esteban) -> "07d58adc-8c82-458d-ba48-f733ec706c7c"
-- "5" (Itzi) -> "cb5d2e6e-9046-4b22-b509-469076999d78"
-- "6" (Fer) -> "4ca49a9d-7ee5-4b54-8e93-bc4833de549a"

-- Update assigned_to
UPDATE todos SET assigned_to = REPLACE(assigned_to::text, '"1"', '"1c42e44a-7e58-4c86-94ca-404061f8863d"')::jsonb WHERE assigned_to::text LIKE '%"1"%';
UPDATE todos SET assigned_to = REPLACE(assigned_to::text, '"2"', '"b7c2ff86-bf39-4a1f-8e35-73ca8c9bbcc6"')::jsonb WHERE assigned_to::text LIKE '%"2"%';
UPDATE todos SET assigned_to = REPLACE(assigned_to::text, '"3"', '"6bafcb97-6a1b-4224-adbb-1340b86ffeb9"')::jsonb WHERE assigned_to::text LIKE '%"3"%';
UPDATE todos SET assigned_to = REPLACE(assigned_to::text, '"4"', '"07d58adc-8c82-458d-ba48-f733ec706c7c"')::jsonb WHERE assigned_to::text LIKE '%"4"%';
UPDATE todos SET assigned_to = REPLACE(assigned_to::text, '"5"', '"cb5d2e6e-9046-4b22-b509-469076999d78"')::jsonb WHERE assigned_to::text LIKE '%"5"%';
UPDATE todos SET assigned_to = REPLACE(assigned_to::text, '"6"', '"4ca49a9d-7ee5-4b54-8e93-bc4833de549a"')::jsonb WHERE assigned_to::text LIKE '%"6"%';

-- Update completed_by
UPDATE todos SET completed_by = REPLACE(completed_by::text, '"1"', '"1c42e44a-7e58-4c86-94ca-404061f8863d"')::jsonb WHERE completed_by::text LIKE '%"1"%';
UPDATE todos SET completed_by = REPLACE(completed_by::text, '"2"', '"b7c2ff86-bf39-4a1f-8e35-73ca8c9bbcc6"')::jsonb WHERE completed_by::text LIKE '%"2"%';
UPDATE todos SET completed_by = REPLACE(completed_by::text, '"3"', '"6bafcb97-6a1b-4224-adbb-1340b86ffeb9"')::jsonb WHERE completed_by::text LIKE '%"3"%';
UPDATE todos SET completed_by = REPLACE(completed_by::text, '"4"', '"07d58adc-8c82-458d-ba48-f733ec706c7c"')::jsonb WHERE completed_by::text LIKE '%"4"%';
UPDATE todos SET completed_by = REPLACE(completed_by::text, '"5"', '"cb5d2e6e-9046-4b22-b509-469076999d78"')::jsonb WHERE completed_by::text LIKE '%"5"%';
UPDATE todos SET completed_by = REPLACE(completed_by::text, '"6"', '"4ca49a9d-7ee5-4b54-8e93-bc4833de549a"')::jsonb WHERE completed_by::text LIKE '%"6"%';

-- Update shocked_users
UPDATE todos SET shocked_users = REPLACE(shocked_users::text, '"1"', '"1c42e44a-7e58-4c86-94ca-404061f8863d"')::jsonb WHERE shocked_users::text LIKE '%"1"%';
UPDATE todos SET shocked_users = REPLACE(shocked_users::text, '"2"', '"b7c2ff86-bf39-4a1f-8e35-73ca8c9bbcc6"')::jsonb WHERE shocked_users::text LIKE '%"2"%';
UPDATE todos SET shocked_users = REPLACE(shocked_users::text, '"3"', '"6bafcb97-6a1b-4224-adbb-1340b86ffeb9"')::jsonb WHERE shocked_users::text LIKE '%"3"%';
UPDATE todos SET shocked_users = REPLACE(shocked_users::text, '"4"', '"07d58adc-8c82-458d-ba48-f733ec706c7c"')::jsonb WHERE shocked_users::text LIKE '%"4"%';
UPDATE todos SET shocked_users = REPLACE(shocked_users::text, '"5"', '"cb5d2e6e-9046-4b22-b509-469076999d78"')::jsonb WHERE shocked_users::text LIKE '%"5"%';
UPDATE todos SET shocked_users = REPLACE(shocked_users::text, '"6"', '"4ca49a9d-7ee5-4b54-8e93-bc4833de549a"')::jsonb WHERE shocked_users::text LIKE '%"6"%';

-- Also update created_by column which is a simple text/UUID column (not array)
UPDATE todos SET created_by = '1c42e44a-7e58-4c86-94ca-404061f8863d' WHERE created_by = '1';
UPDATE todos SET created_by = 'b7c2ff86-bf39-4a1f-8e35-73ca8c9bbcc6' WHERE created_by = '2';
UPDATE todos SET created_by = '6bafcb97-6a1b-4224-adbb-1340b86ffeb9' WHERE created_by = '3';
UPDATE todos SET created_by = '07d58adc-8c82-458d-ba48-f733ec706c7c' WHERE created_by = '4';
UPDATE todos SET created_by = 'cb5d2e6e-9046-4b22-b509-469076999d78' WHERE created_by = '5';
UPDATE todos SET created_by = '4ca49a9d-7ee5-4b54-8e93-bc4833de549a' WHERE created_by = '6';
