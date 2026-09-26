-- Additive message queue. Run after 001. No existing financial rows are changed on installation.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '120s';
create table if not exists public.finance_notifications (
 id text primary key,
 settlement_id text not null,
 employee_id text not null,
 project_id text not null default '',
 channel_id text not null,
 content text not null,
 status text not null default 'pending' check(status in ('pending','sending','sent','failed','unknown')),
 attempts integer not null default 0,
 message_id text,
 last_error text,
 attempted_at timestamptz,
 next_attempt_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
alter table public.finance_notifications enable row level security;
revoke all on public.finance_notifications from public, anon, authenticated;
grant select, insert, update on public.finance_notifications to service_role;
-- paid_at is the recorded transfer time; the durable queue separately tracks message delivery.
-- This prevents the old bot from guessing a second message from the latest payment row.
create or replace function public.commit_finance_wallet(
  expected_revision bigint,
  wallet_data jsonb,
  payment_data jsonb default null,
  closed_project_ids text[] default '{}'
) returns bigint
language plpgsql security invoker set search_path = public
as $$
declare current_revision bigint; current_wallet jsonb; next_revision bigint; source_project record; invoice_lines jsonb; notice jsonb;
begin
  select revision, data into current_revision, current_wallet from public.finance_wallet where id = 1 for update;
  if current_revision is null then raise exception 'WALLET_NOT_INITIALIZED'; end if;
  if current_revision <> expected_revision then raise exception 'WALLET_CONFLICT'; end if;
  if wallet_data->>'version' <> '1' then raise exception 'INVALID_WALLET'; end if;
  if payment_data is not null then
    if (select count(distinct value->>'projectId') from jsonb_array_elements(payment_data->'lines')) <>
      (select count(distinct "Project_ID") from public.projects where "Project_ID" in
        (select value->>'projectId' from jsonb_array_elements(payment_data->'lines'))) then
      raise exception 'Project removed; refresh and reconcile wallet';
    end if;
    -- Lock source projects too, so an external status edit cannot race a cashout.
    for source_project in select p.* from public.projects p where p."Project_ID" in
      (select value->>'projectId' from jsonb_array_elements(payment_data->'lines')) for update
    loop
      if coalesce(source_project."Status", '') not in ('Approved', 'Paid', 'Closed') then raise exception 'Project approval changed; refresh wallet'; end if;
      if source_project."Payment_Status" in ('Paid', 'Closed') and not exists (
        select 1 from jsonb_array_elements(coalesce(current_wallet->'projects', '[]'::jsonb)) fp,
          lateral jsonb_array_elements(fp.value->'obligations') obligation
        where fp.value->>'id' = source_project."Project_ID" and obligation.value->>'settlementId' is not null
      ) then raise exception 'Project paid outside wallet; refresh and reconcile'; end if;
    end loop;
    insert into public.payments ("Employee ID", "Name", "Project ID", "Payment_Status", gross, tds_percent, net_paid, bonus, bonus_note, others_amount, paid_date, "Timestamp")
    values (payment_data->>'employeeId', payment_data->>'name', 'Wallet: ' || (payment_data->>'id'), 'Paid',
      (payment_data->>'gross')::numeric / 100,
      case when (payment_data->>'gross')::numeric = 0 then 0 else (payment_data->>'tds')::numeric * 100 / (payment_data->>'gross')::numeric end,
      (payment_data->>'net')::numeric / 100, (payment_data->>'bonus')::numeric / 100,
      payment_data->>'note', (payment_data->>'others')::numeric / 100, payment_data->>'date', now());
    update public.animators set total_earnings = coalesce(total_earnings, 0) + (payment_data->>'net')::numeric / 100
      where "Employee_ID" = payment_data->>'employeeId';
    select jsonb_agg(jsonb_build_object('project_id', item->>'projectId', 'title', (item->>'title') || ' / ' || (item->>'role'),
      'duration', item->>'seconds', 'amount', (item->>'gross')::numeric / 100, 'rate', (item->>'rate')::numeric))
      into invoice_lines from jsonb_array_elements(payment_data->'lines') item;
    insert into public.invoices (invoice_number, employee_id, legal_name, month_label, invoice_date, line_items, total_amount,
      bonus_amount, others_amount, tds_percent, tds_amount, net_payable, status)
    values ('W-' || (payment_data->>'id'), payment_data->>'employeeId', payment_data->>'name',
      to_char((payment_data->>'month' || '-01')::date, 'Mon YYYY'), payment_data->>'date', invoice_lines,
      (payment_data->>'gross')::numeric / 100, (payment_data->>'bonus')::numeric / 100, (payment_data->>'others')::numeric / 100,
      case when (payment_data->>'gross')::numeric = 0 then 0 else (payment_data->>'tds')::numeric * 100 / (payment_data->>'gross')::numeric end,
      (payment_data->>'tds')::numeric / 100, (payment_data->>'net')::numeric / 100, 'Paid');
  end if;
  if payment_data is not null then
    for notice in select value from jsonb_array_elements(coalesce(payment_data->'notifications','[]'::jsonb)) loop
      insert into public.finance_notifications(id,settlement_id,employee_id,project_id,channel_id,content)
      values(notice->>'id',payment_data->>'id',payment_data->>'employeeId',notice->>'projectId',notice->>'channelId',notice->>'content');
    end loop;
  end if;
  -- Leave client_paid_date untouched: paying an artist does not collect client money.
  if cardinality(closed_project_ids) > 0 then
    update public.projects set "Payment_Status" = 'Paid', "Status" = 'Paid', paid_at = now()
      where "Project_ID" = any(closed_project_ids);
  end if;
  -- Client receipts only change the receipt date, never production/team status.
  update public.projects p set client_paid_date = case when receipt.total >= (fp.value->>'revenue')::numeric
    and (fp.value->>'revenue')::numeric > 0 then receipt.last_date else null end
  from jsonb_array_elements(coalesce(wallet_data->'projects', '[]'::jsonb)) fp,
    lateral (select sum((e.value->>'amount')::numeric) as total, max(e.value->>'date') as last_date
      from jsonb_array_elements(coalesce(wallet_data->'entries', '[]'::jsonb)) e
      where e.value->>'kind' = 'receipt' and e.value->>'projectId' = fp.value->>'id') receipt
  where p."Project_ID" = fp.value->>'id' and receipt.total is not null
    -- Existing profit reports encode receipt state/cashout IDs here. Preserve it.
    and position('___' in coalesce(p.client_paid_date, '')) = 0;
  next_revision := current_revision + 1;
  update public.finance_wallet set data = wallet_data, revision = next_revision, updated_at = now() where id = 1;
  return next_revision;
end;
$$;
revoke all on function public.commit_finance_wallet(bigint, jsonb, jsonb, text[]) from public, anon, authenticated;
grant execute on function public.commit_finance_wallet(bigint, jsonb, jsonb, text[]) to service_role;


create or replace function public.claim_finance_notification(notice_id text)
returns setof public.finance_notifications language sql security invoker set search_path=public as $$
 update public.finance_notifications set status='sending',attempts=attempts+1,attempted_at=now(),updated_at=now(),last_error=null
 where id=notice_id and status in ('pending','failed') and (next_attempt_at is null or next_attempt_at <= now()) returning *;
$$;
revoke all on function public.claim_finance_notification(text) from public, anon, authenticated;
grant execute on function public.claim_finance_notification(text) to service_role;
notify pgrst, 'reload schema';
commit;
