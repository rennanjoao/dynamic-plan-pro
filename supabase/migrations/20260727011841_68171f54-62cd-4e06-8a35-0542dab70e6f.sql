drop function if exists public.refresh_coach_ai_profile();

create or replace function public.refresh_coach_ai_profile(p_coach_id uuid default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_coach_id is not null
     and auth.uid() is not null
     and p_coach_id <> auth.uid()
     and not public.has_role(auth.uid(), 'admin'::public.app_role) then
    raise exception 'not authorized to refresh another coach profile';
  end if;

  with versoes_validas as (
    select pv.coach_id, pv.created_at, pv.payload
    from public.protocol_versions pv
    where jsonb_typeof(pv.payload->'workouts') = 'array'
      and (p_coach_id is null or pv.coach_id = p_coach_id)
  ),
  dias as (
    select coach_id, created_at, dia.value as dia
    from versoes_validas
    cross join lateral jsonb_array_elements(payload->'workouts') as dia(value)
  ),
  dias_validos as (
    select * from dias where jsonb_typeof(dia->'exercises') = 'array'
  ),
  exercicios_raw as (
    select coach_id, created_at, ex.value as exercise
    from dias_validos
    cross join lateral jsonb_array_elements(dia->'exercises') as ex(value)
  ),
  exercicios as (
    select
      coach_id,
      created_at,
      trim(exercise->>'name') as display_name,
      lower(trim(unaccent(exercise->>'name'))) as exercise_key,
      exercise->>'sets' as sets,
      exercise->>'reps' as reps,
      exercise->>'cadence' as cadence,
      exercise->>'rest' as rest
    from exercicios_raw
    where jsonb_typeof(exercise) = 'object'
      and coalesce(trim(exercise->>'name'), '') <> ''
  ),
  ranked as (
    select
      *,
      row_number() over (partition by coach_id, exercise_key order by created_at desc) as rn,
      count(*) over (partition by coach_id, exercise_key) as total
    from exercicios
  )
  insert into public.coach_ai_profile
    (coach_id, exercise_key, display_name, sets, reps, cadence, rest, sample_count, updated_at)
  select coach_id, exercise_key, display_name, sets, reps, cadence, rest, total, now()
  from ranked
  where rn = 1
  on conflict (coach_id, exercise_key) do update set
    display_name = excluded.display_name,
    sets = excluded.sets,
    reps = excluded.reps,
    cadence = excluded.cadence,
    rest = excluded.rest,
    sample_count = excluded.sample_count,
    updated_at = now();
end;
$$;

revoke all on function public.refresh_coach_ai_profile(uuid) from public, anon;
grant execute on function public.refresh_coach_ai_profile(uuid) to authenticated;