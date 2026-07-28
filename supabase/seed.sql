-- Demo seed data. Replace :user_id with a real auth.users id, e.g.:
--   psql "$DB_URL" -v user_id="'00000000-0000-0000-0000-000000000000'" -f supabase/seed.sql
-- (Signing up through the app already creates profile/preferences/categories
-- via the handle_new_user trigger; this seed adds example content.)

\set user_id :user_id

insert into public.time_blocks (user_id, name, description, icon, color, start_time, end_time, days_of_week, sort_order)
values
  (:user_id, 'Morning Routine', 'Wake up, hydrate, stretch', 'sunrise',   '#fbbf24', '06:30', '07:30', '{0,1,2,3,4,5,6}', 0),
  (:user_id, 'Gym',             'Strength + conditioning',   'dumbbell',  '#f87171', '07:30', '09:00', '{1,3,5}',         1),
  (:user_id, 'University',      'Lectures and tutorials',    'graduation-cap', '#60a5fa', '10:00', '15:00', '{1,2,3,4,5}', 2),
  (:user_id, 'Study',           'Deep work block',           'book-open', '#a78bfa', '16:00', '18:00', '{1,2,3,4,5}',     3),
  (:user_id, 'Basketball',      'Pickup games',              'trophy',    '#fb923c', '18:30', '20:00', '{2,4}',           4),
  (:user_id, 'Reading',         'Wind down with a book',     'library',   '#34d399', '21:00', '22:00', '{0,1,2,3,4,5,6}', 5),
  (:user_id, 'Sleep',           'Lights out',                'moon',      '#64748b', '22:30', '06:30', '{0,1,2,3,4,5,6}', 6);

insert into public.reminders
  (user_id, title, description, priority, timezone, start_date, reminder_time, duration_minutes, rrule, notify, notify_minutes_before)
values
  (:user_id, 'Drink water',        'Two glasses to start the day', 'low',    'UTC', current_date, '07:00', 5,  'FREQ=DAILY',                        true, 0),
  (:user_id, 'Gym session',        'Push / pull / legs rotation',  'high',   'UTC', current_date, '07:30', 90, 'FREQ=WEEKLY;BYDAY=MO,WE,FR',        true, 15),
  (:user_id, 'Review lecture notes','30 minutes of active recall', 'medium', 'UTC', current_date, '16:00', 30, 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR',  true, 10),
  (:user_id, 'Call family',        '',                             'medium', 'UTC', current_date, '19:00', 30, 'FREQ=WEEKLY;BYDAY=SU',              true, 30),
  (:user_id, 'Pay rent',           'Transfer before the 1st',      'urgent', 'UTC', current_date, '09:00', 15, 'FREQ=MONTHLY;BYMONTHDAY=28',        true, 60),
  (:user_id, 'Read 20 pages',      'Current book',                 'none',   'UTC', current_date, '21:00', 40, 'FREQ=DAILY',                        false, 0);
