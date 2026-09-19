-- Run once in this project's Supabase SQL editor. Existing records are not deleted.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '120s';
create table if not exists public.finance_wallet (
  id integer primary key check (id = 1),
  revision bigint not null default 0,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.finance_wallet enable row level security;
revoke all on public.finance_wallet from anon, authenticated;
grant select, insert, update on public.finance_wallet to service_role;

-- A single locked revision makes payout, project status, payment history and
-- wallet snapshots one transaction. The server calculates all amounts.
create or replace function public.commit_finance_wallet(
  expected_revision bigint,
  wallet_data jsonb,
  payment_data jsonb default null,
  closed_project_ids text[] default '{}'
) returns bigint
language plpgsql security invoker set search_path = public
as $$
declare current_revision bigint; current_wallet jsonb; next_revision bigint; source_project record; invoice_lines jsonb;
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
  -- Leave client_paid_date untouched: paying an artist does not collect client money.
  if cardinality(closed_project_ids) > 0 then
    update public.projects set "Payment_Status" = 'Paid', "Status" = 'Paid'
      where "Project_ID" = any(closed_project_ids);
  end if;
  -- Client receipts only change the receipt date, never production/team status.
  update public.projects p set client_paid_date = case when receipt.total >= (fp.value->>'revenue')::numeric
    and (fp.value->>'revenue')::numeric > 0 then receipt.last_date else null end
  from jsonb_array_elements(coalesce(wallet_data->'projects', '[]'::jsonb)) fp,
    lateral (select sum((e.value->>'amount')::numeric) as total, max(e.value->>'date') as last_date
      from jsonb_array_elements(coalesce(wallet_data->'entries', '[]'::jsonb)) e
      where e.value->>'kind' = 'receipt' and e.value->>'projectId' = fp.value->>'id') receipt
  where p."Project_ID" = fp.value->>'id' and receipt.total is not null;
  next_revision := current_revision + 1;
  update public.finance_wallet set data = wallet_data, revision = next_revision, updated_at = now() where id = 1;
  return next_revision;
end;
$$;
revoke all on function public.commit_finance_wallet(bigint, jsonb, jsonb, text[]) from public, anon, authenticated;
grant execute on function public.commit_finance_wallet(bigint, jsonb, jsonb, text[]) to service_role;

-- Other dashboard/bot routes may update delivery/notification status, but must
-- not rewrite or delete the financial receipt produced by a wallet cashout.
create or replace function public.protect_wallet_receipt() returns trigger
language plpgsql set search_path = public as $$
declare fields text[]; field text;
begin
  if tg_table_name = 'invoices' then
    if coalesce(old.invoice_number, '') not like 'W-%' then
      if tg_op = 'DELETE' then return old; else return new; end if;
    end if;
    fields := array['invoice_number','employee_id','month_label','invoice_date','line_items','total_amount','bonus_amount','others_amount','tds_percent','tds_amount','net_payable'];
  else
    if coalesce(old."Project ID", '') not like 'Wallet: %' then
      if tg_op = 'DELETE' then return old; else return new; end if;
    end if;
    fields := array['Employee ID','Project ID','gross','tds_percent','net_paid','bonus','bonus_note','others_amount','paid_date','Timestamp'];
  end if;
  if tg_op = 'DELETE' then raise exception 'Wallet receipts cannot be deleted'; end if;
  foreach field in array fields loop
    if (to_jsonb(new)->field) is distinct from (to_jsonb(old)->field) then raise exception 'Wallet financial amounts are locked'; end if;
  end loop;
  return new;
end;
$$;
-- Add missing protection rules; never remove or silently replace an existing trigger.
do $install_wallet_triggers$
begin
  if not exists (select 1 from pg_trigger where tgrelid = 'public.invoices'::regclass and tgname = 'protect_wallet_invoice') then
    create trigger protect_wallet_invoice before update or delete on public.invoices for each row execute function public.protect_wallet_receipt();
  elsif not exists (select 1 from pg_trigger where tgrelid = 'public.invoices'::regclass and tgname = 'protect_wallet_invoice' and tgfoid = 'public.protect_wallet_receipt()'::regprocedure and tgtype = 27 and tgenabled = 'O') then
    raise exception 'Existing invoice trigger differs; migration stopped without replacing it';
  end if;
  if not exists (select 1 from pg_trigger where tgrelid = 'public.payments'::regclass and tgname = 'protect_wallet_payment') then
    create trigger protect_wallet_payment before update or delete on public.payments for each row execute function public.protect_wallet_receipt();
  elsif not exists (select 1 from pg_trigger where tgrelid = 'public.payments'::regclass and tgname = 'protect_wallet_payment' and tgfoid = 'public.protect_wallet_receipt()'::regprocedure and tgtype = 27 and tgenabled = 'O') then
    raise exception 'Existing payment trigger differs; migration stopped without replacing it';
  end if;
end;
$install_wallet_triggers$;
notify pgrst, 'reload schema';
commit;
