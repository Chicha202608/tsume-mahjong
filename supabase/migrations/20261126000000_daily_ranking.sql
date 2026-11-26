begin;

create table public.daily_ranking_results (
  id bigint generated always as identity primary key,
  round_date date not null,
  player_key text not null check (length(player_key) = 64),
  score integer not null check (score >= 0),
  nickname text not null default '名無し' check (char_length(nickname) between 1 and 20),
  unique (round_date, player_key)
);

alter table public.daily_ranking_results enable row level security;
revoke all on public.daily_ranking_results from public, anon, authenticated;
grant select, insert, update on public.daily_ranking_results to service_role;
grant usage, select on sequence public.daily_ranking_results_id_seq to service_role;

create index daily_ranking_score_order
  on public.daily_ranking_results (round_date, score desc, id);

create function public.save_daily_ranking(p_date date, p_player_key text, p_score integer, p_name text)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  own_row jsonb;
  participant_count bigint;
  top_rows jsonb;
begin
  if p_score is not null then
    insert into public.daily_ranking_results (round_date, player_key, score)
    values (p_date, p_player_key, p_score)
    on conflict (round_date, player_key) do nothing;
  elsif p_name is not null then
    update public.daily_ranking_results
    set nickname = p_name
    where round_date = p_date and player_key = p_player_key;
  end if;

  -- Take a single snapshot of the board for the top rows and the player's rank.
  with own as (
    select * from public.daily_ranking_results where round_date = p_date and player_key = p_player_key
  ), leaders as (
    select id, nickname, score, rank() over (order by score desc) as place
    from (
      select id, nickname, score from public.daily_ranking_results
      where round_date = p_date order by score desc, id limit 10
    ) as top_results
  ), totals as (
    select count(*) as participants, count(*) filter (where entry.score > own.score) + 1 as place
    from own join public.daily_ranking_results as entry on entry.round_date = p_date
  )
  select jsonb_build_object('id', own.id::text, 'rank', totals.place,
      'name', own.nickname, 'score', own.score, 'isYou', true), totals.participants,
    (select jsonb_agg(jsonb_build_object(
      'id', id::text, 'rank', place, 'name', nickname, 'score', score, 'isYou', id = own.id
    ) order by place, id) from leaders)
  into own_row, participant_count, top_rows
  from own cross join totals;

  if not found then return null; end if;
  return jsonb_build_object(
    'rows', top_rows,
    'yours', own_row,
    'participants', participant_count
  );
end;
$$;

revoke all on function public.save_daily_ranking(date, text, integer, text) from public, anon, authenticated;
grant execute on function public.save_daily_ranking(date, text, integer, text) to service_role;

commit;
