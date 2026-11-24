alter table public.results add column if not exists play_ms bigint;
alter table public.results add column if not exists log text;

revoke insert, update, delete on public.results from anon, authenticated;
drop policy if exists "public insert" on public.results;

create or replace function public.submit_result(
  p_id text, p_name text, p_language text,
  p_score integer, p_level_reached integer, p_correct_words integer,
  p_max_combo integer, p_accuracy numeric, p_wpm numeric,
  p_play_ms bigint, p_log text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  toks text[];
  t text;
  lvl int := 1; lives int := 3; score int := 0; combo int := 0; max_combo int := 0;
  correct int := 0; killed int := 0; chars int := 0;
  target int; min_len int; max_len int;
  len int; mult numeric; wpm numeric;
  now_ms bigint := (extract(epoch from clock_timestamp()) * 1000)::bigint;
  v_name text := btrim(p_name);
begin
  if v_name is null or char_length(v_name) not between 1 and 20 then raise exception 'invalid name'; end if;
  if p_log is null or char_length(p_log) > 20000 then raise exception 'invalid log'; end if;
  if p_play_ms is null or p_play_ms < 1000 then raise exception 'invalid play time'; end if;

  if exists (select 1 from results where name = v_name and created_at > now_ms - 5000) then
    raise exception 'too many submissions';
  end if;
  if (select count(*) from results where created_at > now_ms - 60000) >= 60 then
    raise exception 'too many submissions';
  end if;

  toks := case when p_log = '' then array[]::text[] else string_to_array(p_log, ',') end;
  target := 10; min_len := 3; max_len := 5;

  foreach t in array toks loop
    if lives <= 0 then raise exception 'event after game over'; end if;
    if t = 'm' then
      combo := 0;
    elsif t = 'b' then
      lives := lives - 1; combo := 0;
    elsif t = 'L' then
      if killed < target then raise exception 'level not cleared'; end if;
      score := score + 50 * lvl + 25 * lives;
      lvl := lvl + 1; killed := 0;
      target := case lvl when 1 then 10 when 2 then 13 when 3 then 16 when 4 then 17 else 17 + (lvl - 4) end;
      min_len := case lvl when 1 then 3 when 2 then 4 when 3 then 5 else 6 end;
      max_len := case lvl when 1 then 5 when 2 then 6 when 3 then 8 else 20 end;
    elsif t ~ '^\d{1,2}$' then
      len := t::int;
      if killed >= target then raise exception 'word after level cleared'; end if;
      if len < min_len or len > max_len then raise exception 'bad word length'; end if;
      mult := case when combo >= 8 then 3 when combo >= 5 then 2 when combo >= 3 then 1.5 else 1 end;
      score := score + round((10 + 2 * len) * mult)::int;
      combo := combo + 1;
      if combo > max_combo then max_combo := combo; end if;
      correct := correct + 1; killed := killed + 1; chars := chars + len;
    else
      raise exception 'bad token';
    end if;
  end loop;

  if lives <> 0 then raise exception 'game not over'; end if;

  wpm := round((chars / 5.0) / (p_play_ms / 60000.0), 1);
  if wpm > 200 then raise exception 'wpm too high'; end if;

  if score <> p_score or lvl <> p_level_reached or correct <> p_correct_words
     or max_combo <> p_max_combo or abs(wpm - p_wpm) > 0.11 then
    raise exception 'result mismatch';
  end if;
  if p_accuracy is null or p_accuracy < 0 or p_accuracy > 100 then raise exception 'invalid accuracy'; end if;

  insert into results (id, name, score, level_reached, correct_words, accuracy, max_combo, wpm, language, created_at, play_ms, log)
  values (p_id, v_name, score, lvl, correct, p_accuracy, max_combo, wpm, p_language, now_ms, p_play_ms, p_log);
end;
$$;

revoke all on function public.submit_result(text, text, text, integer, integer, integer, integer, numeric, numeric, bigint, text) from public;
grant execute on function public.submit_result(text, text, text, integer, integer, integer, integer, numeric, numeric, bigint, text) to anon;
