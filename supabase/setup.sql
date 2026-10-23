-- Run this once in the Supabase Dashboard SQL Editor.
-- The included turf rows are illustrative demo listings, not real venues.
-- No user, booking, or payment records are fabricated.

begin;

create extension if not exists btree_gist with schema extensions;

grant usage on schema public to anon, authenticated;

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '' check (char_length(display_name) <= 100),
  phone text check (phone is null or char_length(phone) <= 32),
  account_type text not null default 'customer'
    check (account_type in ('customer', 'turf_owner')),
  created_at timestamptz not null default now()
);

create table if not exists public.turfs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users (id) on delete set null,
  name text not null check (char_length(name) between 2 and 120),
  description text not null default '',
  city text not null default 'Nairobi',
  area text not null,
  county text not null default 'Nairobi',
  hourly_rate_kes integer not null check (hourly_rate_kes > 0),
  surface text not null default 'Artificial grass',
  capacity smallint check (capacity is null or capacity > 0),
  image_url text,
  is_featured boolean not null default false,
  is_active boolean not null default false,
  is_demo boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.turfs alter column is_active set default false;

create table if not exists public.turf_availability (
  id uuid primary key default gen_random_uuid(),
  turf_id uuid not null references public.turfs (id) on delete cascade,
  day_of_week smallint not null check (day_of_week between 0 and 6),
  opens_at time not null,
  closes_at time not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint turf_availability_hours_check check (opens_at < closes_at),
  constraint turf_availability_start_unique unique (turf_id, day_of_week, opens_at)
);

create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  turf_id uuid not null references public.turfs (id) on delete restrict,
  customer_id uuid not null references auth.users (id) on delete restrict,
  start_at timestamptz not null,
  end_at timestamptz not null,
  status text not null default 'pending'
    check (status in ('pending', 'confirmed', 'declined', 'cancelled')),
  customer_note text not null default '' check (char_length(customer_note) <= 1000),
  created_at timestamptz not null default now(),
  constraint bookings_time_check check (start_at < end_at),
  constraint bookings_duration_check check (end_at <= start_at + interval '4 hours'),
  constraint bookings_no_overlapping_active_slots
    exclude using gist (
      turf_id with =,
      tstzrange(start_at, end_at, '[)') with &&
    )
    where (status in ('pending', 'confirmed'))
);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null unique references public.bookings (id) on delete restrict,
  customer_id uuid not null references auth.users (id) on delete restrict,
  amount_kes integer not null check (amount_kes > 0),
  currency text not null default 'KES' check (currency = 'KES'),
  provider text not null default 'mpesa' check (provider = 'mpesa'),
  status text not null default 'initiated'
    check (status in ('initiated', 'pending', 'succeeded', 'failed', 'refunded')),
  provider_reference text unique,
  created_at timestamptz not null default now(),
  paid_at timestamptz
);

create index if not exists turfs_active_featured_created_idx
  on public.turfs (is_featured desc, created_at desc)
  where is_active = true;

create index if not exists turfs_owner_id_idx
  on public.turfs (owner_id)
  where owner_id is not null;

create index if not exists turf_availability_turf_day_idx
  on public.turf_availability (turf_id, day_of_week)
  where is_active = true;

create index if not exists bookings_customer_created_idx
  on public.bookings (customer_id, created_at desc);

create index if not exists payments_customer_created_idx
  on public.payments (customer_id, created_at desc);

alter table public.profiles enable row level security;
alter table public.turfs enable row level security;
alter table public.turf_availability enable row level security;
alter table public.bookings enable row level security;
alter table public.payments enable row level security;

revoke all on table
  public.profiles,
  public.turfs,
  public.turf_availability,
  public.bookings,
  public.payments
from anon, authenticated;

grant select, insert (id, display_name, phone), update (display_name, phone)
  on table public.profiles to authenticated;

grant select on table public.turfs to anon, authenticated;
grant insert (
  owner_id, name, description, city, area, county,
  hourly_rate_kes, surface, capacity, image_url
) on table public.turfs to authenticated;
grant update (
  name, description, city, area, county,
  hourly_rate_kes, surface, capacity, image_url
) on table public.turfs to authenticated;
grant delete on table public.turfs to authenticated;

grant select on table public.turf_availability to anon, authenticated;
grant insert (turf_id, day_of_week, opens_at, closes_at)
  on table public.turf_availability to authenticated;
grant update (day_of_week, opens_at, closes_at, is_active)
  on table public.turf_availability to authenticated;
grant delete on table public.turf_availability to authenticated;

grant select on table public.bookings to authenticated;
grant insert (turf_id, customer_id, start_at, end_at, customer_note)
  on table public.bookings to authenticated;
grant update (status) on table public.bookings to authenticated;

-- Payments are writable/readable only by trusted server-side code using the
-- service role. Never place a service-role key in the browser.
-- Profile account_type and turf publication/featured flags are intentionally
-- excluded from client write grants; promote owners and approve listings
-- through trusted admin operations after verification.

drop policy if exists "Users can read their own profile" on public.profiles;
create policy "Users can read their own profile"
  on public.profiles for select to authenticated
  using (id = (select auth.uid()));

drop policy if exists "Users can create a customer profile" on public.profiles;
create policy "Users can create a customer profile"
  on public.profiles for insert to authenticated
  with check (
    id = (select auth.uid())
    and account_type = 'customer'
  );

drop policy if exists "Users can update their profile details" on public.profiles;
create policy "Users can update their profile details"
  on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

drop policy if exists "Public can view active turfs" on public.turfs;
create policy "Public can view active turfs"
  on public.turfs for select to anon, authenticated
  using (is_active or owner_id = (select auth.uid()));

drop policy if exists "Owners can create their own turfs" on public.turfs;
create policy "Owners can create their own turfs"
  on public.turfs for insert to authenticated
  with check (
    owner_id = (select auth.uid())
    and is_demo = false
    and exists (
      select 1
      from public.profiles p
      where p.id = (select auth.uid())
        and p.account_type = 'turf_owner'
    )
  );

drop policy if exists "Owners can update their own turfs" on public.turfs;
create policy "Owners can update their own turfs"
  on public.turfs for update to authenticated
  using (
    owner_id = (select auth.uid())
    and is_demo = false
  )
  with check (
    owner_id = (select auth.uid())
    and is_demo = false
  );

drop policy if exists "Owners can delete their own turfs" on public.turfs;
create policy "Owners can delete their own turfs"
  on public.turfs for delete to authenticated
  using (
    owner_id = (select auth.uid())
    and is_demo = false
  );

drop policy if exists "Public can view active turf availability" on public.turf_availability;
create policy "Public can view active turf availability"
  on public.turf_availability for select to anon, authenticated
  using (
    is_active
    and (
      exists (
        select 1
        from public.turfs t
        where t.id = turf_id
          and t.is_active
      )
      or exists (
        select 1
        from public.turfs t
        where t.id = turf_id
          and t.owner_id = (select auth.uid())
      )
    )
  );

drop policy if exists "Owners can add availability for their turfs" on public.turf_availability;
create policy "Owners can add availability for their turfs"
  on public.turf_availability for insert to authenticated
  with check (
    exists (
      select 1
      from public.turfs t
      join public.profiles p on p.id = (select auth.uid())
      where t.id = turf_id
        and t.owner_id = (select auth.uid())
        and p.account_type = 'turf_owner'
    )
  );

drop policy if exists "Owners can update availability for their turfs" on public.turf_availability;
create policy "Owners can update availability for their turfs"
  on public.turf_availability for update to authenticated
  using (
    exists (
      select 1 from public.turfs t
      where t.id = turf_id
        and t.owner_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.turfs t
      where t.id = turf_id
        and t.owner_id = (select auth.uid())
    )
  );

drop policy if exists "Owners can delete availability for their turfs" on public.turf_availability;
create policy "Owners can delete availability for their turfs"
  on public.turf_availability for delete to authenticated
  using (
    exists (
      select 1 from public.turfs t
      where t.id = turf_id
        and t.owner_id = (select auth.uid())
    )
  );

drop policy if exists "Customers and turf owners can view bookings" on public.bookings;
create policy "Customers and turf owners can view bookings"
  on public.bookings for select to authenticated
  using (
    customer_id = (select auth.uid())
    or exists (
      select 1 from public.turfs t
      where t.id = turf_id
        and t.owner_id = (select auth.uid())
    )
  );

drop policy if exists "Customers can request active turf bookings" on public.bookings;
create policy "Customers can request active turf bookings"
  on public.bookings for insert to authenticated
  with check (
    customer_id = (select auth.uid())
    and status = 'pending'
    and exists (
      select 1
      from public.profiles p
      where p.id = (select auth.uid())
        and p.account_type = 'customer'
    )
    and exists (
      select 1 from public.turfs t
      where t.id = turf_id
        and t.is_active
        and not t.is_demo
    )
  );

drop policy if exists "Customers can cancel their pending bookings" on public.bookings;
create policy "Customers can cancel their pending bookings"
  on public.bookings for update to authenticated
  using (
    customer_id = (select auth.uid())
    and status = 'pending'
  )
  with check (
    customer_id = (select auth.uid())
    and status = 'cancelled'
  );

drop policy if exists "Turf owners can manage their booking requests" on public.bookings;
create policy "Turf owners can manage their booking requests"
  on public.bookings for update to authenticated
  using (
    exists (
      select 1 from public.turfs t
      where t.id = turf_id
        and t.owner_id = (select auth.uid())
    )
  )
  with check (
    status in ('confirmed', 'declined', 'cancelled')
    and exists (
      select 1 from public.turfs t
      where t.id = turf_id
        and t.owner_id = (select auth.uid())
    )
  );

insert into public.turfs (
  id,
  name,
  description,
  city,
  area,
  county,
  hourly_rate_kes,
  surface,
  capacity,
  image_url,
  is_featured,
  is_active,
  is_demo
)
values
  (
    'a7398c3f-53fb-48e4-a6cc-100000000001',
    'Sample — Riverside 5-a-side',
    'Illustrative listing only. Replace with the real venue address, facilities, and booking terms.',
    'Nairobi',
    'Riverside',
    'Nairobi',
    4500,
    'Artificial grass',
    10,
    'https://images.unsplash.com/photo-1522778119026-d647f0596c20?auto=format&fit=crop&w=1100&q=80',
    true,
    true,
    true
  ),
  (
    'a7398c3f-53fb-48e4-a6cc-100000000002',
    'Sample — Kilimani Arena',
    'Illustrative listing only. Replace with the real venue address, facilities, and booking terms.',
    'Nairobi',
    'Kilimani',
    'Nairobi',
    5000,
    'Artificial grass',
    12,
    'https://images.unsplash.com/photo-1574629810360-7efbbe195018?auto=format&fit=crop&w=1100&q=80',
    true,
    true,
    true
  ),
  (
    'a7398c3f-53fb-48e4-a6cc-100000000003',
    'Sample — Kasarani Community Pitch',
    'Illustrative listing only. Replace with the real venue address, facilities, and booking terms.',
    'Nairobi',
    'Kasarani',
    'Nairobi',
    3000,
    'Natural grass',
    22,
    'https://images.unsplash.com/photo-1529900748604-07564a03e7a6?auto=format&fit=crop&w=1100&q=80',
    false,
    true,
    true
  )
on conflict (id) do nothing;

commit;

-- After the script succeeds, verify the setup with:
-- select table_name
-- from information_schema.tables
-- where table_schema = 'public'
--   and table_name in ('profiles', 'turfs', 'turf_availability', 'bookings', 'payments')
-- order by table_name;
--
-- select id, name, area, hourly_rate_kes, is_demo
-- from public.turfs
-- order by created_at desc;
